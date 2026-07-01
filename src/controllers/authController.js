/**
 * Auth Controller.
 *
 * Thin controller layer — validates request, calls authService,
 * returns response. No business logic here.
 *
 * Security:
 *   • refreshToken is set as an httpOnly cookie — never in response body
 *   • accessToken is returned in body — stored in memory only (frontend)
 *   • Session is created on every successful login
 */

const authService = require("../services/authService");
const { Session } = require("../models");
const logger = require("../config/logger");

/** Shared cookie options for the refresh token. */
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/api/auth",          // only sent to auth endpoints
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * POST /api/auth/google
 * Authenticate via Google OAuth ID token.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
async function googleLogin(req, res, next) {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "Google ID token is required",
      });
    }

    const result = await authService.googleLogin(idToken);

    // Create anti-piracy session
    await Session.create({
      user: result.user.id,
      note: null,
      ip: req.ip || req.headers["x-forwarded-for"] || "unknown",
      userAgent: req.headers["user-agent"] || "unknown",
      deviceFingerprint: req.headers["x-device-fingerprint"] || null,
      isActive: true,
      lastActiveAt: new Date(),
    });

    // Set refresh token as httpOnly cookie
    res.cookie("refreshToken", result.refreshToken, REFRESH_COOKIE_OPTIONS);

    // Return only accessToken + user in body (no refreshToken)
    res.status(200).json({
      success: true,
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
      message: "Login successful",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/otp/send
 * Send a 6-digit OTP to the given email.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
async function sendOTP(req, res, next) {
  try {
    const { email } = req.body;

    await authService.sendOTP(email);

    res.status(200).json({
      success: true,
      message: "OTP sent to your email",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/otp/verify
 * Verify the OTP and return access token (refresh token set as cookie).
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
async function verifyOTP(req, res, next) {
  try {
    const { email, otp } = req.body;

    const result = await authService.verifyOTP(email, otp);

    // Create anti-piracy session
    await Session.create({
      user: result.user.id,
      note: null,
      ip: req.ip || req.headers["x-forwarded-for"] || "unknown",
      userAgent: req.headers["user-agent"] || "unknown",
      deviceFingerprint: req.headers["x-device-fingerprint"] || null,
      isActive: true,
      lastActiveAt: new Date(),
    });

    // Set refresh token as httpOnly cookie
    res.cookie("refreshToken", result.refreshToken, REFRESH_COOKIE_OPTIONS);

    // Return only accessToken + user in body (no refreshToken)
    res.status(200).json({
      success: true,
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
      message: "OTP verified — login successful",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/refresh
 * Issue a new access token using the refresh token from httpOnly cookie.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
async function refreshToken(req, res, next) {
  try {
    const token = req.cookies?.refreshToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No refresh token — please log in",
      });
    }

    const result = await authService.refreshAccessToken(token);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    // Token expired or invalid — return 401 immediately, never hang
    return res.status(401).json({
      success: false,
      message: "Invalid or expired refresh token",
    });
  }
}

/**
 * POST /api/auth/logout
 * Invalidate the current session and clear the refresh cookie.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
async function logout(req, res, next) {
  try {
    await authService.logout(
      req.user.id,
      req.ip,
      req.headers["user-agent"] || ""
    );

    // Clear the httpOnly refresh token cookie
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/auth",
    });

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { googleLogin, sendOTP, verifyOTP, refreshToken, logout };
