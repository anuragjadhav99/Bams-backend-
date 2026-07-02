/**
 * Auth Routes.
 *
 * POST /api/auth/google        — Google OAuth login          (authLimiter)
 * POST /api/auth/otp/send      — Send OTP email              (authLimiter + validate)
 * POST /api/auth/otp/verify    — Verify OTP and login        (authLimiter + validate)
 * POST /api/auth/refresh       — Rotate refresh token        (no extra middleware)
 * POST /api/auth/logout        — Logout / revoke token       (verifyToken)
 * GET  /api/auth/me            — Return user profile         (verifyToken)
 */

"use strict";

const { Router } = require("express");
const authController = require("../controllers/authController");
const { verifyToken } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");
const { validate, validateOTPSend, validateOTPVerify, validateGoogleLogin } = require("../middleware/validate");

const router = Router();

/** Google OAuth — rate-limited + validated. */
router.post("/google", authLimiter, validate(validateGoogleLogin), authController.googleLogin);

/** OTP send — rate-limited + validated email. */
router.post("/otp/send", authLimiter, validate(validateOTPSend), authController.sendOTP);

/** OTP verify — rate-limited + validated email + 6-digit code. */
router.post("/otp/verify", authLimiter, validate(validateOTPVerify), authController.verifyOTP);

/** Token rotation — reads cookie, no body validation needed. */
router.post("/refresh", authController.refreshToken);

/** Logout — must be authenticated first. */
router.post("/logout", verifyToken, authController.logout);

/** Profile — must be authenticated first. */
router.get("/me", verifyToken, authController.getMe);

module.exports = router;
