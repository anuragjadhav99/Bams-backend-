const mongoose = require("mongoose");
const { Schema } = mongoose;
const {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
} = require("../config/constants");

/**
 * Subscription — active subscription state per user.
 *
 * A Subscription is created when a `subscription` type Order is paid.
 * It tracks the plan, billing cycle dates, and renewal status.
 *
 * Only ONE active subscription per user should exist at a time.
 * The `hasAccess` helper checks `status === "active"` and
 * `currentPeriodEnd > now`.
 *
 * Indexes
 * -------
 *  user + status              — "does this user have an active sub?"
 *  currentPeriodEnd           — batch job: find expiring subscriptions
 *  user                       (unique when active) — enforced in app logic
 */
const subscriptionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
    },

    /** The Order that created (or last renewed) this subscription. */
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order reference is required"],
    },

    plan: {
      type: String,
      required: true,
      enum: {
        values: SUBSCRIPTION_PLANS,
        message: "Plan must be one of: " + SUBSCRIPTION_PLANS.join(", "),
      },
    },

    status: {
      type: String,
      required: true,
      enum: {
        values: SUBSCRIPTION_STATUSES,
        message: "Status must be one of: " + SUBSCRIPTION_STATUSES.join(", "),
      },
      default: "active",
    },

    /** When the current billing period started. */
    currentPeriodStart: {
      type: Date,
      required: [true, "Period start date is required"],
    },

    /** When the current billing period ends (= renewal / expiry date). */
    currentPeriodEnd: {
      type: Date,
      required: [true, "Period end date is required"],
    },

    /**
     * If true, the platform will attempt to auto-renew via the gateway
     * before `currentPeriodEnd`.  Set to false when the user cancels.
     */
    autoRenew: {
      type: Boolean,
      default: true,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/* ── Indexes ──────────────────────────────────────────────────── */
subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ currentPeriodEnd: 1 });

/* ── Instance helpers ─────────────────────────────────────────── */

/**
 * Returns true if the subscription is currently granting access.
 */
subscriptionSchema.methods.isAccessible = function () {
  return this.status === "active" && this.currentPeriodEnd > new Date();
};

module.exports = mongoose.model("Subscription", subscriptionSchema);
