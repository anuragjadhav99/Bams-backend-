const mongoose = require("mongoose");
const { Schema } = mongoose;
const { ACADEMIC_YEARS } = require("../config/constants");

/**
 * Subject — represents one subject within a BAMS academic year.
 *
 * Subjects are reference data (seeded, rarely changed).  Notes belong
 * to a Subject, and year-package purchases reference the `year` enum
 * value stored here.
 *
 * Indexes
 * -------
 *  slug           (unique)       — URL-friendly look-ups  (/subjects/:slug)
 *  year + sortOrder              — ordered catalog listing per year
 *  year           (alone)        — fast filter for "all subjects in year X"
 */
const subjectSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Subject name is required"],
      trim: true,
      maxlength: 120,
    },

    slug: {
      type: String,
      required: [true, "Slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be kebab-case"],
    },

    year: {
      type: String,
      required: [true, "Academic year is required"],
      enum: {
        values: ACADEMIC_YEARS,
        message: "Year must be one of: " + ACADEMIC_YEARS.join(", "),
      },
    },

    /** Display order inside its year (1, 2, 3 …). */
    sortOrder: {
      type: Number,
      required: true,
      min: 0,
    },

    /** Optional short description shown in the catalog. */
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    /** Cover / thumbnail image URL (public S3 or CDN). */
    coverImage: {
      type: String,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ── Indexes ──────────────────────────────────────────────────── */
subjectSchema.index({ year: 1, sortOrder: 1 });
subjectSchema.index({ year: 1 });

/* ── Virtuals ─────────────────────────────────────────────────── */
subjectSchema.virtual("notes", {
  ref: "Note",
  localField: "_id",
  foreignField: "subject",
});

module.exports = mongoose.model("Subject", subjectSchema);
