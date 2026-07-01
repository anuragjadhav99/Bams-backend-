/**
 * Authentication Service.
 *
 * Business logic for authentication flows:
 *   • Google OAuth verification + user creation
 *   • OTP generation, hashing, verification (with security constraints)
 *   • JWT token generation (access + refresh) with Refresh Token Rotation
 *   • Session / RefreshToken revocation on logout or compromise
 *
 * Security rules:
 *   ❌ Never logs OTP values, tokens, or secrets
 *   ✅ Logs auth events with userId, email, provider, ip
 */

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const { User, Session, OTP, RefreshToken } = require("../models");
const { env } = require("../config/env");
const logger = require("../config/logger");
const { sendOTPEmail } = require("./emailService");

/** Google OAuth client singleton. */
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

/** OTP expiry time in milliseconds (5 minutes). */
const OTP_EXPIRY_MS = 5 * 60 * 1000;

/** Access token expiry. */
const ACCESS_TOKEN_EXPIRY = "15m";

/** Refresh token expiry (30 days). */
const REFRESH_TOKEN_EXPIRY = "30d";

/**
 * Generate JWT access + refresh token pair.
 *
 * @param {Object} user - Mongoose User document
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
    loginMethod: user.loginMethod || "email_otp",
    googleLinked: !!user.googleId,
    lastLoginAt: user.lastLoginAt,
  };
}

/**
 * Authenticate via Google OAuth.
 *
 * @param {string} idToken - Google ID token from the client
 * @param {string} ip - Request IP address
 * @param {string} userAgent - Request user agent
 * @returns {Promise<{ accessToken, refreshToken, user }>}
 */
async function googleLogin(idToken, ip, userAgent) {
  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
  } catch (err) {
    logger.auth("login_failed", { provider: "google", ip, error: err.message });
    throw Object.assign(new Error("Google Login failed: invalid token"), { statusCode: 401 });
  }

  const googlePayload = ticket.getPayload();

  if (!googlePayload || !googlePayload.email) {
    logger.auth("login_failed", { provider: "google", ip, error: "No email returned from Google" });
    throw Object.assign(new Error("Invalid Google token"), { statusCode: 401 });
  }

  const { sub: googleId, email, name, picture } = googlePayload;

  // Find existing user by googleId or email
  let user = await User.findOne({
    $or: [{ googleId }, { email }],
  });

  if (user) {
    // Update Google info if needed (Account linking)
    if (!user.googleId) {
      user.googleId = googleId;
      user.authProvider = "google";
    }
    user.loginMethod = "google";
    user.avatar = picture || user.avatar;
    user.lastLoginAt = new Date();
    await user.save();
  } else {
    // Create new user automatically on first-time login
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
    logger.auth("login_failed", { userId: user._id, email: user.email, provider: "google", ip, error: "Account suspended" });
    throw Object.assign(new Error("Account is suspended"), { statusCode: 403 });
  }

  const tokens = generateTokens(user);

  // Store refresh token in RefreshToken database collection
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await RefreshToken.create({
    user: user._id,
    token: tokens.refreshToken,
    ip,
    userAgent,
    expiresAt,
  });

  logger.auth("login", {
    userId: user._id,
    email: user.email,
    provider: "google",
    ip,
  });

  return {
    ...tokens,
    user: formatUser(user),
  };
}

/**
 * Generate and send an OTP to the given email.
 *
 * Implements security checks:
 *   • Enforces 30 seconds resend delay
 *   • Enforces maximum 5 resends limit
 *   • Invalidates previous OTPs
 *
 * @param {string} email
 * @returns {Promise<void>}
 */
