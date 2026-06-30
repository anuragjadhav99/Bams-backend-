/**
 * Centralised enums & constants shared across schemas and business logic.
 * Import from here so values stay consistent everywhere.
 */

/** Academic years offered in the BAMS programme. */
const ACADEMIC_YEARS = Object.freeze([
  "first_year",
  "second_year",
  "third_year",
  "final_year",
]);

/** Auth providers the platform supports. */
const AUTH_PROVIDERS = Object.freeze(["google", "email_otp"]);

/** User roles. */
const USER_ROLES = Object.freeze(["student", "admin"]);

/** Account status lifecycle. */
const ACCOUNT_STATUSES = Object.freeze(["active", "suspended", "deleted"]);

/** Purchase types — these determine which entitlement check path to follow. */
const ORDER_TYPES = Object.freeze([
  "single_note",
  "year_package",
  "full_package",
  "subscription",
]);

/** Payment gateways the backend can talk to. */
const PAYMENT_GATEWAYS = Object.freeze(["razorpay", "cashfree", "phonepe"]);

/** Order payment status lifecycle. */
const ORDER_STATUSES = Object.freeze([
  "created",    // order created, payment not yet attempted
  "pending",    // payment initiated but not confirmed
  "paid",       // payment confirmed by gateway webhook
  "failed",     // payment failed / declined
  "refunded",   // full refund processed
]);

/** Note publish status. */
const PUBLISH_STATUSES = Object.freeze(["draft", "published", "archived"]);

/** Subscription plan identifiers. */
const SUBSCRIPTION_PLANS = Object.freeze(["monthly", "yearly"]);

/** Subscription lifecycle statuses. */
const SUBSCRIPTION_STATUSES = Object.freeze([
  "active",
  "expired",
  "cancelled",
  "paused",
]);

/** Currency codes (only INR for now). */
const CURRENCIES = Object.freeze(["INR"]);

module.exports = {
  ACADEMIC_YEARS,
  AUTH_PROVIDERS,
  USER_ROLES,
  ACCOUNT_STATUSES,
  ORDER_TYPES,
  PAYMENT_GATEWAYS,
  ORDER_STATUSES,
  PUBLISH_STATUSES,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
  CURRENCIES,
};
