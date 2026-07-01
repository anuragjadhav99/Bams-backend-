/**
 * BAMS Study Notes API — Express Application.
 *
 * Configures all middleware, routes, and error handlers.
 * Exported as a standalone `app` so it can be used by both
 * the server (index.js) and integration tests (supertest).
 *
 * @module app
 */

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const { env } = require("./config/env");
const logger = require("./config/logger");
const { setupSwagger } = require("./docs/swagger");

// Register all Mongoose models (side-effect: compiles schemas)
require("./models");

// ── Middleware imports ─────────────────────────────────────────────
const { apiLimiter } = require("./middleware/rateLimiter");
const { trimStrings } = require("./middleware/sanitize");
const errorHandler = require("./middleware/errorHandler");

// ── Route imports ─────────────────────────────────────────────────
const healthRoutes = require("./routes/health");
const authRoutes = require("./routes/auth");
const notesRoutes = require("./routes/notes");
const readerRoutes = require("./routes/reader");
const paymentRoutes = require("./routes/payment");
const userRoutes = require("./routes/user");
const adminRoutes = require("./routes/admin");

const app = express();

/* ── CORS — restricted to frontend URL only ────────────────────── */
const corsOptions = {
  origin: "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));

// Explicitly respond to ALL OPTIONS preflight requests.
// Without this, the browser's preflight hangs and the POST never fires.
// Express 5 + path-to-regexp v8: glob wildcards removed; use a JS RegExp instead.
app.options(/.*/, cors(corsOptions));

/* ── Security headers ──────────────────────────────────────────── */
app.use(helmet());


/* ── Request logging ───────────────────────────────────────────── */
app.use(
  morgan("dev", {
    stream: {
      write: (message) => logger.info(message.trim(), { category: "http" }),
    },
  })
);

/* ── Body parsing ──────────────────────────────────────────────── */
// Raw body for Razorpay webhook signature verification
// Must be BEFORE express.json() for the webhook route
app.use("/api/payment/webhook", express.raw({ type: "application/json" }), (req, _res, next) => {
  req.rawBody = req.body.toString("utf-8");
  try {
    req.body = JSON.parse(req.rawBody);
  } catch {
    // Leave body as-is if not valid JSON
  }
  next();
});

// JSON body parser for all other routes
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* ── Cookie parsing ────────────────────────────────────────────── */
app.use(cookieParser());

/* ── Input sanitization ────────────────────────────────────────── */
app.use(trimStrings);

/* ── Global rate limiter ───────────────────────────────────────── */
app.use("/api", apiLimiter);

/* ── Swagger API docs ──────────────────────────────────────────── */
setupSwagger(app);

/* ── Routes ────────────────────────────────────────────────────── */
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", notesRoutes);          // mounts /api/subjects and /api/notes
app.use("/api/reader", readerRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/user", userRoutes);
app.use("/api/admin", adminRoutes);

app.get("/", (_req, res) => {
  res.json({
    success: true,
    service: "BAMS Study Notes API",
    version: "1.0.0",
    status: "ok",
  });
});

/* ── 404 handler ───────────────────────────────────────────────── */
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

/* ── Global error handler (must be last) ───────────────────────── */
app.use(errorHandler);

module.exports = app;
