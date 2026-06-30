/**
 * Global Express error handler.
 *
 * Catches all errors that reach the end of the middleware chain and
 * returns a consistent JSON response:
 *
 *   { success: false, message, errors? }
 *
 * Handles:
 *   • Mongoose ValidationError → 400 with field-level messages
 *   • Mongoose CastError       → 400 "Invalid ID format"
 *   • MongoDB duplicate key     → 409 "Already exists"
 *   • Everything else           → 500
 *
 * Stack traces are only included when NODE_ENV === "development".
 */

const logger = require("../config/logger");
const { env } = require("../config/env");

/**
 * @param {Error} err
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} _next
 */
function errorHandler(err, req, res, _next) {
  // ── Mongoose ValidationError ─────────────────────────────────
  if (err.name === "ValidationError" && err.errors) {
    const errors = Object.entries(err.errors).map(([field, detail]) => ({
      field,
      message: detail.message,
    }));

    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  // ── Mongoose CastError (bad ObjectId, etc.) ──────────────────
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: `Invalid ID format: ${err.value}`,
    });
  }

  // ── MongoDB duplicate key (code 11000) ───────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "field";
    return res.status(409).json({
      success: false,
      message: `Already exists — duplicate value for "${field}"`,
    });
  }

  // ── Known operational errors with statusCode ─────────────────
  if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message || "Bad request",
    });
  }

  // ── Everything else → 500 ────────────────────────────────────
  logger.apiError("Unhandled server error", err, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
  });

  const response = {
    success: false,
    message: env.isDev ? err.message : "Internal server error",
  };

  if (env.isDev) {
    response.stack = err.stack;
  }

  res.status(500).json(response);
}

module.exports = errorHandler;
