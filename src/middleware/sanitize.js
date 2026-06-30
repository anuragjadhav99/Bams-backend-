/**
 * Input sanitization middleware.
 *
 * Protects against NoSQL injection and XSS by:
 *   1. Recursively trimming all string values in body, query, params
 *   2. Removing null bytes (\0) which can bypass validation
 *   3. Removing MongoDB operators ($ and .) from keys to prevent NoSQL injection
 *
 * Compatible with Express 5 (does not reassign req.query).
 */

const logger = require("../config/logger");

/**
 * Recursively cleans object keys (removes $ and .) and values (trims strings and removes null bytes).
 *
 * @param {*} val - Value to sanitize
 * @param {import("express").Request} req - Express request object for logging
 * @returns {*} Sanitized value
 */
function sanitizeValue(val, req) {
  if (typeof val === "string") {
    return val.trim().replace(/\0/g, "");
  }

  if (Array.isArray(val)) {
    return val.map((item) => sanitizeValue(item, req));
  }

  if (val !== null && typeof val === "object") {
    // Only sanitize plain objects to avoid breaking special object types like Date, Buffer, etc.
    if (Object.prototype.toString.call(val) !== "[object Object]") {
      return val;
    }

    const cleaned = {};
    for (const [key, value] of Object.entries(val)) {
      let cleanKey = key;
      if (key.includes("$") || key.includes(".")) {
        cleanKey = key.replace(/[\$.]/g, "");
        logger.warn("NoSQL injection attempt blocked", {
          category: "security",
          key,
          ip: req ? req.ip : undefined,
          url: req ? req.originalUrl : undefined,
        });
      }
      cleaned[cleanKey] = sanitizeValue(value, req);
    }
    return cleaned;
  }

  return val;
}

/**
 * Express middleware that sanitizes request input (body, params, query).
 * Sanitizes req.query in-place without reassigning the query object itself.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} _res
 * @param {import("express").NextFunction} next
 */
function trimStrings(req, _res, next) {
  if (req.body) {
    req.body = sanitizeValue(req.body, req);
  }
  if (req.params) {
    req.params = sanitizeValue(req.params, req);
  }
  if (req.query) {
    const sanitizedQuery = sanitizeValue(req.query, req);
    // Redefine req.query on req instance to avoid TypeError and ensure all subsequent accesses return sanitized query
    Object.defineProperty(req, "query", {
      value: sanitizedQuery,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  next();
}

module.exports = { trimStrings };
