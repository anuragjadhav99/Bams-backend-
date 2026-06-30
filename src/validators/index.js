/**
 * Validators barrel export.
 *
 * Re-exports all domain-specific validation rule sets
 * from a single entry point.
 *
 * @module validators
 *
 * @example
 *   const { validateOTPSend, validateOrder, validateNote } = require("../validators");
 */

const {
  validateOTPSend,
  validateOTPVerify,
  validateGoogleLogin,
  validateRefreshToken,
} = require("./auth.validators");

const {
  validateOrder,
  validatePaymentVerify,
} = require("./payment.validators");

const {
  validateProfile,
} = require("./user.validators");

const {
  validateNote,
  validateUserStatus,
} = require("./admin.validators");

module.exports = {
  // Auth
  validateOTPSend,
  validateOTPVerify,
  validateGoogleLogin,
  validateRefreshToken,
  // Payment
  validateOrder,
  validatePaymentVerify,
  // User
  validateProfile,
  // Admin
  validateNote,
  validateUserStatus,
};
