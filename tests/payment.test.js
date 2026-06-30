/**
 * Payment Tests.
 *
 * Tests for payment verification logic:
 *   ✅ HMAC SHA256 signature verification
 *   ✅ Webhook signature verification
 *   ❌ Invalid signatures rejected
 *   ✅ Order validation
 */

const crypto = require("crypto");
const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

// Set test env vars
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.RAZORPAY_KEY_SECRET = "test-razorpay-secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";

const { verifyToken } = require("../src/middleware/auth");
const { validate, validateOrder } = require("../src/middleware/validate");
const errorHandler = require("../src/middleware/errorHandler");

// ── Helper ─────────────────────────────────────────────────────────

function generateToken(payload = { id: "user123", role: "student" }) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

function createPaymentTestApp() {
  const app = express();

  // Webhook route MUST come BEFORE express.json() — needs raw body for HMAC
  app.post(
    "/api/payment/webhook",
    express.raw({ type: "application/json" }),
    (req, res) => {
      const signature = req.headers["x-razorpay-signature"];
      const rawBody = req.body.toString("utf-8");

      const expectedSig = crypto
        .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

      if (expectedSig !== signature) {
        return res.status(400).json({
          success: false,
          message: "Invalid webhook signature",
        });
      }

      res.status(200).json({ success: true });
    }
  );

  // JSON parser for all other routes
  app.use(express.json());

  // Simulated create-order route
  app.post(
    "/api/payment/create-order",
    verifyToken,
    validate(validateOrder),
    (req, res) => {
      res.status(201).json({
        success: true,
        data: {
          orderId: "order_test_001",
          razorpayOrderId: "order_rz_test_001",
          amount: 149,
          currency: "INR",
          keyId: "test-rz-key",
        },
      });
    }
  );

  // Simulated verify route
  app.post(
    "/api/payment/verify",
    verifyToken,
    (req, res) => {
      const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({
          success: false,
          message: "All payment fields are required",
        });
      }

      // Verify HMAC
      const expectedSig = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest("hex");

      if (expectedSig !== razorpaySignature) {
        return res.status(400).json({
          success: false,
          message: "Payment verification failed",
        });
      }

      res.json({
        success: true,
        message: "Payment verified successfully",
      });
    }
  );

  app.use(errorHandler);
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────

describe("Payment", () => {
  let app;
  let token;

  beforeAll(() => {
    app = createPaymentTestApp();
    token = generateToken();
  });

  describe("Create Order", () => {
    test("should require authentication", async () => {
      const res = await request(app)
        .post("/api/payment/create-order")
        .send({ orderType: "single_note" });
      expect(res.status).toBe(401);
    });

    test("should validate orderType", async () => {
      const res = await request(app)
        .post("/api/payment/create-order")
        .set("Authorization", `Bearer ${token}`)
        .send({ orderType: "invalid_type" });
      expect(res.status).toBe(422);
      expect(res.body.errors).toBeDefined();
    });

    test("should create order with valid data", async () => {
      const res = await request(app)
        .post("/api/payment/create-order")
        .set("Authorization", `Bearer ${token}`)
        .send({ orderType: "single_note", noteId: "507f1f77bcf86cd799439011" });
      expect(res.status).toBe(201);
      expect(res.body.data.razorpayOrderId).toBeDefined();
      expect(res.body.data.amount).toBeDefined();
      expect(res.body.data.currency).toBe("INR");
    });

    test("should accept year_package order type", async () => {
      const res = await request(app)
        .post("/api/payment/create-order")
        .set("Authorization", `Bearer ${token}`)
        .send({ orderType: "year_package", year: "first_year" });
      expect(res.status).toBe(201);
    });

    test("should accept subscription order type", async () => {
      const res = await request(app)
        .post("/api/payment/create-order")
        .set("Authorization", `Bearer ${token}`)
        .send({ orderType: "subscription", plan: "monthly" });
      expect(res.status).toBe(201);
    });
  });

  describe("Payment Verification (HMAC SHA256)", () => {
    const orderId = "order_rz_test_001";
    const paymentId = "pay_test_001";

    test("should verify valid signature", async () => {
      const validSig = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      const res = await request(app)
        .post("/api/payment/verify")
        .set("Authorization", `Bearer ${token}`)
        .send({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: validSig,
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test("should reject invalid signature", async () => {
      const res = await request(app)
        .post("/api/payment/verify")
        .set("Authorization", `Bearer ${token}`)
        .send({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: "invalid_signature_here",
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("verification failed");
    });

    test("should reject missing payment fields", async () => {
      const res = await request(app)
        .post("/api/payment/verify")
        .set("Authorization", `Bearer ${token}`)
        .send({ razorpayOrderId: orderId });
      expect(res.status).toBe(400);
    });

    test("should reject tampered orderId", async () => {
      // Generate sig for original order but send different orderId
      const validSig = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      const res = await request(app)
        .post("/api/payment/verify")
        .set("Authorization", `Bearer ${token}`)
        .send({
          razorpayOrderId: "tampered_order_id",
          razorpayPaymentId: paymentId,
          razorpaySignature: validSig,
        });
      expect(res.status).toBe(400);
    });
  });

  describe("Webhook Signature Verification", () => {
    test("should accept valid webhook signature", async () => {
      const payload = JSON.stringify({
        event: "payment.captured",
        payload: { payment: { entity: { id: "pay_1", order_id: "order_1" } } },
      });

      const signature = crypto
        .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(payload)
        .digest("hex");

      const res = await request(app)
        .post("/api/payment/webhook")
        .set("Content-Type", "application/json")
        .set("X-Razorpay-Signature", signature)
        .send(payload);
      expect(res.status).toBe(200);
    });

    test("should reject invalid webhook signature", async () => {
      const payload = JSON.stringify({ event: "payment.captured" });

      const res = await request(app)
        .post("/api/payment/webhook")
        .set("Content-Type", "application/json")
        .set("X-Razorpay-Signature", "invalid_sig")
        .send(payload);
      expect(res.status).toBe(400);
    });
  });
});
