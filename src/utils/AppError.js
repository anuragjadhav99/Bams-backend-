/**
 * Custom operational error class.
 *
 * Use for known, expected error conditions (e.g., "not found",
 * "validation failed", "unauthorized"). The global error handler
 * in middleware/errorHandler.js will pick up `statusCode` and
 * return it as the HTTP status.
 *
 * @extends Error
 *
 * @example
 *   throw new AppError("Note not found", 404);
 *   throw new AppError("Payment verification failed", 400);
 */
class AppError extends Error {
  /**
   * @param {string} message - Human-readable error description
   * @param {number} statusCode - HTTP status code (400–499)
   */
  constructor(message, statusCode) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
