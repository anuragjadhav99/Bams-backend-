/**
 * Authentication Service.
 *
 * Business logic for authentication flows:
 *   • Google OAuth verification + user creation
 *   • OTP generation, hashing, verification
 *   • JWT token generation (access + refresh)
 *   • Session management for logout
 *
 * Security rules:
 *   ❌ Never logs OTP values, tokens, or secrets
 *   ✅ Logs auth events with userId, email, provider
 */

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const { User, Session } = require("../models");
const { env } = require("../config/env");
const logger = require("../config/logger");
const { sendOTPEmail } = require("./emailService");

/** Google OAuth client singleton. */
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

/** OTP expiry time in milliseconds (10 minutes). */
const OTP_EXPIRY_MS = 10 * 60 * 1000;

/** Access token expiry. */
const ACCESS_TOKEN_EXPIRY = "15m";

/** Refresh token expiry. */
const REFRESH_TOKEN_EXPIRY = "7d";

/**
 * Generate JWT access + refresh token pair.
 *
 * @param {Object} user - Mongoose User document
 * @param {string} user._id
 * @param {string} user.role
 * @returns {{ accessToken: string, refreshToken: string }}
 */
function generateTokens(user) {
  const payload = { id: user._id.toString(), role: user.role };

  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });

  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });

  return { accessToken, refreshToken };
}

/**
 * Format user object for client response.
 * Strips sensitive fields.
 *
 * @param {Object} user - Mongoose User document
 * @returns {Object}
 */
function formatUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    phone: user.phone || null,
  };
}

/**
 * Authenticate via Google OAuth.
 *
 * 1. Verify the Google ID token
 * 2. Find or create the user
 * 3. Generate JWT tokens
 *
 * @param {string} idToken - Google ID token from the client
 * @returns {Promise<{ accessToken, refreshToken, user }>}
 */
async function googleLogin(idToken) {
  // Verify the Google token
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });

  const googlePayload = ticket.getPayload();

  if (!googlePayload || !googlePayload.email) {
    throw Object.assign(new Error("Invalid Google token"), { statusCode: 401 });
  }

  const { sub: googleId, email, name, picture } = googlePayload;

  // Find existing user by googleId or email
  let user = await User.findOne({
    $or: [{ googleId }, { email }],
  });

  if (user) {
    // Update Google info if needed
    if (!user.googleId) {
      user.googleId = googleId;
      user.authProvider = "google";
    }
    user.avatar = picture || user.avatar;
    user.lastLoginAt = new Date();
    await user.save();
  } else {
    // Create new user
    user = await User.create({
      name: name || email.split("@")[0],
      email,
      googleId,
      authProvider: "google",
      avatar: picture || null,
      lastLoginAt: new Date(),
    });
  }

  if (!user.isActive()) {
    throw Object.assign(new Error("Account is suspended"), { statusCode: 403 });
  }

  const tokens = generateTokens(user);

  logger.auth("login", {
    userId: user._id,
    email: user.email,
    provider: "google",
  });

  return {
    ...tokens,
    user: formatUser(user),
  };
}

/**
 * Generate and send an OTP to the given email.
 *
 * 1. Generate a random 6-digit OTP
 * 2. Hash it with bcrypt
 * 3. Store hash + expiry on the User document (create user if needed)
 * 4. Send the OTP via email
 *
 * @param {string} email
 * @returns {Promise<void>}
 */
async function sendOTP(email) {
  // Generate 6-digit OTP
  const otp = String(Math.floor(100000 + Math.random() * 900000));

  // Hash the OTP for storage
  const otpHash = await bcrypt.hash(otp, 10);
  const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  // Find or create user — need to select hidden OTP fields
  let user = await User.findOne({ email }).select("+otpHash +otpExpiresAt");

  if (user) {
    user.otpHash = otpHash;
    user.otpExpiresAt = otpExpiresAt;
    await user.save();
  } else {
    user = await User.create({
      name: email.split("@")[0],
      email,
      authProvider: "email_otp",
      otpHash,
      otpExpiresAt,
    });
  }

  // Send the email (OTP is never logged by the email service)
  await sendOTPEmail(email, otp);
}

/**
 * Verify an OTP and authenticate the user.
 *
 * 1. Find user by email (with OTP fields)
 * 2. Verify OTP hash matches and is not expired
 * 3. Clear OTP fields
 * 4. Generate and return tokens
 *
 * @param {string} email
 * @param {string} otp
 * @returns {Promise<{ accessToken, refreshToken, user }>}
 */
async function verifyOTP(email, otp) {
  const user = await User.findOne({ email }).select("+otpHash +otpExpiresAt");

  if (!user || !user.otpHash) {
    throw Object.assign(new Error("No OTP requested for this email"), {
      statusCode: 400,
    });
  }

  // Check expiry
  if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
    // Clear expired OTP
    user.otpHash = null;
    user.otpExpiresAt = null;
    await user.save();
    throw Object.assign(new Error("OTP has expired — request a new one"), {
      statusCode: 400,
    });
  }

  // Verify hash
  const isValid = await bcrypt.compare(otp, user.otpHash);
  if (!isValid) {
    throw Object.assign(new Error("Invalid OTP"), { statusCode: 400 });
  }

  // Clear OTP fields after successful verification
  user.otpHash = null;
  user.otpExpiresAt = null;
  user.lastLoginAt = new Date();
  await user.save();

  if (!user.isActive()) {
    throw Object.assign(new Error("Account is suspended"), { statusCode: 403 });
  }

  const tokens = generateTokens(user);

  logger.auth("otp_verified", {
    userId: user._id,
    email: user.email,
    provider: "email_otp",
  });

  return {
    ...tokens,
    user: formatUser(user),
  };
}

/**
 * Refresh an access token using a valid refresh token.
 *
 * @param {string} refreshToken
 * @returns {Promise<{ accessToken: string }>}
 */
async function refreshAccessToken(refreshToken) {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      throw Object.assign(new Error("Refresh token expired — please log in again"), {
        statusCode: 401,
      });
    }
    throw Object.assign(new Error("Invalid refresh token"), { statusCode: 401 });
  }

  // Verify user still exists and is active
  const user = await User.findById(decoded.id);
  if (!user || !user.isActive()) {
    throw Object.assign(new Error("User not found or account suspended"), {
      statusCode: 401,
    });
  }

  const accessToken = jwt.sign(
    { id: user._id.toString(), role: user.role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  logger.auth("token_refresh", { userId: user._id });

  return { accessToken };
}

/**
 * Logout — invalidate the user's current session.
 *
 * @param {string} userId
 * @param {string} ip
 * @param {string} userAgent
 * @returns {Promise<void>}
 */
async function logout(userId, ip, userAgent) {
  // Find and deactivate the most recent active session matching this IP/UA
  await Session.findOneAndUpdate(
    { user: userId, ip, isActive: true },
    { $set: { isActive: false, endedAt: new Date() } },
    { sort: { lastActiveAt: -1 } }
  );

  logger.auth("logout", { userId });
}

module.exports = {
  googleLogin,
  sendOTP,
  verifyOTP,
  refreshAccessToken,
  logout,
  generateTokens,
  formatUser,
};
