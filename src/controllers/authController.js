/**
 * Auth Controller.
 *
 * Thin controller layer — parses the request, delegates to authService,
 * sets/clears the httpOnly cookie, and returns a uniform JSON response.
 *
 * No business logic lives here.
 *
 * Cookie policy:
 *   • refreshToken  → httpOnly, Secure (prod/Vercel), SameSite=Strict
 *   • maxAge        → 7 days (spec: 7 days for cookie lifetime)
 *   • path          → /api/auth  (cookie only sent to auth endpoints)
 */

"use strict";

const authService = require("../services/authService");

// ── Cookie helpers ────────────────────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Options for setting the refresh-token cookie.
 * secure=true in production and on Vercel; false on localhost.
 */
function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || !!process.env.VERCEL,
    sameSite: "strict",
    path: "/api/auth",
    maxAge: SEVEN_DAYS_MS,
  };
}

function getClearCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || !!process.env.VERCEL,
    sameSite: "strict",
    path: "/api/auth",
  };
}

// ── Controllers ───────────────────────────────────────────────────────

/**
 * POST /api/auth/google
 * Verify Google ID token, create/link user, set cookie, return access token.
 */
async function googleLogin(req, res, next) {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ success: false, message: "Google ID token is required" });
    }

    const { accessToken, rawRefreshToken, user } = await authService.googleLogin(idToken, req);

    res.cookie("refreshToken", rawRefreshToken, getRefreshCookieOptions());

    return res.status(200).json({
      success: true,
      message: "Google login successful",
      data: { accessToken, user },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/otp/send
 * Generate and email a 6-digit OTP to the given address.
 */
async function sendOTP(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email address is required" });
    }

    await authService.sendOTP(email);

    return res.status(200).json({ success: true, message: "OTP sent to your email" });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/otp/verify
 * Verify OTP, set httpOnly refresh-token cookie, return access token + user.
 */
async function verifyOTP(req, res, next) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and OTP code are required" });
    }

    const { accessToken, rawRefreshToken, user } = await authService.verifyOTP(email, otp, req);

    // httpOnly cookie — 7 days
    res.cookie("refreshToken", rawRefreshToken, getRefreshCookieOptions());

    return res.status(200).json({
      success: true,
      message: "OTP verified — login successful",
      data: { accessToken, user },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/refresh
 * Rotate the refresh token and issue a new access token.
 *
 * Reads raw token from req.cookies.refreshToken.
 * Returns 401 immediately if missing — never hangs.
 */
async function refreshToken(req, res) {
  const rawToken = req.cookies?.refreshToken;

  if (!rawToken) {
    return res.status(401).json({ success: false, message: "No refresh token — please log in" });
  }

  try {
    const { accessToken, newRawRefreshToken } = await authService.rotateRefreshToken(rawToken, req);

    // Set the rotated refresh token
    res.cookie("refreshToken", newRawRefreshToken, getRefreshCookieOptions());

    return res.status(200).json({
      success: true,
      data: { accessToken },
    });
  } catch (err) {
    // Clear invalid/expired cookie so the browser doesn't keep sending it
    res.clearCookie("refreshToken", getClearCookieOptions());
    return res.status(401).json({
      success: false,
      message: err.message || "Invalid or expired refresh token",
    });
  }
}

/**
 * POST /api/auth/logout
 * Hash the raw token from the cookie, delete the DB record, clear cookie.
 */
async function logout(req, res, next) {
  try {
    const rawToken = req.cookies?.refreshToken;
    const userId = req.user.id;

    // Hash and delete; no-op if token is missing or already expired
    await authService.logout(userId, rawToken);

    res.clearCookie("refreshToken", getClearCookieOptions());

    return res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 * Return the sanitised profile of the currently authenticated user.
 * verifyToken middleware already ran, so req.user.id is safe to use.
 */
async function getMe(req, res, next) {
  try {
    const user = await authService.getUserProfile(req.user.id);
    return res.status(200).json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
}

// ── Exports ───────────────────────────────────────────────────────────

module.exports = { googleLogin, sendOTP, verifyOTP, refreshToken, logout, getMe };
