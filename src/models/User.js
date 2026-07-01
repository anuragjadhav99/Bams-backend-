const mongoose = require("mongoose");
const { Schema } = mongoose;
const {
  AUTH_PROVIDERS,
  USER_ROLES,
  ACCOUNT_STATUSES,
} = require("../config/constants");

/**
 * User — authentication, profile, and role management.
 *
 * Supports two auth flows:
 *   1. Google OAuth  → googleId is set, passwordHash is absent.
 *   2. Email + OTP   → phone/email used for OTP delivery, no permanent password.
 *
 * Indexes
 * -------
 *  email        (unique)  — login look-ups and duplicate prevention.
 *  googleId     (unique, sparse) — fast Google OAuth look-ups; sparse so
 *                                    email-OTP users (null googleId) don't collide.
 *  phone        (unique, sparse) — optional phone-based OTP look-up.
 */
const userSchema = new Schema(
  {
    /* ── identity ─────────────────────────────────────────────── */
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: 120,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },

    phone: {
      type: String,
      trim: true,
      match: [/^\+?[1-9]\d{6,14}$/, "Please enter a valid phone number"],
    },

    avatar: {
      type: String, // URL (from Google profile or uploaded to S3)
      default: null,
    },

    /* ── authentication ───────────────────────────────────────── */
    authProvider: {
      type: String,
      required: true,
      enum: {
        values: AUTH_PROVIDERS,
        message: "Auth provider must be one of: " + AUTH_PROVIDERS.join(", "),
      },
    },

    googleId: {
      type: String,
    },

    /** Last OTP hash — only relevant for email_otp provider. */
    otpHash: {
      type: String,
      default: null,
      select: false, // never sent to the client by default
    },

    otpExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },

    /* ── role & status ────────────────────────────────────────── */
    role: {
      type: String,
      enum: {
        values: USER_ROLES,
        message: "Role must be one of: " + USER_ROLES.join(", "),
      },
      default: "student",
    },

    accountStatus: {
      type: String,
      enum: {
        values: ACCOUNT_STATUSES,
        message: "Account status must be one of: " + ACCOUNT_STATUSES.join(", "),
      },
      default: "active",
    },

    /** Soft-delete timestamp. */
    deletedAt: {
      type: Date,
      default: null,
    },

    /* ── metadata ─────────────────────────────────────────────── */
    lastLoginAt: {
      type: Date,
      default: null,
    },

    loginMethod: {
      type: String,
      default: null, // "google" or "email_otp"
    },

    failedOTPAttempts: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true, // adds createdAt, updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ── Indexes ──────────────────────────────────────────────────── */
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });
userSchema.index({ phone: 1 }, { unique: true, sparse: true });

/* ── Instance helpers ─────────────────────────────────────────── */
userSchema.methods.isActive = function () {
  return this.accountStatus === "active";
};

userSchema.virtual("googleLinked").get(function () {
  return !!this.googleId;
});

module.exports = mongoose.model("User", userSchema);
