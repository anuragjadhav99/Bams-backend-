/**
 * Payment Service.
 *
 * Business logic for Razorpay payment integration:
 *   • Create Razorpay orders
 *   • Verify payment signatures
 *   • Handle webhooks
 *   • Manage subscriptions on successful payment
 *
 * Security:
 *   ❌ Never log razorpaySignature or secrets
 *   ✅ HMAC SHA256 signature verification on every payment
 *   ✅ Webhook signature verification
 */

const crypto = require("crypto");
const Razorpay = require("razorpay");
const { Order, Note, Subscription } = require("../models");
const { ACADEMIC_YEARS } = require("../config/constants");
const { env } = require("../config/env");
const logger = require("../config/logger");

/** Razorpay SDK instance — initialised lazily. */
let razorpayInstance = null;

function getRazorpay() {
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayInstance;
}

/** Fixed prices for packages and subscriptions (in INR paise → convert to rupees for display). */
const PACKAGE_PRICES = {
  year_package: 799,
  full_package: 2999,
  subscription_monthly: 99,
  subscription_yearly: 999,
};

/**
 * Calculate the amount for an order based on type.
 *
 * @param {string} orderType
 * @param {string} [noteId]
 * @param {string} [plan]
 * @returns {Promise<number>} Amount in INR (rupees)
 */
async function calculateAmount(orderType, noteId, plan) {
  switch (orderType) {
    case "single_note": {
      if (!noteId) {
        throw Object.assign(new Error("Note ID is required for single_note orders"), {
          statusCode: 400,
        });
      }
      const note = await Note.findById(noteId).select("price").lean();
      if (!note) {
        throw Object.assign(new Error("Note not found"), { statusCode: 404 });
      }
      return note.price;
    }

    case "year_package":
      return PACKAGE_PRICES.year_package;

    case "full_package":
      return PACKAGE_PRICES.full_package;

    case "subscription": {
      if (!plan || !["monthly", "yearly"].includes(plan)) {
        throw Object.assign(new Error("Plan must be 'monthly' or 'yearly'"), {
          statusCode: 400,
        });
      }
      return PACKAGE_PRICES[`subscription_${plan}`];
    }

    default:
      throw Object.assign(new Error(`Invalid order type: ${orderType}`), {
        statusCode: 400,
      });
  }
}

/**
 * Create a new payment order.
 *
 * 1. Validate order type and calculate amount
 * 2. Create Razorpay order
 * 3. Save Order document in DB (status: 'created')
 * 4. Return order details for the frontend checkout
 *
 * @param {string} userId
 * @param {Object} params
 * @param {string} params.orderType
 * @param {string} [params.noteId]
 * @param {string} [params.year]
 * @param {string} [params.plan]
 * @returns {Promise<Object>}
 */
async function createOrder(userId, { orderType, noteId, year, plan }) {
  // Validate year for year_package
  if (orderType === "year_package") {
    if (!year || !ACADEMIC_YEARS.includes(year)) {
      throw Object.assign(
        new Error(`Year must be one of: ${ACADEMIC_YEARS.join(", ")}`),
        { statusCode: 400 }
      );
    }
  }

  // Calculate amount
  const amount = await calculateAmount(orderType, noteId, plan);

  // Create Razorpay order (amount in paise)
  const razorpay = getRazorpay();
  const razorpayOrder = await razorpay.orders.create({
    amount: amount * 100, // Convert rupees to paise
    currency: "INR",
    receipt: `bams_${Date.now()}_${userId.toString().slice(-6)}`,
    notes: {
      userId: userId.toString(),
      orderType,
      noteId: noteId || "",
      year: year || "",
      plan: plan || "",
    },
  });

  // Save Order in our DB
  const order = await Order.create({
    user: userId,
    orderType,
    note: orderType === "single_note" ? noteId : null,
    year: orderType === "year_package" ? year : null,
    paymentGateway: "razorpay",
    gatewayOrderId: razorpayOrder.id,
    amount,
    currency: "INR",
    status: "created",
  });

  logger.payment("order_created", {
    userId,
    orderId: order._id,
    gatewayOrderId: razorpayOrder.id,
    orderType,
    amount,
  });

  return {
    orderId: order._id,
    razorpayOrderId: razorpayOrder.id,
    amount,
    currency: "INR",
    keyId: env.RAZORPAY_KEY_ID,
  };
}

