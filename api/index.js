/**
 * Vercel Serverless Function Entry Point.
 *
 * Wraps the existing Express app for Vercel's serverless environment.
 * This file is ONLY used by Vercel — local development still uses src/index.js.
 *
 * Flow:
 *   1. Validate environment variables (reuses existing validateEnv)
 *   2. Connect to MongoDB with connection caching
 *   3. Export the Express app wrapped by serverless-http
 */

const serverless = require("serverless-http");
const { validateEnv } = require("../src/config/env");
const connectDB = require("../src/config/db");
const app = require("../src/app");

// Validate env vars once on cold start
validateEnv();

/**
 * Vercel handler.
 *
 * Ensures MongoDB is connected before every request.
 * On warm invocations the cached connection is reused instantly.
 */
const handler = serverless(app);

module.exports = async (req, res) => {
  // Ensure DB is connected (cached on warm invocations)
  await connectDB();
  return handler(req, res);
};
