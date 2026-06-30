/**
 * MongoDB ObjectId validation middleware.
 *
 * Validates that specified route params are valid MongoDB ObjectIds.
 * Returns 400 immediately if any param is malformed, preventing
 * downstream CastErrors and unnecessary DB queries.
 *
 * Usage:
 *   router.get("/:noteId", validateObjectId("noteId"), controller.getNote);
 *   router.get("/:noteId/page/:pageNumber", validateObjectId("noteId"), ...);
 */

const mongoose = require("mongoose");

/**
 * Create middleware that validates one or more route params as ObjectIds.
 *
 * @param {...string} paramNames - Route parameter names to validate
 * @returns {import("express").RequestHandler}
 *
 * @example
 *   // Single param
 *   router.get("/:id", validateObjectId("id"), handler);
 *
 *   // Multiple params
 *   router.get("/:userId/:noteId", validateObjectId("userId", "noteId"), handler);
 */
function validateObjectId(...paramNames) {
  return (req, res, next) => {
    const invalidParams = [];

    for (const name of paramNames) {
      const value = req.params[name];
      if (value && !mongoose.Types.ObjectId.isValid(value)) {
        invalidParams.push(name);
      }
    }

    if (invalidParams.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid ID format for: ${invalidParams.join(", ")}`,
        errors: invalidParams.map((param) => ({
          field: param,
          message: `"${req.params[param]}" is not a valid ObjectId`,
        })),
      });
    }

    next();
  };
}

module.exports = validateObjectId;
