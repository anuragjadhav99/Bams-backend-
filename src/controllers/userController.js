/**
 * User Dashboard Controller.
 *
 * Thin controller layer — validates request, calls userService,
 * returns response. No business logic or Mongoose queries here.
 *
 * All endpoints require authentication (verifyToken).
 */

const userService = require("../services/userService");
const asyncHandler = require("../utils/asyncHandler");
const { success, paginated } = require("../utils/apiResponse");
const { parsePagination } = require("../utils/pagination");

/**
 * GET /api/user/profile
 * Return the authenticated user's profile.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getProfile = asyncHandler(async (req, res) => {
  const user = await userService.getProfile(req.user.id);

  success(res, user);
});

/**
 * PATCH /api/user/profile
 * Update name and phone only.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  const user = await userService.updateProfile(req.user.id, { name, phone });

  success(res, user, "Profile updated");
});

/**
 * GET /api/user/purchases
 * Return all completed orders for the user.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getPurchases = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });

  const result = await userService.getPurchases(req.user.id, { page, limit, skip });

  paginated(res, result.orders, {
    total: result.total,
    page: result.page,
    limit: result.limit,
  });
});

/**
 * GET /api/user/subscription
 * Return the user's active subscription (or null).
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getSubscription = asyncHandler(async (req, res) => {
  const subscription = await userService.getSubscription(req.user.id);

  success(res, subscription);
});

/**
 * GET /api/user/dashboard
 * Aggregated dashboard data for the student dashboard page.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getDashboard = asyncHandler(async (req, res) => {
  const data = await userService.getDashboard(req.user.id);

  success(res, data);
});

module.exports = {
  getProfile,
  updateProfile,
  getPurchases,
  getSubscription,
  getDashboard,
};
