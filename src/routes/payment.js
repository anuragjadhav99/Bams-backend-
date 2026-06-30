/**
 * Payment Routes.
 *
 * POST /api/payment/create-order — Create Razorpay order (auth required)
 * POST /api/payment/verify       — Verify payment signature (auth required)
 * POST /api/payment/webhook      — Razorpay webhook (no auth)
 */

const { Router } = require("express");
const paymentController = require("../controllers/paymentController");
const { verifyToken } = require("../middleware/auth");
const { validate, validateOrder } = require("../middleware/validate");

const router = Router();

router.post(
  "/create-order",
  verifyToken,
  validate(validateOrder),
  paymentController.createOrder
);

router.post(
  "/verify",
  verifyToken,
  paymentController.verifyPayment
);

// Webhook — NO auth middleware (Razorpay calls this directly)
router.post("/webhook", paymentController.handleWebhook);

module.exports = router;
