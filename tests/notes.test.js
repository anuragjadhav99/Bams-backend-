/**
 * Notes Catalog Tests.
 *
 * Tests for notes catalog endpoints (unit tests for controller logic).
 * These test the middleware pipeline, validation, and response format
 * without requiring a database connection.
 */

const request = require("supertest");
const express = require("express");

// Set test env vars
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

const { optionalAuth } = require("../src/middleware/auth");
const errorHandler = require("../src/middleware/errorHandler");
const validateObjectId = require("../src/middleware/objectIdValidator");

// ── Test app ───────────────────────────────────────────────────────

function createTestApp() {
  const app = express();
  app.use(express.json());

  // Test route with ObjectId validation
  app.get("/notes/:id", validateObjectId("id"), (req, res) => {
    res.json({ success: true, data: { id: req.params.id } });
  });

  // Test route with multiple ObjectId params
  app.get("/notes/:noteId/subject/:subjectId",
    validateObjectId("noteId", "subjectId"),
    (req, res) => {
      res.json({ success: true, data: req.params });
    }
  );

  // Test route with optionalAuth
  app.get("/public", optionalAuth, (req, res) => {
    res.json({ success: true, data: { user: req.user } });
  });

  app.use(errorHandler);
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────

describe("Notes Catalog", () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  describe("ObjectId Validation", () => {
    test("should accept valid MongoDB ObjectId", async () => {
      const validId = "507f1f77bcf86cd799439011";
      const res = await request(app).get(`/notes/${validId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(validId);
    });

    test("should reject invalid ObjectId with 400", async () => {
      const res = await request(app).get("/notes/invalid-id");
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Invalid ID");
    });

    test("should reject short ObjectId", async () => {
      const res = await request(app).get("/notes/12345");
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test("should validate multiple ObjectId params", async () => {
      const res = await request(app).get("/notes/invalid1/subject/invalid2");
      expect(res.status).toBe(400);
      expect(res.body.errors).toHaveLength(2);
    });

    test("should pass when both ObjectIds are valid", async () => {
      const id1 = "507f1f77bcf86cd799439011";
      const id2 = "507f1f77bcf86cd799439012";
      const res = await request(app).get(`/notes/${id1}/subject/${id2}`);
      expect(res.status).toBe(200);
    });
  });

  describe("Optional Auth on Public Routes", () => {
    const jwt = require("jsonwebtoken");

    test("should work without token", async () => {
      const res = await request(app).get("/public");
      expect(res.status).toBe(200);
      expect(res.body.data.user).toBeNull();
    });

    test("should attach user with valid token", async () => {
      const token = jwt.sign(
        { id: "user1", role: "student" },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: "15m" }
      );
      const res = await request(app)
        .get("/public")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe("user1");
    });
  });
});

describe("Error Handler", () => {
  test("should handle Mongoose ValidationError", async () => {
    const app = express();
    app.get("/test", (_req, _res, next) => {
      const err = new Error("Validation failed");
      err.name = "ValidationError";
      err.errors = {
        title: { message: "Title is required" },
        price: { message: "Price must be positive" },
      };
      next(err);
    });
    app.use(errorHandler);

    const res = await request(app).get("/test");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toHaveLength(2);
    expect(res.body.errors[0].field).toBe("title");
  });

  test("should handle CastError", async () => {
    const app = express();
    app.get("/test", (_req, _res, next) => {
      const err = new Error("Cast error");
      err.name = "CastError";
      err.value = "bad-id";
      next(err);
    });
    app.use(errorHandler);

    const res = await request(app).get("/test");
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Invalid ID");
  });

  test("should handle duplicate key error (11000)", async () => {
    const app = express();
    app.get("/test", (_req, _res, next) => {
      const err = new Error("Duplicate");
      err.code = 11000;
      err.keyPattern = { email: 1 };
      next(err);
    });
    app.use(errorHandler);

    const res = await request(app).get("/test");
    expect(res.status).toBe(409);
    expect(res.body.message).toContain("duplicate");
  });

  test("should return 500 for unknown errors", async () => {
    const app = express();
    app.get("/test", (_req, _res, next) => {
      next(new Error("Something unexpected"));
    });
    app.use(errorHandler);

    const res = await request(app).get("/test");
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
