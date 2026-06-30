/**
 * Request body validation middleware using express-validator.
 *
 * Provides the generic `validate(rules)` wrapper that runs validation
 * chains and returns 422 on failure.
 *
 * Individual validation rule sets are defined in the `validators/` directory
 * and re-exported here for backward compatibility.
 *
 * @module middleware/validate
 */

const { validationResult } = require("express-validator");

// ── Re-export validation rules from validators/ for backward compat ──
const {
  validateOTPSend,
  validateOTPVerify,
  validateGoogleLogin,
  validateRefreshToken,
  validateOrder,
  validatePaymentVerify,
  validateProfile,
  validateNote,
  validateUserStatus,
} = require("../validators");

/**
 * Generic validation wrapper.
 *
 * Accepts an array of express-validator rules, runs them,
 * and returns 422 with field-level error messages on failure.
 *
 * @param {import("express-validator").ValidationChain[]} rules
 * @returns {import("express").RequestHandler[]}
 */
function validate(rules) {
  return [
    ...rules,
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          message: "Validation failed",
          errors: errors.array().map((e) => ({
            field: e.path,
            message: e.msg,
          })),
        });
      }
      next();
    },
  ];
}

module.exports = {
  validate,
  // Re-exported for backward compatibility with existing route imports
  validateOTPSend,
  validateOTPVerify,
  validateGoogleLogin,
  validateRefreshToken,
  validateOrder,
  validatePaymentVerify,
  validateProfile,
  validateNote,
  validateUserStatus,
};
