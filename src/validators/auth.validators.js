/**
 * Authentication validation rules.
 *
 * Express-validator chains for auth-related request bodies.
 *
 * @module validators/auth
 */

const { body } = require("express-validator");

/** Validate OTP send request — email required. */
const validateOTPSend = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Must be a valid email address")
    .normalizeEmail(),
];

/** Validate OTP verify request — email + 6-digit OTP. */
const validateOTPVerify = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Must be a valid email address")
    .normalizeEmail(),
  body("otp")
    .trim()
    .notEmpty()
    .withMessage("OTP is required")
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be exactly 6 digits")
    .isNumeric()
    .withMessage("OTP must contain only digits"),
];

/** Validate Google login — idToken required. */
const validateGoogleLogin = [
  body("idToken")
    .trim()
    .notEmpty()
    .withMessage("Google ID token is required"),
];

/** Validate refresh token request. */
const validateRefreshToken = [
  body("refreshToken")
    .trim()
    .notEmpty()
    .withMessage("Refresh token is required"),
];

module.exports = {
  validateOTPSend,
  validateOTPVerify,
  validateGoogleLogin,
  validateRefreshToken,
};
