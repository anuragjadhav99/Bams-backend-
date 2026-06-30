/**
 * Pagination query parameter parser.
 *
 * Extracts and validates `page` and `limit` from Express query params
 * with sensible defaults and bounds clamping.
 *
 * @module utils/pagination
 *
 * @example
 *   const { parsePagination } = require("../utils/pagination");
 *
 *   const { page, limit, skip } = parsePagination(req.query);
 *   const docs = await Model.find().skip(skip).limit(limit);
 */

/**
 * Parse pagination parameters from query string.
 *
 * @param {Object} query - Express req.query
 * @param {Object} [options]
 * @param {number} [options.defaultLimit=12] - Default items per page
 * @param {number} [options.maxLimit=100]    - Maximum items per page
 * @returns {{ page: number, limit: number, skip: number }}
 */
function parsePagination(query, { defaultLimit = 12, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

module.exports = { parsePagination };