/**
 * Verify a payment after Razorpay checkout.
 *
 * 1. Verify HMAC SHA256 signature
 * 2. Update Order status
 * 3. Create Subscription if applicable
 *
 * @param {string} userId
 * @param {Object} params
 * @param {string} params.razorpayOrderId
 * @param {string} params.razorpayPaymentId
 * @param {string} params.razorpaySignature
 * @returns {Promise<Object>}
 */
async function verifyPayment(userId, { razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  // Find the order
  const order = await Order.findOne({
    user: userId,
    gatewayOrderId: razorpayOrderId,
  });

  if (!order) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }

  if (order.status === "paid") {
    return { message: "Payment already verified", orderId: order._id };
  }

  // Verify HMAC SHA256 signature
  const expectedSignature = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  if (expectedSignature !== razorpaySignature) {
    // Mark order as failed
    order.status = "failed";
    order.remarks = "Signature verification failed";
    await order.save();

    logger.payment("payment_failed", {
      userId,
      orderId: order._id,
      reason: "signature_mismatch",
    });

    throw Object.assign(new Error("Payment verification failed"), {
      statusCode: 400,
    });
  }

  // Payment verified — update order
  order.status = "paid";
  order.gatewayPaymentId = razorpayPaymentId;
  order.gatewaySignature = razorpaySignature;
  order.paidAt = new Date();
  await order.save();

  // If subscription order, create/update Subscription document
  if (order.orderType === "subscription") {
    await createOrRenewSubscription(userId, order);
  }

  logger.payment("payment_verified", {
    userId,
    orderId: order._id,
    amount: order.amount,
    orderType: order.orderType,
  });

  return {
    message: "Payment verified successfully",
    orderId: order._id,
  };
}

/**
 * Create or renew a subscription after successful payment.
 *
 * @param {string} userId
 * @param {Object} order - The paid Order document
 */
async function createOrRenewSubscription(userId, order) {
  // Determine plan from order amount
  const plan = order.amount === PACKAGE_PRICES.subscription_monthly ? "monthly" : "yearly";
  const durationDays = plan === "monthly" ? 30 : 365;

  const now = new Date();
  const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

  // Deactivate any existing active subscriptions
  await Subscription.updateMany(
    { user: userId, status: "active" },
    { $set: { status: "expired" } }
  );

  // Create new subscription
  const subscription = await Subscription.create({
    user: userId,
    order: order._id,
    plan,
    status: "active",
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    autoRenew: true,
  });

  logger.payment("subscription_created", {
    userId,
    subscriptionId: subscription._id,
    plan,
    periodEnd: periodEnd.toISOString(),
  });
}

/**
 * Handle Razorpay webhook events.
 *
 * Verifies the webhook signature and processes events:
 *   • payment.captured → mark order paid
 *   • payment.failed   → mark order failed
 *
 * @param {string} rawBody - Raw request body (string)
 * @param {string} signature - X-Razorpay-Signature header
 * @returns {Promise<void>}
 */
async function handleWebhook(rawBody, signature) {
  // Verify webhook signature
  const expectedSignature = crypto
    .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  if (expectedSignature !== signature) {
    throw Object.assign(new Error("Invalid webhook signature"), {
      statusCode: 400,
    });
  }

  const event = JSON.parse(rawBody);
  const eventType = event.event;

  logger.payment("webhook_received", { eventType });

  switch (eventType) {
    case "payment.captured": {
      const payment = event.payload?.payment?.entity;
      if (!payment) break;

      const order = await Order.findOne({
        gatewayOrderId: payment.order_id,
      });

      if (order && order.status !== "paid") {
        order.status = "paid";
        order.gatewayPaymentId = payment.id;
        order.paidAt = new Date();
        await order.save();

        if (order.orderType === "subscription") {
          await createOrRenewSubscription(order.user, order);
        }

        logger.payment("webhook_payment_captured", {
          orderId: order._id,
          userId: order.user,
        });
      }
      break;
    }

    case "payment.failed": {
      const payment = event.payload?.payment?.entity;
      if (!payment) break;

      const order = await Order.findOne({
        gatewayOrderId: payment.order_id,
      });

      if (order && order.status !== "paid") {
        order.status = "failed";
        order.remarks = payment.error_description || "Payment failed";
        await order.save();

        logger.payment("webhook_payment_failed", {
          orderId: order._id,
          userId: order.user,
          reason: payment.error_code,
        });
      }
      break;
    }

    default:
      logger.info(`Unhandled webhook event: ${eventType}`);
  }
}

module.exports = {
  createOrder,
  verifyPayment,
  handleWebhook,
  PACKAGE_PRICES,
};
