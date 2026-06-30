/**
 * Payment Controller.
 *
 * Handles Razorpay payment flow:
 *   • Create order → client-side checkout → verify payment
 *   • Webhook for server-to-server payment confirmation
 */

const paymentService = require("../services/paymentService");

/**
 * POST /api/payment/create-order
 * Create a Razorpay order for checkout.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
async function createOrder(req, res, next) {
  try {
    const { orderType, noteId, year, plan } = req.body;

    const result = await paymentService.createOrder(req.user.id, {
      orderType,
      noteId,
      year,
      plan,
    });

    res.status(201).json({
      success: true,
      data: result,
      message: "Order created — proceed to payment",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payment/verify
 * Verify payment after Razorpay checkout completes.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
async function verifyPayment(req, res, next) {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: "razorpayOrderId, razorpayPaymentId, and razorpaySignature are required",
      });
    }

    const result = await paymentService.verifyPayment(req.user.id, {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    res.status(200).json({
      success: true,
      data: result,
      message: "Payment verified successfully",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payment/webhook
 * Handle Razorpay webhook events.
 *
 * No auth middleware — Razorpay calls this directly.
 * Uses raw body for signature verification.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
async function handleWebhook(req, res, next) {
  try {
    const signature = req.headers["x-razorpay-signature"];

    if (!signature) {
      return res.status(400).json({
        success: false,
        message: "Missing webhook signature",
      });
    }

    // req.rawBody is set by the raw body parser in index.js
    const rawBody = req.rawBody;

    if (!rawBody) {
      return res.status(400).json({
        success: false,
        message: "Missing request body",
      });
    }

    await paymentService.handleWebhook(rawBody, signature);

    // Respond 200 immediately — Razorpay needs fast response
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { createOrder, verifyPayment, handleWebhook };
