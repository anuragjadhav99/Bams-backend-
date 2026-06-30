/**
 * Environment variable validation.
 *
 * Validates that all required environment variables are present at startup.
 * The server will fail fast with a clear error message if any are missing.
 *
 * Usage:
 *   require("./config/env");  // call before anything else in index.js
 */

const path = require("path");

// Load base .env first, then .env.local as local-only overrides
require("dotenv").config({ path: path.resolve(process.cwd(), ".env"), override: true });
require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const REQUIRED_VARS = [
  "MONGODB_URI",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_S3_BUCKET",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
];

const OPTIONAL_VARS = [
  { key: "PORT", default: "5000" },
  { key: "NODE_ENV", default: "development" },
  { key: "FRONTEND_URL", default: "http://localhost:3000" },
  { key: "SMTP_HOST", default: "" },
  { key: "SMTP_PORT", default: "587" },
  { key: "SMTP_USER", default: "" },
  { key: "SMTP_PASS", default: "" },
  { key: "SMTP_FROM", default: "noreply@bamsnotes.in" },
];

/**
 * Validate all required environment variables are set.
 * Applies defaults for optional variables.
 * @throws {Error} If any required variable is missing.
 */
function validateEnv() {
  const missing = [];

  for (const key of REQUIRED_VARS) {
    if (!process.env[key] || process.env[key].trim() === "") {
      missing.push(key);
    }
  }

  // Apply defaults for optional vars
  for (const { key, default: defaultValue } of OPTIONAL_VARS) {
    if (!process.env[key] || process.env[key].trim() === "") {
      process.env[key] = defaultValue;
    }
  }

  if (missing.length > 0) {
    console.error("\n❌  Missing required environment variables:\n");
    missing.forEach((key) => console.error(`   • ${key}`));
    console.error(
      "\n   Copy .env.example to .env and fill in the values.\n"
    );
    process.exit(1);
  }
}

/**
 * Typed accessor for commonly used env vars.
 * Centralises access so changes only happen here.
 */
const env = {
  get PORT() {
    return parseInt(process.env.PORT, 10) || 5000;
  },
  get NODE_ENV() {
    return process.env.NODE_ENV || "development";
  },
  get isDev() {
    return this.NODE_ENV === "development";
  },
  get isProd() {
    return this.NODE_ENV === "production";
  },

  // Database
  get MONGODB_URI() {
    return process.env.MONGODB_URI;
  },

  // JWT
  get JWT_ACCESS_SECRET() {
    return process.env.JWT_ACCESS_SECRET;
  },
  get JWT_REFRESH_SECRET() {
    return process.env.JWT_REFRESH_SECRET;
  },

  // Google OAuth
  get GOOGLE_CLIENT_ID() {
    return process.env.GOOGLE_CLIENT_ID;
  },
  get GOOGLE_CLIENT_SECRET() {
    return process.env.GOOGLE_CLIENT_SECRET;
  },

  // SMTP
  get SMTP_HOST() {
    return process.env.SMTP_HOST;
  },
  get SMTP_PORT() {
    return parseInt(process.env.SMTP_PORT, 10) || 587;
  },
  get SMTP_USER() {
    return process.env.SMTP_USER;
  },
  get SMTP_PASS() {
    return process.env.SMTP_PASS;
  },
  get SMTP_FROM() {
    return process.env.SMTP_FROM;
  },
  get isSmtpConfigured() {
    return !!(this.SMTP_HOST && this.SMTP_USER && this.SMTP_PASS);
  },

  // AWS S3
  get AWS_REGION() {
    return process.env.AWS_REGION;
  },
  get AWS_ACCESS_KEY_ID() {
    return process.env.AWS_ACCESS_KEY_ID;
  },
  get AWS_SECRET_ACCESS_KEY() {
    return process.env.AWS_SECRET_ACCESS_KEY;
  },
  get AWS_S3_BUCKET() {
    return process.env.AWS_S3_BUCKET;
  },

  // Razorpay
  get RAZORPAY_KEY_ID() {
    return process.env.RAZORPAY_KEY_ID;
  },
  get RAZORPAY_KEY_SECRET() {
    return process.env.RAZORPAY_KEY_SECRET;
  },
  get RAZORPAY_WEBHOOK_SECRET() {
    return process.env.RAZORPAY_WEBHOOK_SECRET;
  },

  // Frontend
  get FRONTEND_URL() {
    return process.env.FRONTEND_URL;
  },
};

module.exports = { validateEnv, env };
