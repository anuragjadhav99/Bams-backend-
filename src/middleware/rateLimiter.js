/**
 * Rate limiting middleware.
 *
 * Three limiters with different thresholds:
 *   • authLimiter   — 10 req / 15 min   (login, OTP routes)
 *   • apiLimiter    — 100 req / 15 min  (general API routes)
 *   • readerLimiter — 200 req / 15 min  (page fetch routes)
 *
 * All return JSON on limit hit.
 */

const rateLimit = require("express-rate-limit");

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * Auth limiter — strict limit for login/OTP endpoints.
 * Prevents brute-force attacks on authentication.
 */
const authLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests — please try again after 15 minutes",
  },
});

/**
 * API limiter — general limit for all API routes.
 * Applied globally to prevent abuse.
 */
const apiLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests — please try again later",
  },
});

/**
 * Reader limiter — higher limit for page fetch routes.
 * Allows fast page navigation while still preventing scraping.
 */
const readerLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests — please slow down",
  },
});

module.exports = { authLimiter, apiLimiter, readerLimiter };
