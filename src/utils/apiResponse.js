/**
 * Standardised API response helpers.
 *
 * Ensures all responses follow the project convention:
 *
 *   Success: { success: true,  data, message? }
 *   Error:   { success: false, message, errors? }
 *
 * @module utils/apiResponse
 *
 * @example
 *   const { success, paginated, error } = require("../utils/apiResponse");
 *
 *   // Simple success
 *   return success(res, user, "Profile loaded");
 *
 *   // Paginated list
 *   return paginated(res, notes, { total, page, limit });
 *
 *   // Created (201)
 *   return success(res, note, "Note created", 201);
 */

/**
 * Send a success response.
 *
 * @param {import("express").Response} res
 * @param {*}      data       - Response payload
 * @param {string} [message]  - Optional success message
 * @param {number} [status=200] - HTTP status code
 * @returns {import("express").Response}
 */
function success(res, data = null, message = undefined, status = 200) {
  const body = { success: true };
  if (data !== null && data !== undefined) body.data = data;
  if (message) body.message = message;
  return res.status(status).json(body);
}

/**
 * Send a paginated success response.
 *
 * @param {import("express").Response} res
 * @param {Array}  data  - Array of items
 * @param {Object} pagination - { total, page, limit }
 * @param {number} pagination.total - Total document count
 * @param {number} pagination.page  - Current page number
 * @param {number} pagination.limit - Items per page
 * @returns {import("express").Response}
 */
function paginated(res, data, { total, page, limit }) {
  return res.status(200).json({
    success: true,
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
}

/**
 * Send an error response.
 *
 * @param {import("express").Response} res
 * @param {string} message     - Error message
 * @param {number} [status=400] - HTTP status code
 * @param {Array}  [errors]     - Optional field-level errors
 * @returns {import("express").Response}
 */
function error(res, message, status = 400, errors = undefined) {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(status).json(body);
}

module.exports = { success, paginated, error };
