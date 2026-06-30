/**
 * Health Check Route.
 *
 * GET /api/health — Detailed health check for load balancers, monitoring,
 * and operational dashboards.
 *
 * Returns service name, version, environment, uptime, memory usage,
 * and MongoDB connection status.
 */

const { Router } = require("express");
const mongoose = require("mongoose");

const router = Router();

/**
 * GET /api/health
 * @returns {Object} Detailed health status
 */
router.get("/", (_req, res) => {
  const memUsage = process.memoryUsage();

  const dbStates = ["disconnected", "connected", "connecting", "disconnecting"];
  const dbState = dbStates[mongoose.connection.readyState] || "unknown";

  const isHealthy = mongoose.connection.readyState === 1;

  const status = isHealthy ? 200 : 503;

  res.status(status).json({
    success: isHealthy,
    service: "BAMS Study Notes API",
    version: "1.0.0",
    status: isHealthy ? "ok" : "degraded",
    environment: process.env.NODE_ENV || "development",
    uptime: `${Math.floor(process.uptime())}s`,
    timestamp: new Date().toISOString(),
    database: {
      status: dbState,
      host: mongoose.connection.host || null,
      name: mongoose.connection.name || null,
    },
    memory: {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    },
  });
});

module.exports = router;
