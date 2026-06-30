/**
 * Admin Controller.
 *
 * Thin controller layer — validates request, calls adminService,
 * returns response. No business logic or direct Mongoose queries here.
 *
 * All endpoints require verifyToken + requireAdmin.
 */

const adminService = require("../services/adminService");
const asyncHandler = require("../utils/asyncHandler");
const { success, paginated } = require("../utils/apiResponse");
const { parsePagination } = require("../utils/pagination");

/**
 * GET /api/admin/stats
 * Platform overview dashboard metrics.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getStats = asyncHandler(async (req, res) => {
  const stats = await adminService.getStats();
  success(res, stats);
});

/**
 * GET /api/admin/users
 * Paginated list of users with search and role filters.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getUsers = asyncHandler(async (req, res) => {
  const { search, role, accountStatus, sortBy, sortOrder } = req.query;
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

  const result = await adminService.getUsers({
    page,
    limit,
    skip,
    search,
    role,
    accountStatus,
    sortBy,
    sortOrder
  });

  paginated(res, result.users, {
    total: result.total,
    page: result.page,
    limit: result.limit
  });
});

/**
 * GET /api/admin/users/:id
 * Retrieve details for a single user.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getUserById = asyncHandler(async (req, res) => {
  const user = await adminService.getUserById(req.params.id);
  success(res, user);
});

/**
 * PATCH /api/admin/users/:id/status
 * Update user account status and deactivate active sessions.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const updateUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { accountStatus } = req.body;

  const user = await adminService.updateUserStatus(id, accountStatus);
  success(res, user, `User status updated to "${accountStatus}"`);
});

/**
 * PATCH /api/admin/users/:id/role
 * Promote or demote user role on BAMS notes platform.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const updateUserRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  const user = await adminService.updateUserRole(id, role);
  success(res, user, `User role updated to "${role}"`);
});

/**
 * DELETE /api/admin/users/:id
 * Soft delete a user profile.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const deleteUser = asyncHandler(async (req, res) => {
  await adminService.deleteUser(req.params.id);
  success(res, null, "User deleted");
});

/**
 * GET /api/admin/notes
 * Paginated list of note catalog eBooks.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getNotes = asyncHandler(async (req, res) => {
  const { search, subjectId, year, publishStatus, sortBy, sortOrder } = req.query;
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

  const result = await adminService.getNotes({
    page,
    limit,
    skip,
    search,
    subjectId,
    year,
    publishStatus,
    sortBy,
    sortOrder
  });

  paginated(res, result.notes, {
    total: result.total,
    page: result.page,
    limit: result.limit
  });
});

/**
 * POST /api/admin/notes
 * Create a new draft Note document.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const createNote = asyncHandler(async (req, res) => {
  const note = await adminService.createNote(req.body);
  success(res, note, "Note created as draft", 201);
});

/**
 * GET /api/admin/notes/:id
 * Retrieve details for a single note.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getNoteById = asyncHandler(async (req, res) => {
  const note = await adminService.getNoteById(req.params.id);
  success(res, note);
});

/**
 * PATCH /api/admin/notes/:id
 * Modify fields for a note.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const updateNote = asyncHandler(async (req, res) => {
  const note = await adminService.updateNote(req.params.id, req.body);
  success(res, note, "Note updated");
});

/**
 * DELETE /api/admin/notes/:id
 * Archive note eBook document.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const deleteNote = asyncHandler(async (req, res) => {
  await adminService.deleteNote(req.params.id);
  success(res, null, "Note archived");
});

/**
 * POST /api/admin/notes/:noteId/pages
 * Bulk register page metadata after S3 upload.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const registerPages = asyncHandler(async (req, res) => {
  const { noteId } = req.params;
  const { pages } = req.body;

  const result = await adminService.registerPages(noteId, pages);
  success(res, result, `${result.inserted} pages registered`, 201);
});

/**
 * GET /api/admin/notes/:noteId/pages
 * Retrieve sorted list of registered pages without S3 keys.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getNotePages = asyncHandler(async (req, res) => {
  const pages = await adminService.getNotePages(req.params.noteId);
  success(res, pages);
});

/**
 * DELETE /api/admin/notes/:noteId/pages/:pageNumber
 * Delete a single page document and clear its S3 object key.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const deleteNotePage = asyncHandler(async (req, res) => {
  const { noteId, pageNumber } = req.params;

  await adminService.deleteNotePage(noteId, Number(pageNumber));
  success(res, null, "Page deleted");
});

/**
 * POST /api/admin/notes/:noteId/pages/reorder
 * Reorder page numbers list.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const reorderNotePages = asyncHandler(async (req, res) => {
  const { noteId } = req.params;
  const { pages } = req.body;

  const result = await adminService.reorderNotePages(noteId, pages);
  success(res, result, "Pages reordered successfully");
});

/**
 * GET /api/admin/orders
 * Paginated list of user order attempts.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getOrders = asyncHandler(async (req, res) => {
  const { status, orderType, paymentGateway, dateFrom, dateTo, search } = req.query;
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

  const result = await adminService.getOrders({
    page,
    limit,
    skip,
    status,
    orderType,
    paymentGateway,
    dateFrom,
    dateTo,
    search
  });

  paginated(res, result.orders, {
    total: result.total,
    page: result.page,
    limit: result.limit
  });
});

/**
 * GET /api/admin/orders/:id
 * Retrieve details for a single order transaction.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getOrderById = asyncHandler(async (req, res) => {
  const order = await adminService.getOrderById(req.params.id);
  success(res, order);
});

/**
 * PATCH /api/admin/orders/:id/status
 * Manually update order status.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, refundReason } = req.body;

  const order = await adminService.updateOrderStatus(id, status, refundReason);
  success(res, order, "Order status updated");
});

/**
 * GET /api/admin/orders/export
 * Export order records matched by filter criteria as a CSV file.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const exportOrdersCsv = asyncHandler(async (req, res) => {
  const { dateFrom, dateTo, status, orderType } = req.query;

  const csv = await adminService.exportOrdersCsv({ dateFrom, dateTo, status, orderType });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="orders-export.csv"');
  res.status(200).send(csv);
});

/**
 * GET /api/admin/subjects
 * Retrieve academic subjects grouped by academic year.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getSubjects = asyncHandler(async (req, res) => {
  const groupedSubjects = await adminService.getSubjects();
  success(res, groupedSubjects);
});

/**
 * POST /api/admin/subjects
 * Seed or register a new Subject.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const createSubject = asyncHandler(async (req, res) => {
  const subject = await adminService.createSubject(req.body);
  success(res, subject, "Subject created successfully", 201);
});

/**
 * PATCH /api/admin/subjects/:id
 * Modify meta details for a Subject.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const updateSubject = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const subject = await adminService.updateSubject(id, req.body);
  success(res, subject, "Subject updated successfully");
});

/**
 * GET /api/admin/analytics/revenue
 * Get revenue stats aggregated over time.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getRevenueAnalytics = asyncHandler(async (req, res) => {
  const { period, groupBy } = req.query;

  const data = await adminService.getRevenueAnalytics(period, groupBy);
  success(res, data);
});

/**
 * GET /api/admin/analytics/users
 * Get new user registration counts over time.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getUserAnalytics = asyncHandler(async (req, res) => {
  const { period } = req.query;

  const data = await adminService.getUserAnalytics(period);
  success(res, data);
});

/**
 * GET /api/admin/analytics/popular-notes
 * Get popular notes sorted by purchase transaction counts.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getPopularNotesAnalytics = asyncHandler(async (req, res) => {
  const data = await adminService.getPopularNotesAnalytics();
  success(res, data);
});

/**
 * GET /api/admin/analytics/active-sessions
 * Get active read session details active within the last 5 minutes.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getActiveSessionsAnalytics = asyncHandler(async (req, res) => {
  const data = await adminService.getActiveSessionsAnalytics();
  success(res, data);
});

module.exports = {
  getStats,
  getUsers,
  getUserById,
  updateUserStatus,
  updateUserRole,
  deleteUser,
  getNotes,
  createNote,
  getNoteById,
  updateNote,
  deleteNote,
  registerPages,
  getNotePages,
  deleteNotePage,
  reorderNotePages,
  getOrders,
  getOrderById,
  updateOrderStatus,
  exportOrdersCsv,
  getSubjects,
  createSubject,
  updateSubject,
  getRevenueAnalytics,
  getUserAnalytics,
  getPopularNotesAnalytics,
  getActiveSessionsAnalytics
};
