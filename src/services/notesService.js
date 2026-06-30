/**
 * Notes Catalog Service.
 *
 * Business logic for the public-facing notes catalog:
 *   • List active subjects grouped by year
 *   • Paginated, filterable notes listing
 *   • Note detail by slug with purchase status
 *
 * No S3 data is ever exposed through this service.
 *
 * @module services/notesService
 */

const { Subject, Note } = require("../models");
const hasAccess = require("../helpers/hasAccess");
const { ACADEMIC_YEARS } = require("../config/constants");

/**
 * Get all active subjects grouped by academic year.
 *
 * @returns {Promise<Object>} Subjects keyed by camelCase year name
 */
async function getSubjects() {
  const subjects = await Subject.find({ isActive: true })
    .sort({ year: 1, sortOrder: 1 })
    .lean();

  // Group by year: "first_year" → "firstYear"
  const grouped = {};
  for (const year of ACADEMIC_YEARS) {
    const camelKey = year.replace(/_([\w])/g, (_, c) => c.toUpperCase());
    grouped[camelKey] = subjects.filter((s) => s.year === year);
  }

  return grouped;
}

/**
 * Get paginated, filterable notes listing.
 *
 * @param {Object} params
 * @param {string} [params.year]      - Academic year filter
 * @param {string} [params.subjectId] - Subject ID filter
 * @param {string} [params.search]    - Search query (title, tags, description)
 * @param {number} params.page        - Page number (1-based)
 * @param {number} params.limit       - Items per page
 * @returns {Promise<{ notes: Array, total: number, page: number, limit: number }>}
 */
async function getNotes({ year, subjectId, search, page, limit }) {
  const filter = { publishStatus: "published" };

  if (subjectId) {
    filter.subject = subjectId;
  }

  if (year && ACADEMIC_YEARS.includes(year)) {
    const yearSubjects = await Subject.find({ year, isActive: true })
      .select("_id")
      .lean();
    const subjectIds = yearSubjects.map((s) => s._id);
    filter.subject = subjectId
      ? filter.subject // subjectId takes precedence
      : { $in: subjectIds };
  }

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { tags: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  const projection = {
    title: 1,
    slug: 1,
    description: 1,
    coverImage: 1,
    totalPages: 1,
    samplePages: 1,
    price: 1,
    mrp: 1,
    currency: 1,
    publishStatus: 1,
    tags: 1,
    author: 1,
    subject: 1,
    publishedAt: 1,
    createdAt: 1,
  };

  const [notes, total] = await Promise.all([
    Note.find(filter)
      .select(projection)
      .populate({ path: "subject", select: "name slug year" })
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Note.countDocuments(filter),
  ]);

  return { notes, total, page, limit };
}

/**
 * Get full note detail by slug, with optional purchase check.
 *
 * @param {string} slug   - URL-friendly note identifier
 * @param {string|null} userId - Authenticated user ID (null for guests)
 * @returns {Promise<Object|null>} Note document with isPurchased, or null if not found
 */
async function getNoteBySlug(slug, userId) {
  const note = await Note.findOne({ slug, publishStatus: "published" })
    .select("-__v")
    .populate({ path: "subject", select: "name slug year description" })
    .lean();

  if (!note) return null;

  let isPurchased = false;
  if (userId) {
    isPurchased = await hasAccess(userId, note._id);
  }

  return { ...note, isPurchased };
}

module.exports = { getSubjects, getNotes, getNoteBySlug };
