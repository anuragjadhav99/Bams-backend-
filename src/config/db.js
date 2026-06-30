const mongoose = require("mongoose");

/**
 * Connect to MongoDB.
 * Call once at app startup; Mongoose handles connection pooling internally.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/bams_study_notes";

  await mongoose.connect(uri, {
    // Mongoose 8 uses the new driver defaults; these are explicit for clarity.
    autoIndex: process.env.NODE_ENV !== "production", // disable auto-index in prod
  });

  console.log(`✅  MongoDB connected → ${mongoose.connection.host}`);
}

module.exports = connectDB;
