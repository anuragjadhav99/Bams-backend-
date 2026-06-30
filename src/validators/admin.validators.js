/**
 * Admin validation rules.
 *
 * Express-validator chains for admin-related request bodies.
 *
 * @module validators/admin
 */

const { body } = require("express-validator");
const { ACCOUNT_STATUSES } = require("../config/constants");

/** Validate note creation/update. */
const validateNote = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Title is required")
    .isLength({ max: 200 })
    .withMessage("Title must be at most 200 characters"),
  body("subjectId")
    .trim()
    .notEmpty()
    .withMessage("Subject ID is required")
    .isMongoId()
    .withMessage("Subject ID must be a valid MongoDB ObjectId"),
  body("price")
    .notEmpty()
    .withMessage("Price is required")
    .isFloat({ min: 0 })
    .withMessage("Price must be a non-negative number"),
  body("totalPages")
    .notEmpty()
    .withMessage("Total pages is required")
    .isInt({ min: 1 })
    .withMessage("Total pages must be at least 1"),
  body("samplePages")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Sample pages must be a non-negative integer"),
  body("mrp")
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage("MRP must be a non-negative number"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Description must be at most 2000 characters"),
];

/** Validate user status update. */
const validateUserStatus = [
  body("accountStatus")
    .trim()
    .notEmpty()
    .withMessage("Account status is required")
    .isIn(ACCOUNT_STATUSES)
    .withMessage(`Account status must be one of: ${ACCOUNT_STATUSES.join(", ")}`),
];

module.exports = {
  validateNote,
  validateUserStatus,
};
