/**
 * Nodemailer Transport Configuration.
 *
 * Provides a lazy-initialised singleton SMTP transport.
 * In development without SMTP credentials, returns null
 * (callers should fall back to console logging).
 *
 * @module config/email
 */

const nodemailer = require("nodemailer");
const { env } = require("./env");
const logger = require("./logger");

/** @type {import("nodemailer").Transporter|null} */
let transporter = null;

/**
 * Get or create the Nodemailer transport singleton.
 *
 * @returns {import("nodemailer").Transporter|null} Transport instance, or null if SMTP is not configured.
 */
function getTransport() {
  if (transporter) return transporter;

  if (!env.isSmtpConfigured) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  return transporter;
}

module.exports = { getTransport };
