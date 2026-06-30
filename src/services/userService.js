/**
 * User Dashboard Service.
 *
 * Business logic for user profile and dashboard:
 *   • Profile get/update
 *   • Purchase history
 *   • Subscription status
 *   • Aggregated dashboard data
 *
 * @module services/userService
 */

const { User, Order, Subscription, Session } = require("../models");
const AppError = require("../utils/AppError");

/**
 * Get the authenticated user's profile.
 *
 * @param {string} userId
 * @returns {Promise<Object>} User profile data
 * @throws {AppError} 404 if user not found
 */
async function getProfile(userId) {
  const user = await User.findById(userId)
    .select("name email phone avatar role createdAt")
    .lean();

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return user;
}

/**
 * Update user profile (name and phone only).
 *
 * @param {string} userId
 * @param {Object} updates - { name?, phone? }
 * @returns {Promise<Object>} Updated user profile
 * @throws {AppError} 400 if no valid fields provided
 * @throws {AppError} 404 if user not found
 */
async function updateProfile(userId, { name, phone }) {
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;

  if (Object.keys(updates).length === 0) {
    throw new AppError("No valid fields to update (only name and phone are allowed)", 400);
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updates },
    { new: true, runValidators: true }
  ).select("name email phone avatar role createdAt");

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return user;
}

/**
 * Get paginated purchase history for the user.
 *
 * @param {string} userId
 * @param {Object} params - { page, limit, skip }
 * @returns {Promise<{ orders: Array, total: number, page: number, limit: number }>}
 */
async function getPurchases(userId, { page, limit, skip }) {
  const filter = { user: userId, status: "paid" };

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate({
        path: "note",
        select: "title slug subject coverImage",
        populate: { path: "subject", select: "name year" },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  return { orders, total, page, limit };
}

/**
 * Get the user's active subscription.
 *
 * @param {string} userId
 * @returns {Promise<Object|null>} Active subscription or null
 */
async function getSubscription(userId) {
  const subscription = await Subscription.findOne({
    user: userId,
    status: "active",
    currentPeriodEnd: { $gt: new Date() },
  })
    .select("plan status currentPeriodStart currentPeriodEnd autoRenew createdAt")
    .lean();

  return subscription || null;
}

/**
 * Get aggregated dashboard data for the student dashboard page.
 *
 * @param {string} userId
 * @returns {Promise<Object>} Dashboard data
 */
async function getDashboard(userId) {
  const [
    recentPurchases,
    activeSubscription,
    totalNotesPurchased,
    activeSessions,
  ] = await Promise.all([
    // Last 3 paid orders
    Order.find({ user: userId, status: "paid" })
      .populate({
        path: "note",
        select: "title slug coverImage totalPages",
      })
      .sort({ paidAt: -1 })
      .limit(3)
      .lean(),

    // Active subscription
    Subscription.findOne({
      user: userId,
      status: "active",
      currentPeriodEnd: { $gt: new Date() },
    })
      .select("plan status currentPeriodEnd autoRenew")
      .lean(),

    // Total unique notes purchased
    Order.countDocuments({
      user: userId,
      status: "paid",
      orderType: "single_note",
    }),

    // Last 3 active reading sessions (continue reading)
    Session.find({ user: userId, isActive: true, note: { $ne: null } })
      .populate({
        path: "note",
        select: "title slug coverImage totalPages",
      })
      .sort({ lastActiveAt: -1 })
      .limit(3)
      .lean(),
  ]);

  return {
    recentPurchases,
    activeSubscription: activeSubscription || null,
    totalNotesPurchased,
    continueReading: activeSessions,
  };
}

module.exports = {
  getProfile,
  updateProfile,
  getPurchases,
  getSubscription,
  getDashboard,
};
