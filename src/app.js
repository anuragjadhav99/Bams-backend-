/**
 * BAMS Study Notes API — Express Application.
 *
 * Configures all middleware, routes, and error handlers.
 * Exported as a standalone `app` so it can be used by both
 * the server (index.js) and integration tests (supertest).
 *
 * @module app
 */

// 1. Require statements
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const helmet = require("helmet");
const { env } = require("./config/env");
const logger = require("./config/logger");
const { setupSwagger } = require("./docs/swagger");

// Register all Mongoose models (side-effect: compiles schemas)
require("./models");

// Middleware imports
const { apiLimiter } = require("./middleware/rateLimiter");
const { trimStrings } = require("./middleware/sanitize");
const errorHandler = require("./middleware/errorHandler");

// Route imports
const healthRoutes = require("./routes/health");
const authRoutes = require("./routes/auth");
const notesRoutes = require("./routes/notes");
const readerRoutes = require("./routes/reader");
const paymentRoutes = require("./routes/payment");
const userRoutes = require("./routes/user");
const adminRoutes = require("./routes/admin");

const app = express();

// 2. CORS configurations
const corsOptions = {
  origin: "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));

// 3. OPTIONS preflight handler (Express 5 + path-to-regexp v8 RegExp wildcard compatible)
app.options(/.*/, cors(corsOptions));

// 4. Cookie parser
app.use(cookieParser());

// 5. Raw body parser for webhook, followed by express.json()
// Raw body for Razorpay webhook signature verification must be BEFORE express.json()
app.use("/api/payment/webhook", express.raw({ type: "application/json" }), (req, _res, next) => {
  req.rawBody = req.body.toString("utf-8");
  try {
    req.body = JSON.parse(req.rawBody);
  } catch {
    // Leave body as-is if not valid JSON
  }
  next();
});
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// 6. Morgan logger
app.use(
  morgan("dev", {
    stream: {
      write: (message) => logger.info(message.trim(), { category: "http" }),
    },
  })
);

// 7. Helmet headers
app.use(helmet());

// 8. Health check endpoint (including /api/health as inline fallback)
app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Server is running" });
});
app.use("/api/health", healthRoutes); // Include full structured health info if hit explicitly

// 9. Input sanitization (trim strings) and Global rate limiter
app.use(trimStrings);
app.use("/api", apiLimiter);

// Swagger API docs setup
setupSwagger(app);

// 10. Auth Router
app.use("/api/auth", authRoutes);

// 11. Notes Router
app.use("/api", notesRoutes); // mounts /api/subjects and /api/notes

// 12. Admin Router
app.use("/api/admin", adminRoutes);

// 13. All other routes
app.use("/api/reader", readerRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/user", userRoutes);

app.get("/", (_req, res) => {
  res.json({
    success: true,
    service: "BAMS Study Notes API",
    version: "1.0.0",
    status: "ok",
  });
});

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// 14. Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
