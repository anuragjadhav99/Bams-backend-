/**
 * Winston logger configuration.
 *
 * Provides structured, level-based logging with security rules:
 *   ✅  Logs: auth events, payment events, reader access, API errors
 *   ❌  Never logs: OTP values, JWT tokens, refresh tokens, passwords, secrets
 *
 * In development → coloured console output.
 * In production  → JSON format + file transport.
 */

const winston = require("winston");

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

/** Custom format for development console output. */
const devFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${ts} [${level}]: ${stack || message}${metaStr}`;
});

/**
 * Redact sensitive fields from log metadata.
 * Prevents accidental exposure of secrets in logs.
 */
const REDACTED_FIELDS = [
  "otp",
  "otpHash",
  "otpCode",
  "password",
  "passwordHash",
  "accessToken",
  "refreshToken",
  "token",
  "secret",
  "s3Key",
  "razorpaySignature",
  "gatewaySignature",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "AWS_SECRET_ACCESS_KEY",
  "SMTP_PASS",
];

const redactSensitive = winston.format((info) => {
  for (const field of REDACTED_FIELDS) {
    if (info[field] !== undefined) {
      info[field] = "[REDACTED]";
    }
    // Check nested meta object
    if (info.meta && info.meta[field] !== undefined) {
      info.meta[field] = "[REDACTED]";
    }
  }
  return info;
});

const isDev = (process.env.NODE_ENV || "development") === "development";

const transports = [
  new winston.transports.Console({
    format: isDev
      ? combine(colorize(), timestamp({ format: "HH:mm:ss" }), devFormat)
      : combine(timestamp(), json()),
  }),
];

// In production, also write to files (skip on Vercel — read-only filesystem)
if (!isDev && !process.env.VERCEL) {
  transports.push(
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 5 * 1024 * 1024, // 5 MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: "logs/combined.log",
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
    })
  );
}

const logger = winston.createLogger({
  level: isDev ? "debug" : "info",
  format: combine(
    redactSensitive(),
    errors({ stack: true }),
    timestamp(),
    isDev ? devFormat : json()
  ),
  defaultMeta: { service: "bams-api" },
  transports,
  // Don't exit on uncaught exceptions — let the process manager handle it
  exitOnError: false,
});

/**
 * Log an authentication event.
 * @param {"login"|"logout"|"otp_sent"|"otp_verified"|"token_refresh"|"login_failed"} action
 * @param {Object} meta - { userId, email, provider, ip }
 */
logger.auth = (action, meta = {}) => {
  logger.info(`AUTH: ${action}`, { category: "auth", action, ...meta });
};

/**
 * Log a payment event.
 * @param {"order_created"|"payment_verified"|"payment_failed"|"webhook_received"|"subscription_created"} action
 * @param {Object} meta - { userId, orderId, amount, gateway }
 */
logger.payment = (action, meta = {}) => {
  logger.info(`PAYMENT: ${action}`, { category: "payment", action, ...meta });
};

/**
 * Log a reader access event.
 * @param {"page_accessed"|"access_denied"|"session_started"|"heartbeat"} action
 * @param {Object} meta - { userId, noteId, pageNumber, ip }
 */
logger.reader = (action, meta = {}) => {
  logger.info(`READER: ${action}`, { category: "reader", action, ...meta });
};

/**
 * Log an API error (non-validation).
 * @param {string} message
 * @param {Error} error
 * @param {Object} meta
 */
logger.apiError = (message, error, meta = {}) => {
  logger.error(message, {
    category: "api_error",
    error: error.message,
    stack: error.stack,
    ...meta,
  });
};

module.exports = logger;
