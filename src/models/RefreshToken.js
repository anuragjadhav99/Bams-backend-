const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * RefreshToken Schema — manages JWT refresh tokens.
 *
 * Implements session tracking and Refresh Token Rotation:
 *   • Store tokens and match against active user sessions
 *   • Auto-expire after 30 days (TTL index)
 *   • Associated IP and UserAgent for security/admin tracking
 */
const refreshTokenSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    ip: {
      type: String,
      default: "unknown",
    },
    userAgent: {
      type: String,
      default: "unknown",
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

// TTL index to automatically expire refresh tokens after their expiry date
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
