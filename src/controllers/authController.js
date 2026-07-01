/**
 * Auth Controller.
 *
 * Thin controller layer — validates request, calls authService,
 * returns response. No business logic here.
 *
 * Security:
 *   • refreshToken is set as an httpOnly cookie — never in response body
 *   • accessToken is returned in body — stored in memory only (frontend)
 *   • Sessions / RefreshTokens are recorded and rotated on each call
 */

const authService = require("../services/authService");
const logger = require("../config/logger");

/** Shared cookie options for the refresh token (30 days expiry). */
const getRefreshCookieOptions = () => ({
  httpOnly: true,
  // Works seamlessly on both localhost and HTTPS-secured Vercel deployments
  secure: process.env.NODE_ENV === "production" || !!process.env.VERCEL,
  sameSite: "strict",
  path: "/api/auth", // only sent to auth endpoints
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
});

/**
 * POST /api/auth/google
 * Authenticate via Google OAuth ID token.
 */
async function googleLogin(req, res, next) {
  try {
    const { idToken } = req.body;
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "Google ID token is required",
      });
    }

    const result = await authService.googleLogin(idToken, ip, userAgent);

    // Set refresh token as httpOnly cookie
    res.cookie("refreshToken", result.refreshToken, getRefreshCookieOptions());

    res.status(200).json({
      success: true,
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
      message: "Google login successful",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/otp/send
 * Send a 6-digit OTP to the given email.
 */
async function sendOTP(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email address is required",
      });
    }

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
 */
async function verifyOTP(req, res, next) {
  try {
    const { email, otp } = req.body;
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP code are required",
      });
    }

    const result = await authService.verifyOTP(email, otp, ip, userAgent);

    // Set refresh token as httpOnly cookie
    res.cookie("refreshToken", result.refreshToken, getRefreshCookieOptions());

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
 * Issue a new access token and rotated refresh token using the refresh token from httpOnly cookie.
 */
async function refreshToken(req, res, next) {
  try {
    const token = req.cookies?.refreshToken;
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No refresh token — please log in",
      });
    }

    // Call service to perform rotation and verify token
    const result = await authService.refreshAccessToken(token, ip, userAgent);

    // Set the new rotated refresh token in cookie
    res.cookie("refreshToken", result.refreshToken, getRefreshCookieOptions());

    return res.status(200).json({
      success: true,
      data: {
        accessToken: result.accessToken,
      },
    });
  } catch (err) {
    // Make sure to clear cookie on invalidation
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || !!process.env.VERCEL,
      sameSite: "strict",
      path: "/api/auth",
    });
    return res.status(401).json({
      success: false,
      message: err.message || "Invalid or expired refresh token",
    });
  }
}

/**
 * POST /api/auth/logout
 * Invalidate the current refresh token and clear cookie.
 */
async function logout(req, res, next) {
  try {
    const token = req.cookies?.refreshToken;
    const userId = req.user.id;

    await authService.logout(userId, token);

    // Clear the httpOnly refresh token cookie
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || !!process.env.VERCEL,
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

/**
 * GET /api/auth/me
 * Retrieve the currently authenticated user profile.
 */
async function getMe(req, res, next) {
  try {
    const userId = req.user.id;
    const user = await authService.getUserProfile(userId);

    res.status(200).json({
      success: true,
      data: {
        user,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  googleLogin,
  sendOTP,
  verifyOTP,
  refreshToken,
  logout,
  getMe,
};
