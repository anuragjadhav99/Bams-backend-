const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Session — tracks active reading sessions per user/device.
 *
 * Used for anti-piracy monitoring:
 *   • Detect simultaneous reading from too many devices.
 *   • Identify suspicious IP / user-agent patterns.
 *   • Auto-expire stale sessions via TTL index.
 *
 * Indexes
 * -------
 *  user + isActive           — "how many active sessions does this user have?"
 *  lastActiveAt              — TTL index auto-deletes sessions after 24 h of
 *                               inactivity (configurable via expireAfterSeconds).
 *  user + ip                 — detect same user from many IPs quickly.
 */
const sessionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
    },

    /** The Note currently being read (nullable if browsing catalog). */
    note: {
      type: Schema.Types.ObjectId,
      ref: "Note",
      default: null,
    },

    ip: {
      type: String,
      required: [true, "IP address is required"],
    },

    userAgent: {
      type: String,
      required: [true, "User agent is required"],
      maxlength: 500,
    },

    /**
     * Optional device fingerprint (generated client-side).
     * Helps distinguish devices even behind the same NAT IP.
     */
    deviceFingerprint: {
      type: String,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    /** Updated on every page-turn or heartbeat ping. */
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },

    /** Explicitly set when the user closes the reader or logs out. */
    endedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/* ── Indexes ──────────────────────────────────────────────────── */
sessionSchema.index({ user: 1, isActive: 1 });
sessionSchema.index({ user: 1, ip: 1 });

/**
 * TTL index: automatically remove session documents 24 hours after
 * their last activity.  Keeps the collection lean without manual cleanup.
 */
sessionSchema.index(
  { lastActiveAt: 1 },
  { expireAfterSeconds: 86400 } // 24 hours
);

/* ── Static helpers ───────────────────────────────────────────── */

/**
 * Count currently active sessions for a user.
 * @param {ObjectId} userId
 * @returns {Promise<number>}
 */
sessionSchema.statics.activeCountForUser = function (userId) {
  return this.countDocuments({ user: userId, isActive: true });
};

/**
 * Deactivate all sessions for a user (e.g. on password change or
 * account suspension).
 * @param {ObjectId} userId
 */
sessionSchema.statics.deactivateAll = function (userId) {
  return this.updateMany(
    { user: userId, isActive: true },
    { $set: { isActive: false, endedAt: new Date() } }
  );
};

module.exports = mongoose.model("Session", sessionSchema);
