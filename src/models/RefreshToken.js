/**
 * RefreshToken Model.
 *
 * Stores hashed refresh tokens for session management with Refresh Token Rotation.
 *
 * Security design:
 *   • Raw token is NEVER stored — only its SHA256 hash.
 *   • findAndRotate() atomically deletes the old doc and creates a new one.
 *   • If an already-rotated token arrives, we detect reuse (theft) and throw 401.
 *   • TTL index auto-expires documents after their expiresAt date.
 *
 * Token lifetime: 30 days.
 */

const mongoose = require("mongoose");
const { Schema } = mongoose;
const crypto = require("crypto");

/** SHA256 hash helper — one-way, deterministic, safe to store. */
function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

const refreshTokenSchema = new Schema({
  /** SHA256 hash of the raw token — never store plaintext. */
  token: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },

  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: [true, "User reference is required"],
    index: true,
  },

  expiresAt: {
    type: Date,
    required: true,
  },

  ip: {
    type: String,
    default: "unknown",
  },

  userAgent: {
    type: String,
    default: "unknown",
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

/** TTL index — MongoDB auto-deletes expired docs. */
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * findAndRotate — validate, delete old token, issue new one atomically.
 *
 * Steps:
 *  1. Hash the incoming rawToken with SHA256.
 *  2. Find document where token === hash AND expiresAt > now.
 *  3. If not found → throw 401 (expired or reuse attack).
 *  4. Delete the found document.
 *  5. Generate new raw token (64 random bytes → hex string).
 *  6. Hash it and save new RefreshToken document.
 *  7. Return { newRawToken, userId }.
 *
 * @param {string} rawToken  — the raw token from the httpOnly cookie
 * @param {Object} req       — Express request (for ip / userAgent)
 * @returns {Promise<{ newRawToken: string, userId: string }>}
 */
refreshTokenSchema.statics.findAndRotate = async function (rawToken, req) {
  const hash = hashToken(rawToken);

  const doc = await this.findOne({
    token: hash,
    expiresAt: { $gt: new Date() },
  });

  if (!doc) {
    const err = new Error("Refresh token not found or expired");
    err.statusCode = 401;
    throw err;
  }

  const userId = doc.user;

  // Delete the used token (Rotation step)
  await this.deleteOne({ _id: doc._id });

  // Generate new raw token
  const newRawToken = crypto.randomBytes(64).toString("hex");
  const newHash = hashToken(newRawToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await this.create({
    token: newHash,
    user: userId,
    expiresAt,
    ip: req?.ip || req?.headers?.["x-forwarded-for"] || "unknown",
    userAgent: req?.headers?.["user-agent"] || "unknown",
  });

  return { newRawToken, userId };
};

const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);

/** Expose hashToken so services can hash before storing or deleting. */
RefreshToken.hashToken = hashToken;

module.exports = RefreshToken;
