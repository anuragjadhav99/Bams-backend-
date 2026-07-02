/**
 * Authentication Service.
 *
 * Business logic for all authentication flows:
 *   • Google OAuth 2.0 — verify ID token, create/link user, issue tokens
 *   • Email OTP — generate, hash, send, verify with security constraints
 *   • Refresh Token Rotation — SHA256-hashed tokens, theft detection
 *   • Logout — hash + delete specific token from DB
 *   • Profile fetch — sanitised user object for /me endpoint
 *
 * Security rules enforced here:
 *   ❌ Never log OTP plaintext, raw refresh tokens, or JWT secrets
 *   ✅ Log auth events with userId, email, provider, ip (no secrets)
 *   ✅ All refresh tokens stored as SHA256 hashes
 *   ✅ OTP stored as bcrypt hash (cost 10)
 */

"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");

const { User, OTP, RefreshToken } = require("../models");
const { env } = require("../config/env");
const logger = require("../config/logger");
const { sendOTPEmail } = require("./emailService");

// ── Constants ────────────────────────────────────────────────────────

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

const ACCESS_TOKEN_EXPIRY = "15m";

// Cookie / DB lifetime for refresh tokens
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Generate a short-lived JWT access token.
 *
 * @param {Object} user - Mongoose User document
 * @returns {string} signed JWT
 */
function generateAccessToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Generate a cryptographically random raw refresh token.
 * The raw value goes into the cookie; the hash is stored in the DB.
 *
 * @returns {string} 128-char hex string
 */
function generateRawRefreshToken() {
  return crypto.randomBytes(64).toString("hex");
}

/**
 * Format a Mongoose User document into a safe client-facing object.
 * Never returns sensitive fields (OTP data, hashes, etc.).
 *
 * @param {Object} user
 * @returns {Object}
 */
function formatUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar || null,
    phone: user.phone || null,
    loginMethod: user.loginMethod || "email_otp",
    googleLinked: !!user.googleId,
    lastLoginAt: user.lastLoginAt || null,
    createdAt: user.createdAt,
  };
}

/**
 * Persist a new refresh token (hashed) in the database.
 *
 * @param {string}   rawToken
 * @param {ObjectId} userId
 * @param {Object}   req  - Express request for ip / userAgent
 * @returns {Promise<void>}
 */
async function saveRefreshToken(rawToken, userId, req) {
  const hash = RefreshToken.hashToken(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await RefreshToken.create({
    token: hash,
    user: userId,
    expiresAt,
    ip: req?.ip || req?.headers?.["x-forwarded-for"] || "unknown",
    userAgent: req?.headers?.["user-agent"] || "unknown",
  });
}

// ── Auth flows ───────────────────────────────────────────────────────

/**
 * Authenticate via Google OAuth 2.0.
 *
 * • Verifies the idToken with google-auth-library.
 * • Creates a new user on first login or links an existing account.
 * • Issues access token (JWT) + raw refresh token.
 * • Stores hashed refresh token in DB.
 *
 * @param {string} idToken
 * @param {Object} req - Express request
 * @returns {Promise<{ accessToken: string, rawRefreshToken: string, user: Object }>}
 */
async function googleLogin(idToken, req) {
  const ip = req?.ip || req?.headers?.["x-forwarded-for"] || "unknown";

  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
  } catch (err) {
    logger.auth("login_failed", { provider: "google", ip, error: err.message });
    const e = new Error("Google login failed — invalid token");
    e.statusCode = 401;
    throw e;
  }

  const payload = ticket.getPayload();
  if (!payload?.email) {
    const e = new Error("Invalid Google token — no email");
    e.statusCode = 401;
    throw e;
  }

  const { sub: googleId, email, name, picture } = payload;

  // Find by googleId first, then fall back to email (account linking)
  let user = await User.findOne({ $or: [{ googleId }, { email }] });

  if (user) {
    if (!user.googleId) user.googleId = googleId; // Link account
    user.authProvider = "google";
    user.loginMethod = "google";
    user.avatar = picture || user.avatar;
    user.lastLoginAt = new Date();
    await user.save();
  } else {
    user = await User.create({
      name: name || email.split("@")[0],
      email,
      googleId,
      authProvider: "google",
      loginMethod: "google",
      avatar: picture || null,
      lastLoginAt: new Date(),
    });
  }

  if (!user.isActive()) {
    logger.auth("login_failed", { provider: "google", userId: user._id, ip, error: "Account suspended" });
    const e = new Error("Account is suspended");
    e.statusCode = 403;
    throw e;
  }

  const accessToken = generateAccessToken(user);
  const rawRefreshToken = generateRawRefreshToken();
  await saveRefreshToken(rawRefreshToken, user._id, req);

  logger.auth("login", { userId: user._id, email: user.email, provider: "google", ip });

  return { accessToken, rawRefreshToken, user: formatUser(user) };
}

