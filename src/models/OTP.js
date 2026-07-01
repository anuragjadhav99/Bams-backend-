const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * OTP Schema — tracks secure one-time passwords for authentication.
 *
 * Implements security logic:
 *   • 6-digit random code (stored as bcrypt hash)
 *   • Expires after 5 minutes
 *   • Tracks verification attempts (max 5)
 *   • Tracks resend count (max 5)
 */
const otpSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    resends: {
      type: Number,
      default: 0,
    },
    lastResentAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to automatically delete expired OTPs from the database
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("OTP", otpSchema);
