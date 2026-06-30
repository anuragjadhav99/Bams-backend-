/**
 * Async handler wrapper for Express route handlers.
 *
 * Wraps an async function so that any rejected promise is
 * automatically forwarded to Express's `next(err)` error handler,
 * eliminating the need for try/catch in every controller method.
 *
 * @module utils/asyncHandler
 *
 * @example
 *   const asyncHandler = require("../utils/asyncHandler");
 *
 *   // Before — manual try/catch:
 *   async function getProfile(req, res, next) {
 *     try {
 *       const user = await User.findById(req.user.id);
 *       res.json({ success: true, data: user });
 *     } catch (err) {
 *       next(err);
 *     }
 *   }
 *
 *   // After — asyncHandler:
 *   const getProfile = asyncHandler(async (req, res) => {
 *     const user = await User.findById(req.user.id);
 *     res.json({ success: true, data: user });
 *   });
 */

/**
 * Wrap an async route handler to catch errors.
 *
 * @param {Function} fn - Async Express route handler (req, res, next)
 * @returns {Function} Express-compatible middleware
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