async function sendOTP(email) {
  const normalizedEmail = email.toLowerCase().trim();

  // Find if there is an active OTP document
  const existingOTP = await OTP.findOne({ email: normalizedEmail });

  if (existingOTP) {
    // 1. Enforce 30 seconds resend delay
    const timeSinceLastResend = Date.now() - existingOTP.lastResentAt.getTime();
    if (timeSinceLastResend < 30 * 1000) {
      throw Object.assign(
        new Error(`Please wait ${Math.ceil((30 * 1000 - timeSinceLastResend) / 1000)}s before requesting a new OTP`),
        { statusCode: 429 }
      );
    }

    // 2. Enforce maximum 5 resends
    if (existingOTP.resends >= 5) {
      throw Object.assign(
        new Error("Maximum resend attempts reached (5 times). Please wait 5 minutes before trying again."),
        { statusCode: 429 }
      );
    }

    // 3. Delete/Invalidate previous OTP
    await OTP.deleteOne({ _id: existingOTP._id });
  }

  // Generate random 6-digit OTP
  const otpCode = String(Math.floor(100000 + Math.random() * 900000));

  // Hash the OTP
  const otpHash = await bcrypt.hash(otpCode, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
  const nextResendCount = existingOTP ? existingOTP.resends + 1 : 0;

  // Save new OTP
  await OTP.create({
    email: normalizedEmail,
    otpHash,
    resends: nextResendCount,
    lastResentAt: new Date(),
    expiresAt,
  });

  // Send via Nodemailer (Never logs the code)
  await sendOTPEmail(normalizedEmail, otpCode);

  logger.auth("otp_sent", { email: normalizedEmail });
}

/**
 * Verify OTP and authenticate/create user.
 *
 * Implements security checks:
 *   • Max 5 failed attempts limit
 *   • Immediate invalidation on success or max failures
 *
 * @param {string} email
 * @param {string} otpCode
 * @param {string} ip
 * @param {string} userAgent
 * @returns {Promise<{ accessToken, refreshToken, user }>}
 */
async function verifyOTP(email, otpCode, ip, userAgent) {
  const normalizedEmail = email.toLowerCase().trim();

  // Find the OTP document
  const otpDoc = await OTP.findOne({ email: normalizedEmail });

  if (!otpDoc) {
    throw Object.assign(new Error("No OTP requested for this email"), { statusCode: 400 });
  }

  // Check if expired
  if (otpDoc.expiresAt < new Date()) {
    await OTP.deleteOne({ _id: otpDoc._id });
    throw Object.assign(new Error("OTP has expired — request a new one"), { statusCode: 400 });
  }

  // Find user to log administrative failed attempts
  let user = await User.findOne({ email: normalizedEmail });

  // Check failed verification attempts limit (max 5)
  if (otpDoc.attempts >= 5) {
    await OTP.deleteOne({ _id: otpDoc._id });

    if (user) {
      user.failedOTPAttempts += 1;
      await user.save();
    }

    logger.auth("login_failed", { email: normalizedEmail, ip, error: "Too many failed OTP attempts" });
    throw Object.assign(new Error("Too many failed attempts. This OTP has been invalidated."), { statusCode: 400 });
  }

  // Compare hashed OTP
  const isValid = await bcrypt.compare(otpCode, otpDoc.otpHash);

  if (!isValid) {
    // Increment attempts on OTP document
    otpDoc.attempts += 1;
    await otpDoc.save();

    if (user) {
      user.failedOTPAttempts += 1;
      await user.save();
    }

    logger.auth("login_failed", { email: normalizedEmail, ip, error: "Invalid OTP digit match" });
    throw Object.assign(new Error("Invalid OTP code"), { statusCode: 400 });
  }

  // OTP is valid!
  // Find or create user
  if (!user) {
    user = await User.create({
      name: normalizedEmail.split("@")[0],
      email: normalizedEmail,
      authProvider: "email_otp",
      loginMethod: "email_otp",
      lastLoginAt: new Date(),
    });
  } else {
    user.loginMethod = "email_otp";
    user.lastLoginAt = new Date();
    user.failedOTPAttempts = 0; // Reset failed attempts count
    await user.save();
  }

  if (!user.isActive()) {
    await OTP.deleteOne({ _id: otpDoc._id });
    logger.auth("login_failed", { userId: user._id, email: user.email, provider: "email_otp", ip, error: "Account suspended" });
    throw Object.assign(new Error("Account is suspended"), { statusCode: 403 });
  }

  const tokens = generateTokens(user);

  // Store refresh token in RefreshToken database collection
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await RefreshToken.create({
    user: user._id,
    token: tokens.refreshToken,
    ip,
    userAgent,
    expiresAt,
  });

  // Delete the OTP document immediately to prevent replay attacks
  await OTP.deleteOne({ _id: otpDoc._id });

  logger.auth("login", {
    userId: user._id,
    email: user.email,
    provider: "email_otp",
    ip,
  });

  return {
    ...tokens,
    user: formatUser(user),
  };
}

/**
 * Rotate Refresh Token and return new token pair.
 *
 * Implements Refresh Token Rotation and Theft Detection:
 *   • If a refresh token is reused (not found in database, but JWT valid),
 *     we suspect theft/hijack and revoke all sessions/tokens for that user.
 *
 * @param {string} oldRefreshToken
 * @param {string} ip
 * @param {string} userAgent
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 */
async function refreshAccessToken(oldRefreshToken, ip, userAgent) {
  let decoded;
  try {
    decoded = jwt.verify(oldRefreshToken, env.JWT_REFRESH_SECRET);
  } catch (err) {
    logger.auth("token_refresh_failed", { ip, error: "Invalid refresh token signature" });
    throw Object.assign(new Error("Invalid refresh token signature"), { statusCode: 401 });
  }

  // Check if token exists in database
  const tokenDoc = await RefreshToken.findOne({ token: oldRefreshToken });

  if (!tokenDoc) {
    // CRITICAL: Potential token reuse (hijacking attempt)!
    // Invalidate ALL tokens/sessions for the user as a safety defense
    await RefreshToken.deleteMany({ user: decoded.id });
    logger.warn(`SECURITY ALERT: Refresh token reuse detected. Revoking all tokens.`, {
      category: "security",
      userId: decoded.id,
      ip,
    });
    throw Object.assign(new Error("Session expired — security violation detected"), { statusCode: 401 });
  }

  // Find user and make sure active
  const user = await User.findById(decoded.id);
  if (!user || !user.isActive()) {
    await RefreshToken.deleteOne({ _id: tokenDoc._id });
    throw Object.assign(new Error("User not found or suspended"), { statusCode: 401 });
  }

  // Delete the used refresh token (Rotation)
  await RefreshToken.deleteOne({ _id: tokenDoc._id });

  // Generate new token pair
  const tokens = generateTokens(user);

  // Save new refresh token
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await RefreshToken.create({
    user: user._id,
    token: tokens.refreshToken,
    ip,
    userAgent,
    expiresAt,
  });

  logger.auth("token_refresh", { userId: user._id, ip });

  return tokens;
}

/**
 * Revoke specific refresh token on logout.
 *
 * @param {string} userId
 * @param {string} token
 * @returns {Promise<void>}
 */
async function logout(userId, token) {
  if (token) {
    await RefreshToken.deleteOne({ user: userId, token });
  }
  logger.auth("logout", { userId });
}

/**
 * Fetch and return sanitized user profile.
 *
 * @param {string} userId
 * @returns {Promise<Object>}
 */
async function getUserProfile(userId) {
  const user = await User.findById(userId);
  if (!user || !user.isActive()) {
    throw Object.assign(new Error("User not found or inactive"), { statusCode: 404 });
  }
  return formatUser(user);
}

module.exports = {
  googleLogin,
  sendOTP,
  verifyOTP,
  refreshAccessToken,
  logout,
  getUserProfile,
  generateTokens,
  formatUser,
};
