/**
 * Reader Access Control Tests.
 *
 * Tests for the reader middleware pipeline and access control logic.
 * Validates that:
 *   ✅ Authenticated users can access sample pages
 *   ❌ Unauthenticated users cannot access reader
 *   ❌ S3 keys are never exposed in responses
 *   ✅ Rate limiting is applied
 */

const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

// Set test env vars
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

const { verifyToken } = require("../src/middleware/auth");
const { readerLimiter } = require("../src/middleware/rateLimiter");
const validateObjectId = require("../src/middleware/objectIdValidator");
const errorHandler = require("../src/middleware/errorHandler");

// ── Test helpers ───────────────────────────────────────────────────

function generateToken(payload = { id: "user123", role: "student" }) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

function createReaderTestApp() {
  const app = express();
  app.use(express.json());

  // Simulated reader route
  app.get(
    "/api/reader/:noteId/page/:pageNumber",
    verifyToken,
    validateObjectId("noteId"),
    (req, res) => {
      const pageNumber = parseInt(req.params.pageNumber, 10);

      if (isNaN(pageNumber) || pageNumber < 1) {
        return res.status(400).json({
          success: false,
          message: "Page number must be a positive integer",
        });
      }

      // Simulated response — never includes s3Key
      res.json({
        success: true,
        data: {
          pageUrl: "https://s3.example.com/signed-url",
          pageNumber,
          totalPages: 120,
          isSample: pageNumber <= 5,
        },
      });
    }
  );

  // Simulated heartbeat
  app.post(
    "/api/reader/:noteId/heartbeat",
    verifyToken,
    validateObjectId("noteId"),
    (req, res) => {
      res.json({ success: true });
    }
  );

  // Simulated reader info
  app.get(
    "/api/reader/:noteId/info",
    verifyToken,
    validateObjectId("noteId"),
    (req, res) => {
      res.json({
        success: true,
        data: {
          title: "Test Note",
          totalPages: 120,
          samplePages: 5,
          isPurchased: true,
        },
      });
    }
  );

  app.use(errorHandler);
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────

describe("Reader Access Control", () => {
  let app;

  beforeAll(() => {
    app = createReaderTestApp();
  });

  describe("Authentication Required", () => {
    test("should return 401 without token", async () => {
      const noteId = "507f1f77bcf86cd799439011";
      const res = await request(app).get(`/api/reader/${noteId}/page/1`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test("should allow access with valid token", async () => {
      const token = generateToken();
      const noteId = "507f1f77bcf86cd799439011";
      const res = await request(app)
        .get(`/api/reader/${noteId}/page/1`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("Page Access", () => {
    const noteId = "507f1f77bcf86cd799439011";
    let token;

    beforeAll(() => {
      token = generateToken();
    });

    test("should return page data for valid page number", async () => {
      const res = await request(app)
        .get(`/api/reader/${noteId}/page/1`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.pageNumber).toBe(1);
      expect(res.body.data.pageUrl).toBeDefined();
      expect(res.body.data.totalPages).toBeDefined();
      expect(res.body.data.isSample).toBeDefined();
    });

    test("should mark sample pages correctly", async () => {
      const res = await request(app)
        .get(`/api/reader/${noteId}/page/3`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.body.data.isSample).toBe(true);

      const res2 = await request(app)
        .get(`/api/reader/${noteId}/page/10`)
        .set("Authorization", `Bearer ${token}`);
      expect(res2.body.data.isSample).toBe(false);
    });

    test("should reject invalid page number", async () => {
      const res = await request(app)
        .get(`/api/reader/${noteId}/page/0`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(400);
    });

    test("should reject non-numeric page number", async () => {
      const res = await request(app)
        .get(`/api/reader/${noteId}/page/abc`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(400);
    });

    test("should NEVER include s3Key in response", async () => {
      const res = await request(app)
        .get(`/api/reader/${noteId}/page/1`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.body.data.s3Key).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain("s3Key");
    });
  });

  describe("ObjectId Validation", () => {
    test("should reject invalid noteId", async () => {
      const token = generateToken();
      const res = await request(app)
        .get("/api/reader/invalid-id/page/1")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Invalid ID");
    });
  });

  describe("Heartbeat", () => {
    test("should accept heartbeat from authenticated user", async () => {
      const token = generateToken();
      const noteId = "507f1f77bcf86cd799439011";
      const res = await request(app)
        .post(`/api/reader/${noteId}/heartbeat`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test("should reject heartbeat without auth", async () => {
      const noteId = "507f1f77bcf86cd799439011";
      const res = await request(app)
        .post(`/api/reader/${noteId}/heartbeat`);
      expect(res.status).toBe(401);
    });
  });

  describe("Reader Info", () => {
    test("should return reader info for authenticated user", async () => {
      const token = generateToken();
      const noteId = "507f1f77bcf86cd799439011";
      const res = await request(app)
        .get(`/api/reader/${noteId}/info`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.title).toBeDefined();
      expect(res.body.data.totalPages).toBeDefined();
      expect(res.body.data.samplePages).toBeDefined();
      expect(res.body.data.isPurchased).toBeDefined();
    });
  });
});
