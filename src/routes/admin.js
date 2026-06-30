/**
 * Admin Routes.
 *
 * All routes require verifyToken + requireAdmin.
 */

const { Router } = require("express");
const adminController = require("../controllers/adminController");
const { verifyToken, requireAdmin } = require("../middleware/auth");
const validateObjectId = require("../middleware/objectIdValidator");

const router = Router();

// Apply auth + admin role checks globally for all admin endpoints
router.use(verifyToken, requireAdmin);

/* ─── 1. Stats & Dashboard ────────────────────────────────────────── */
router.get("/stats", adminController.getStats);

/* ─── 2. User Management ──────────────────────────────────────────── */
router.get("/users", adminController.getUsers);
router.get("/users/:id", validateObjectId("id"), adminController.getUserById);
router.patch("/users/:id/status", validateObjectId("id"), adminController.updateUserStatus);
router.patch("/users/:id/role", validateObjectId("id"), adminController.updateUserRole);
router.delete("/users/:id", validateObjectId("id"), adminController.deleteUser);

/* ─── 3. Notes Management ─────────────────────────────────────────── */
router.get("/notes", adminController.getNotes);
router.post("/notes", adminController.createNote);
router.get("/notes/:id", validateObjectId("id"), adminController.getNoteById);
router.patch("/notes/:id", validateObjectId("id"), adminController.updateNote);
router.delete("/notes/:id", validateObjectId("id"), adminController.deleteNote);

/* ─── 4. Page Management (S3 Integration) ─────────────────────────── */
router.post("/notes/:noteId/pages", validateObjectId("noteId"), adminController.registerPages);
router.get("/notes/:noteId/pages", validateObjectId("noteId"), adminController.getNotePages);
router.delete(
  "/notes/:noteId/pages/:pageNumber",
  validateObjectId("noteId"),
  adminController.deleteNotePage
);
router.post("/notes/:noteId/pages/reorder", validateObjectId("noteId"), adminController.reorderNotePages);

/* ─── 5. Orders Management ────────────────────────────────────────── */
router.get("/orders/export", adminController.exportOrdersCsv); // must be defined BEFORE /orders/:id
router.get("/orders", adminController.getOrders);
router.get("/orders/:id", validateObjectId("id"), adminController.getOrderById);
router.patch("/orders/:id/status", validateObjectId("id"), adminController.updateOrderStatus);

/* ─── 6. Subjects Management ──────────────────────────────────────── */
router.get("/subjects", adminController.getSubjects);
router.post("/subjects", adminController.createSubject);
router.patch("/subjects/:id", validateObjectId("id"), adminController.updateSubject);

/* ─── 7. Analytics ────────────────────────────────────────────────── */
router.get("/analytics/revenue", adminController.getRevenueAnalytics);
router.get("/analytics/users", adminController.getUserAnalytics);
router.get("/analytics/popular-notes", adminController.getPopularNotesAnalytics);
router.get("/analytics/active-sessions", adminController.getActiveSessionsAnalytics);

module.exports = router;
