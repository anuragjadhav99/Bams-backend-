/**
 * Authentication middleware.
 *
 * Provides three middleware functions:
 *   1. verifyToken   — blocks unauthenticated requests (401)
 *   2. requireAdmin  — blocks non-admin users (403)
 *   3. optionalAuth  — attaches user if token present, never blocks
 */

const jwt = require("jsonwebtoken");
const { env } = require("../config/env");
const logger = require("../config/logger");

/**
 * verifyToken — Extract and verify JWT from Authorization header.
 *
 * On success: attaches `req.user = { id, role }` and calls next().
 * On failure: returns 401 JSON.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized — no token provided",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);

    req.user = {
      id: decoded.id,
      role: decoded.role,
    };

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Unauthorized — token expired",
      });
    }

    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Unauthorized — invalid token",
      });
    }

    logger.apiError("Token verification error", err);
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }
}

/**
 * requireAdmin — Must run AFTER verifyToken.
 *
 * Checks that req.user.role === "admin".
 * Returns 403 if the user is not an admin.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Forbidden — admin access required",
    });
  }
  next();
}

/**
 * optionalAuth — Same as verifyToken but NEVER blocks.
 *
 * If a valid token is present: attaches req.user = { id, role }.
 * If missing or invalid: sets req.user = null and calls next().
 *
 * Use on routes where sample pages are visible to guests.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      req.user = null;
      return next();
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);

    req.user = {
      id: decoded.id,
      role: decoded.role,
    };
  } catch {
    // Token invalid or expired — silently continue without user
    req.user = null;
  }

  next();
}

module.exports = { verifyToken, requireAdmin, optionalAuth };
