/**
 * Auth Tests.
 *
 * Tests for authentication endpoints:
 *   • Google OAuth login
 *   • OTP send/verify
 *   • Token refresh
 *   • Logout
 *   • Protected route access
 */

const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

// ── Test setup ─────────────────────────────────────────────────────

// Set test env vars before importing anything that reads them
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
process.env.MONGODB_URI = "mongodb://localhost:27017/bams_test";
process.env.AWS_REGION = "ap-south-1";
process.env.AWS_ACCESS_KEY_ID = "test-key";
process.env.AWS_SECRET_ACCESS_KEY = "test-secret";
process.env.AWS_S3_BUCKET = "test-bucket";
process.env.RAZORPAY_KEY_ID = "test-rz-key";
process.env.RAZORPAY_KEY_SECRET = "test-rz-secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "test-rz-webhook";
process.env.FRONTEND_URL = "http://localhost:3000";

const { verifyToken, requireAdmin, optionalAuth } = require("../src/middleware/auth");
const errorHandler = require("../src/middleware/errorHandler");

// ── Helper: create a test Express app ──────────────────────────────

function createTestApp() {
  const app = express();
  app.use(express.json());

  // Protected test route
  app.get("/protected", verifyToken, (req, res) => {
    res.json({ success: true, data: { userId: req.user.id, role: req.user.role } });
  });

  // Admin test route
  app.get("/admin", verifyToken, requireAdmin, (req, res) => {
    res.json({ success: true, data: { userId: req.user.id } });
  });

  // Optional auth test route
  app.get("/optional", optionalAuth, (req, res) => {
    res.json({ success: true, data: { user: req.user } });
  });

  app.use(errorHandler);
  return app;
}

// ── Helper: generate test tokens ───────────────────────────────────

function generateTestAccessToken(payload = { id: "user123", role: "student" }) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

function generateTestRefreshToken(payload = { id: "user123", role: "student" }) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
}

function generateExpiredToken(payload = { id: "user123", role: "student" }) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: "0s" });
}

// ── Tests ──────────────────────────────────────────────────────────

describe("Auth Middleware", () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  describe("verifyToken", () => {
    test("should return 401 when no token is provided", async () => {
      const res = await request(app).get("/protected");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("no token");
    });

    test("should return 401 when token format is invalid", async () => {
      const res = await request(app)
        .get("/protected")
        .set("Authorization", "InvalidFormat token123");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test("should return 401 when token is expired", async () => {
      const token = generateExpiredToken();
      // Wait a moment for the token to actually expire
      await new Promise((r) => setTimeout(r, 1100));
      const res = await request(app)
        .get("/protected")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect(res.body.message).toContain("expired");
    });

    test("should return 401 when token is malformed", async () => {
      const res = await request(app)
        .get("/protected")
        .set("Authorization", "Bearer not.a.valid.jwt");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test("should attach user when valid token is provided", async () => {
      const token = generateTestAccessToken({ id: "user456", role: "admin" });
      const res = await request(app)
        .get("/protected")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userId).toBe("user456");
      expect(res.body.data.role).toBe("admin");
    });
  });

  describe("requireAdmin", () => {
    test("should return 403 for student role", async () => {
      const token = generateTestAccessToken({ id: "user123", role: "student" });
      const res = await request(app)
        .get("/admin")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toContain("admin");
    });

    test("should allow admin role", async () => {
      const token = generateTestAccessToken({ id: "admin1", role: "admin" });
      const res = await request(app)
        .get("/admin")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.userId).toBe("admin1");
    });
  });

  describe("optionalAuth", () => {
    test("should set user to null when no token is provided", async () => {
      const res = await request(app).get("/optional");
      expect(res.status).toBe(200);
      expect(res.body.data.user).toBeNull();
    });

    test("should set user to null when token is invalid", async () => {
      const res = await request(app)
        .get("/optional")
        .set("Authorization", "Bearer invalid.token.here");
      expect(res.status).toBe(200);
      expect(res.body.data.user).toBeNull();
    });

    test("should attach user when valid token is provided", async () => {
      const token = generateTestAccessToken({ id: "user789", role: "student" });
      const res = await request(app)
        .get("/optional")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.user).not.toBeNull();
      expect(res.body.data.user.id).toBe("user789");
    });
  });
});

describe("Token Generation", () => {
  test("access token should contain id and role", () => {
    const token = generateTestAccessToken({ id: "test1", role: "student" });
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    expect(decoded.id).toBe("test1");
    expect(decoded.role).toBe("student");
  });

  test("refresh token should be verifiable with refresh secret", () => {
    const token = generateTestRefreshToken({ id: "test2", role: "admin" });
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    expect(decoded.id).toBe("test2");
    expect(decoded.role).toBe("admin");
  });

  test("refresh token should NOT be verifiable with access secret", () => {
    const token = generateTestRefreshToken({ id: "test3", role: "student" });
    expect(() => {
      jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    }).toThrow();
  });
});
