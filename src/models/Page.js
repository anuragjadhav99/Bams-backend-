const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Page — a single page of an eBook (Note).
 *
 * Each page is stored as a private object in AWS S3 (image or encrypted
 * content block).  The `s3Key` field is **never** returned to the client;
 * the backend uses it internally to generate short-lived signed URLs or
 * stream the content after verifying purchase status.
 *
 * Indexes
 * -------
 *  note + pageNumber       (unique compound) — fetch a specific page quickly
 *                                              and guarantee no duplicates.
 *  note + isSample         — fetch only sample pages for preview.
 *  note                    — cover ordering look-ups.
 */
const pageSchema = new Schema(
  {
    note: {
      type: Schema.Types.ObjectId,
      ref: "Note",
      required: [true, "Note reference is required"],
    },

    /** 1-based page number within the parent Note. */
    pageNumber: {
      type: Number,
      required: [true, "Page number is required"],
      min: [1, "Page number must be at least 1"],
    },

    /**
     * Private S3 object key, e.g.
     *   "notes/<noteId>/pages/007.webp"
     *
     * ⚠️  NEVER expose this value to the client.
     *     Use `select: false` so Mongoose strips it from default queries.
     */
    s3Key: {
      type: String,
      required: [true, "S3 key is required"],
      select: false, // excluded from query results by default
    },

    /**
     * MIME type of the stored object.
     * Helps the backend set the correct Content-Type header when streaming.
     */
    contentType: {
      type: String,
      default: "image/webp",
      enum: [
        "image/webp",
        "image/png",
        "image/jpeg",
        "application/octet-stream", // encrypted block
      ],
    },

    /**
     * True if this page is part of the free sample set.
     * Derived from the Note's `samplePages` count, but stored here for
     * fast query filtering without needing to join back to the Note.
     */
    isSample: {
      type: Boolean,
      default: false,
    },

    /** Optional alt text / page title for accessibility or search. */
    altText: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

/* ── Indexes ──────────────────────────────────────────────────── */
pageSchema.index({ note: 1, pageNumber: 1 }, { unique: true });
pageSchema.index({ note: 1, isSample: 1 });

/* ── Static helper ────────────────────────────────────────────── */

/**
 * Return the S3 key for a specific page, bypassing `select: false`.
 * Used internally by the content-delivery layer — never call from a
 * route handler that returns JSON to the client.
 *
 * @param {ObjectId} noteId
 * @param {Number}   pageNumber
 * @returns {Promise<string|null>}
 */
pageSchema.statics.getS3Key = async function (noteId, pageNumber) {
  const doc = await this.findOne({ note: noteId, pageNumber })
    .select("+s3Key")
    .lean();
  return doc?.s3Key ?? null;
};

module.exports = mongoose.model("Page", pageSchema);