/**
 * Generate and send a 6-digit OTP to the given email.
 *
 * Security constraints enforced:
 *   1. 30-second resend delay — checked via createdAt of existing OTP doc.
 *   2. Maximum 5 resends in this window.
 *   3. Previous OTP document is deleted before creating a new one.
 *   4. Plaintext OTP is discarded after sendOTPEmail() returns.
 *
 * @param {string} email
 * @returns {Promise<{ success: true }>}
 */
async function sendOTP(email) {
  const normalizedEmail = email.toLowerCase().trim();

  // Check for existing OTP document
  const existing = await OTP.findOne({ email: normalizedEmail });

  if (existing) {
    // Enforce 30-second delay between resends (using createdAt of current doc)
    const secondsSinceCreated = (Date.now() - existing.createdAt.getTime()) / 1000;
    if (secondsSinceCreated < 30) {
      const waitSec = Math.ceil(30 - secondsSinceCreated);
      const e = new Error(`Please wait ${waitSec} seconds before resending`);
      e.statusCode = 429;
      throw e;
    }

    // Enforce maximum 5 resends
    if (existing.resends >= 5) {
      const e = new Error("Maximum resend limit reached");
      e.statusCode = 429;
      throw e;
    }
  }

  // Carry the resend count forward so it persists across deletes
  const nextResends = existing ? existing.resends + 1 : 0;

  // Delete the old doc before creating a new one (invalidates previous OTP)
  if (existing) {
    await OTP.deleteOne({ _id: existing._id });
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = await bcrypt.hash(otp, 10);

  await OTP.create({
    email: normalizedEmail,
    otpHash,
    resends: nextResends,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
  });

  // Send email — plaintext OTP is not stored or logged after this call
  await sendOTPEmail(normalizedEmail, otp);

  logger.auth("otp_sent", { email: normalizedEmail });

  return { success: true };
}

/**
 * Verify a 6-digit OTP and authenticate/create the user.
 *
 * Security constraints enforced:
 *   1. OTP document must exist (not expired via TTL).
 *   2. Maximum 5 failed attempts before doc is deleted.
 *   3. bcrypt comparison of plaintext against stored hash.
 *   4. OTP document deleted immediately on success (prevents replay).
 *   5. User created via findOneAndUpdate upsert (atomic, no duplicates).
 *
 * @param {string} email
 * @param {string} otpCode    - 6-digit plaintext code from the user
 * @param {Object} req        - Express request (for ip / userAgent)
 * @returns {Promise<{ accessToken: string, rawRefreshToken: string, user: Object }>}
 */
async function verifyOTP(email, otpCode, req) {
  const normalizedEmail = email.toLowerCase().trim();
  const ip = req?.ip || req?.headers?.["x-forwarded-for"] || "unknown";

  // Step 1: Find the OTP document
  const otpDoc = await OTP.findOne({ email: normalizedEmail });
  if (!otpDoc) {
    const e = new Error("OTP expired or not found");
    e.statusCode = 400;
    throw e;
  }

  // Step 2: Too many attempts — delete and reject
  if (otpDoc.attempts >= 5) {
    await OTP.deleteOne({ _id: otpDoc._id });
    logger.auth("login_failed", { email: normalizedEmail, ip, error: "Too many OTP attempts" });
    const e = new Error("Too many attempts. Request a new OTP.");
    e.statusCode = 400;
    throw e;
  }

  // Step 3: Compare OTP
  const valid = await bcrypt.compare(otpCode, otpDoc.otpHash);
  if (!valid) {
    otpDoc.attempts += 1;
    await otpDoc.save();
    logger.auth("login_failed", { email: normalizedEmail, ip, error: "Invalid OTP" });
    const e = new Error("Invalid OTP");
    e.statusCode = 400;
    throw e;
  }

  // Step 4: Delete OTP doc immediately (prevents replay)
  await OTP.deleteOne({ _id: otpDoc._id });

  // Step 5: Find or create user atomically via upsert
  const user = await User.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $set: {
        lastLoginAt: new Date(),
        authProvider: "email_otp",
        loginMethod: "email_otp",
        failedOTPAttempts: 0,
      },
      $setOnInsert: {
        name: normalizedEmail.split("@")[0],
        email: normalizedEmail,
      },
    },
    { upsert: true, new: true }
  );

  if (!user.isActive()) {
    logger.auth("login_failed", { email: normalizedEmail, ip, error: "Account suspended" });
    const e = new Error("Account is suspended");
    e.statusCode = 403;
    throw e;
  }

  // Step 6: Issue tokens
  const accessToken = generateAccessToken(user);
  const rawRefreshToken = generateRawRefreshToken();
  await saveRefreshToken(rawRefreshToken, user._id, req);

  logger.auth("login", { userId: user._id, email: user.email, provider: "email_otp", ip });

  return { accessToken, rawRefreshToken, user: formatUser(user) };
}

