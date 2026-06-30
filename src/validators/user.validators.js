/**
 * User profile validation rules.
 *
 * Express-validator chains for user-related request bodies.
 *
 * @module validators/user
 */

const { body } = require("express-validator");

/** Validate profile update — name and phone only. */
const validateProfile = [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 1, max: 120 })
    .withMessage("Name must be between 1 and 120 characters"),
  body("phone")
    .optional()
    .trim()
    .matches(/^\+?[1-9]\d{6,14}$/)
    .withMessage("Please enter a valid phone number"),
];

module.exports = {
  validateProfile,
};
