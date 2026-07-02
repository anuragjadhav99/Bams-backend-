/**
 * OTP Model.
 *
 * Tracks secure one-time passwords for passwordless email authentication.
 *
 * Security constraints:
 *   • 6-digit random code stored as bcrypt hash — plaintext never persisted.
 *   • Expires after 10 minutes (TTL index auto-deletes the document).
 *   • Maximum 5 verification attempts before the document is forcibly deleted.
 *   • Maximum 5 resends; 30-second delay enforced between resends via createdAt.
 *   • Deleting the document on success prevents replay attacks.
 */

const mongoose = require("mongoose");
const { Schema } = mongoose;

const otpSchema = new Schema({
  /** Normalised email (lowercase, trimmed). Indexed for fast lookups. */
  email: {
    type: String,
    required: [true, "Email is required"],
    lowercase: true,
    trim: true,
    index: true,
  },

  /** bcrypt hash of the plaintext 6-digit code. */
  otpHash: {
    type: String,
    required: true,
  },

  /** Number of failed verification attempts for this OTP. Max 5. */
  attempts: {
    type: Number,
    default: 0,
    max: 5,
  },

  /**
   * How many times this OTP has been re-sent for this email in the current
   * window.  Carried over from the previous document when re-sending.
   * Max 5.
   */
  resends: {
    type: Number,
    default: 0,
    max: 5,
  },

  /** Absolute expiry timestamp. TTL index uses this to auto-delete the doc. */
  expiresAt: {
    type: Date,
    required: true,
    // Default: 10 minutes from now
    default: () => new Date(Date.now() + 10 * 60 * 1000),
  },

  /**
   * When this document was created.
   * Used to enforce the 30-second resend delay:
   *   if (Date.now() - createdAt < 30_000) → reject resend
   */
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

/** TTL index — MongoDB auto-removes documents after expiresAt. */
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("OTP", otpSchema);
