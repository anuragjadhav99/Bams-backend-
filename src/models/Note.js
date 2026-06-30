const mongoose = require("mongoose");
const { Schema } = mongoose;
const { PUBLISH_STATUSES, CURRENCIES } = require("../config/constants");

/**
 * Note — the eBook entity.
 *
 * A Note belongs to one Subject.  It carries its own pricing so the
 * admin can set per-note prices (₹49–199 range for single purchases).
 * `totalPages` and `samplePages` drive the reader UI and the access gate.
 *
 * Indexes
 * -------
 *  subject + publishStatus  — catalog listing: "all published notes for subject X"
 *  slug                     (unique) — URL-friendly look-ups (/notes/:slug)
 *  subject                  — fast ref look-up during access checks
 */
const noteSchema = new Schema(
  {
    /* ── ownership ────────────────────────────────────────────── */
    subject: {
      type: Schema.Types.ObjectId,
      ref: "Subject",
      required: [true, "Subject reference is required"],
      index: true,
    },

    /* ── content meta ─────────────────────────────────────────── */
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: 200,
    },

    slug: {
      type: String,
      required: [true, "Slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be kebab-case"],
    },

    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },

    /** Cover image URL (public CDN). */
    coverImage: {
      type: String,
      default: null,
    },

    /** Total number of pages (images / content blocks) in this eBook. */
    totalPages: {
      type: Number,
      required: true,
      min: [1, "Note must have at least one page"],
    },

    /**
     * How many of the first N pages are free samples.
     * Any logged-in user can view pages 1…samplePages without purchasing.
     */
    samplePages: {
      type: Number,
      required: true,
      default: 3,
      min: 0,
      validate: {
        validator: function (v) {
          return v <= this.totalPages;
        },
        message: "samplePages cannot exceed totalPages",
      },
    },

    /* ── pricing ──────────────────────────────────────────────── */
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },

    /** Optional strike-through / original price for showing discounts. */
    mrp: {
      type: Number,
      default: null,
      min: 0,
    },

    currency: {
      type: String,
      enum: CURRENCIES,
      default: "INR",
    },

    /* ── lifecycle ────────────────────────────────────────────── */
    publishStatus: {
      type: String,
      enum: {
        values: PUBLISH_STATUSES,
        message: "Publish status must be one of: " + PUBLISH_STATUSES.join(", "),
      },
      default: "draft",
    },

    publishedAt: {
      type: Date,
      default: null,
    },

    /* ── SEO / extras ─────────────────────────────────────────── */
    tags: {
      type: [String],
      default: [],
    },

    /** Author or contributor name (display only). */
    author: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "BAMS Notes Team",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ── Indexes ──────────────────────────────────────────────────── */
noteSchema.index({ subject: 1, publishStatus: 1 });

/* ── Virtuals ─────────────────────────────────────────────────── */
noteSchema.virtual("pages", {
  ref: "Page",
  localField: "_id",
  foreignField: "note",
});

module.exports = mongoose.model("Note", noteSchema);
