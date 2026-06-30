/**
 * Notes Catalog Controller.
 *
 * Thin controller layer — validates request, calls notesService,
 * returns response. No business logic or Mongoose queries here.
 */

const notesService = require("../services/notesService");
const asyncHandler = require("../utils/asyncHandler");
const { success, paginated } = require("../utils/apiResponse");
const { parsePagination } = require("../utils/pagination");

/**
 * GET /api/subjects
 * Return all active subjects grouped by academic year.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getSubjects = asyncHandler(async (req, res) => {
  const grouped = await notesService.getSubjects();

  success(res, grouped);
});

/**
 * GET /api/notes
 * Paginated, filterable notes listing.
 *
 * Query params: year, subjectId, search, page (default 1), limit (default 12)
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getNotes = asyncHandler(async (req, res) => {
  const { year, subjectId, search } = req.query;
  const { page, limit } = parsePagination(req.query, { defaultLimit: 12, maxLimit: 50 });

  const result = await notesService.getNotes({ year, subjectId, search, page, limit });

  paginated(res, result.notes, {
    total: result.total,
    page: result.page,
    limit: result.limit,
  });
});

/**
 * GET /api/notes/:slug
 * Full note detail. If authenticated, includes isPurchased boolean.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const getNoteBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const userId = req.user ? req.user.id : null;

  const note = await notesService.getNoteBySlug(slug, userId);

  if (!note) {
    return res.status(404).json({
      success: false,
      message: "Note not found",
    });
  }

  success(res, note);
});

module.exports = { getSubjects, getNotes, getNoteBySlug };
