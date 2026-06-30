/**
 * User Dashboard Routes.
 *
 * All routes require verifyToken.
 *
 * GET   /api/user/profile       — Get user profile
 * PATCH /api/user/profile       — Update name/phone
 * GET   /api/user/purchases     — Purchase history
 * GET   /api/user/subscription  — Active subscription
 * GET   /api/user/dashboard     — Aggregated dashboard data
 */

const { Router } = require("express");
const userController = require("../controllers/userController");
const { verifyToken } = require("../middleware/auth");
const { validate, validateProfile } = require("../middleware/validate");

const router = Router();

// All user routes require authentication
router.use(verifyToken);

router.get("/profile", userController.getProfile);

router.patch(
  "/profile",
  validate(validateProfile),
  userController.updateProfile
);

router.get("/purchases", userController.getPurchases);

router.get("/subscription", userController.getSubscription);

router.get("/dashboard", userController.getDashboard);

module.exports = router;
