const mongoose = require("mongoose");

/**
 * Cached connection promise.
 *
 * In serverless environments (Vercel), each function instance keeps its own
 * module-level state between warm invocations.  By caching the connection
 * promise we avoid opening a new connection on every request.
 *
 * In traditional server mode (index.js → app.listen), this is called once
 * at startup and the cache is equally harmless.
 *
 * @type {Promise<typeof mongoose>|null}
 */
let cached = null;

/**
 * Connect to MongoDB with connection caching.
 *
 * - Cold start  → creates a new connection and caches the promise.
 * - Warm invoke → returns the cached promise immediately.
 * - If the connection was dropped (readyState 0), reconnects.
 *
 * @returns {Promise<typeof mongoose>}
 */
async function connectDB() {
  // Already connected — fast path for warm invocations
  if (cached && mongoose.connection.readyState === 1) {
    return cached;
  }

  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/bams_study_notes";

  cached = mongoose.connect(uri, {
    // Mongoose 8 uses the new driver defaults; these are explicit for clarity.
    autoIndex: process.env.NODE_ENV !== "production", // disable auto-index in prod
  });

  await cached;
  console.log(`✅  MongoDB connected → ${mongoose.connection.host}`);
  return cached;
}

module.exports = connectDB;
