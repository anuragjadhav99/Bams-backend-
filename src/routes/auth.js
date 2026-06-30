/**
 * Auth Routes.
 *
 * POST /api/auth/google        — Google OAuth login
 * POST /api/auth/otp/send      — Send OTP email
 * POST /api/auth/otp/verify    — Verify OTP and login
 * POST /api/auth/refresh       — Refresh access token
 * POST /api/auth/logout        — Logout (invalidate session)
 */

const { Router } = require("express");
const authController = require("../controllers/authController");
const { verifyToken } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");
const { validate, validateOTPSend, validateOTPVerify } = require("../middleware/validate");

const router = Router();

router.post("/google", authController.googleLogin);

router.post(
  "/otp/send",
  authLimiter,
  validate(validateOTPSend),
  authController.sendOTP
);

router.post(
  "/otp/verify",
  authLimiter,
  validate(validateOTPVerify),
  authController.verifyOTP
);

router.post("/refresh", authController.refreshToken);

router.post("/logout", verifyToken, authController.logout);

module.exports = router;