/**
 * Rotate a refresh token — validate, delete old, issue new.
 *
 * Delegates the core rotation logic to RefreshToken.findAndRotate().
 * If the token has already been rotated (reuse attack), findAndRotate
 * throws 401 and the caller clears the cookie.
 *
 * @param {string} rawToken - Raw token from the httpOnly cookie
 * @param {Object} req      - Express request
 * @returns {Promise<{ accessToken: string, newRawRefreshToken: string, user: Object }>}
 */
async function rotateRefreshToken(rawToken, req) {
  const ip = req?.ip || req?.headers?.["x-forwarded-for"] || "unknown";

  // findAndRotate handles: hash lookup, theft detection, delete old, create new
  const { newRawToken: newRawRefreshToken, userId } = await RefreshToken.findAndRotate(rawToken, req);

  const user = await User.findById(userId);
  if (!user || !user.isActive()) {
    const e = new Error("User not found or suspended");
    e.statusCode = 401;
    throw e;
  }

  const accessToken = generateAccessToken(user);

  logger.auth("token_refresh", { userId: user._id, ip });

  return { accessToken, newRawRefreshToken, user: formatUser(user) };
}

/**
 * Logout — revoke the specific refresh token and log the event.
 *
 * The raw token from the cookie is hashed and the matching DB doc deleted.
 * If the token is missing or already expired, we still return success
 * (idempotent logout).
 *
 * @param {string} userId
 * @param {string|undefined} rawToken - Raw token from the httpOnly cookie
 * @returns {Promise<void>}
 */
async function logout(userId, rawToken) {
  if (rawToken) {
    const hash = RefreshToken.hashToken(rawToken);
    await RefreshToken.deleteOne({ user: userId, token: hash });
  }
  logger.auth("logout", { userId });
}

/**
 * Fetch the sanitised profile for the currently authenticated user.
 *
 * @param {string} userId
 * @returns {Promise<Object>}
 */
async function getUserProfile(userId) {
  const user = await User.findById(userId);
  if (!user || !user.isActive()) {
    const e = new Error("User not found or inactive");
    e.statusCode = 404;
    throw e;
  }
  return formatUser(user);
}

// ── Exports ──────────────────────────────────────────────────────────

module.exports = {
  googleLogin,
  sendOTP,
  verifyOTP,
  rotateRefreshToken,
  logout,
  getUserProfile,
  // Exposed for testing
  generateAccessToken,
  generateRawRefreshToken,
  formatUser,
};
