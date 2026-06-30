/**
 * Reader Routes.
 *
 * GET  /api/reader/:noteId/page/:pageNumber — Fetch page (signed URL)
 * POST /api/reader/:noteId/heartbeat        — Keep session alive
 * GET  /api/reader/:noteId/info             — Reader UI metadata
 *
 * All routes require authentication.
 * Page fetch routes have a higher rate limit.
 */

const { Router } = require("express");
const readerController = require("../controllers/readerController");
const { verifyToken } = require("../middleware/auth");
const { readerLimiter } = require("../middleware/rateLimiter");
const validateObjectId = require("../middleware/objectIdValidator");

const router = Router();

// All reader routes require authentication
router.use(verifyToken);

router.get(
  "/:noteId/page/:pageNumber",
  validateObjectId("noteId"),
  readerLimiter,
  readerController.getPage
);

router.post(
  "/:noteId/heartbeat",
  validateObjectId("noteId"),
  readerController.heartbeat
);

router.get(
  "/:noteId/info",
  validateObjectId("noteId"),
  readerController.getReaderInfo
);

module.exports = router;
