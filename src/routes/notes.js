/**
 * Notes Catalog Routes.
 *
 * GET /api/subjects       — All active subjects grouped by year (public)
 * GET /api/notes          — Paginated notes listing (public, optionalAuth)
 * GET /api/notes/:slug    — Full note detail (public, optionalAuth)
 */

const { Router } = require("express");
const notesController = require("../controllers/notesController");
const { optionalAuth } = require("../middleware/auth");

const router = Router();

router.get("/subjects", notesController.getSubjects);

router.get("/notes", optionalAuth, notesController.getNotes);

router.get("/notes/:slug", optionalAuth, notesController.getNoteBySlug);

module.exports = router;
