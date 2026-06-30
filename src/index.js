/**
 * BAMS Study Notes API — Server Entry Point.
 *
 * Connects to the database and starts the HTTP server.
 * Handles graceful shutdown on SIGTERM / SIGINT.
 *
 * All Express configuration lives in ./app.js.
 */

// ── Load and validate environment FIRST ───────────────────────────
const { validateEnv, env } = require("./config/env");
validateEnv();

const app = require("./app");
const connectDB = require("./config/db");
const logger = require("./config/logger");

const PORT = env.PORT;

/** @type {import("http").Server|null} */
let server = null;

/**
 * Start the application.
 * Connects to MongoDB and binds the HTTP server.
 */
async function start() {
  try {
    await connectDB();

    server = app.listen(PORT, "0.0.0.0", () => {
      logger.info(`🚀  BAMS API running on http://localhost:${PORT}`);
      logger.info(`📖  API docs: http://localhost:${PORT}/api/docs`);
      logger.info(`🏥  Health:   http://localhost:${PORT}/api/health`);
      logger.info(`🌐  CORS:     ${env.FRONTEND_URL}`);
      logger.info(`📦  Env:      ${env.NODE_ENV}`);
    });
  } catch (err) {
    logger.error("❌  Failed to start server:", err);
    process.exit(1);
  }
}

/**
 * Graceful shutdown — close HTTP server, then DB connection.
 * @param {string} signal - The signal that triggered shutdown
 */
async function shutdown(signal) {
  logger.info(`\n🛑  ${signal} received — shutting down gracefully …`);

  if (server) {
    server.close(() => {
      logger.info("✅  HTTP server closed");
    });
  }

  try {
    const mongoose = require("mongoose");
    await mongoose.connection.close();
    logger.info("✅  MongoDB connection closed");
  } catch (err) {
    logger.error("Error closing MongoDB connection:", err);
  }

  process.exit(0);
}

/* ── Process event handlers ────────────────────────────────────── */
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err);
  process.exit(1);
});

start();
