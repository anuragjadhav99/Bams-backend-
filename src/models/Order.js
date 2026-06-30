const mongoose = require("mongoose");
const { Schema } = mongoose;
const {
  ORDER_TYPES,
  PAYMENT_GATEWAYS,
  ORDER_STATUSES,
  CURRENCIES,
  ACADEMIC_YEARS,
} = require("../config/constants");

/**
 * Order — records every purchase attempt and its payment outcome.
 *
 * An Order can represent four purchase types:
 *   1. single_note   → `note` is set  (the specific Note bought).
 *   2. year_package   → `year` is set  (covers all subjects in that year).
 *   3. full_package   → neither `note` nor `year`; covers everything.
 *   4. subscription   → neither `note` nor `year`; a Subscription doc is
 *                        created once payment is confirmed.
 *
 * Indexes
 * -------
 *  user + status                — "my paid orders" look-up  (entitlement checks)
 *  user + orderType + status    — "does this user own a year_package for X?"
 *  gatewayOrderId               (unique, sparse) — webhook dedup & idempotency
 *  createdAt                    — admin dashboard date-range queries
 */
const orderSchema = new Schema(
  {
    /* ── who ──────────────────────────────────────────────────── */
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
    },

    /* ── what ─────────────────────────────────────────────────── */
    orderType: {
      type: String,
      required: true,
      enum: {
        values: ORDER_TYPES,
        message: "Order type must be one of: " + ORDER_TYPES.join(", "),
      },
    },

    /**
     * Set only when `orderType === "single_note"`.
     * References the specific Note being purchased.
     */
    note: {
      type: Schema.Types.ObjectId,
      ref: "Note",
      default: null,
    },

    /**
     * Set only when `orderType === "year_package"`.
     * Stores the academic year string (enum value, not an ObjectId)
     * because a year package isn't tied to a single document.
     */
    year: {
      type: String,
      enum: {
        values: ACADEMIC_YEARS,
        message: "Year must be one of: " + ACADEMIC_YEARS.join(", "),
      },
      default: null,
    },

    /* ── payment ──────────────────────────────────────────────── */
    paymentGateway: {
      type: String,
      required: true,
      enum: {
        values: PAYMENT_GATEWAYS,
        message: "Gateway must be one of: " + PAYMENT_GATEWAYS.join(", "),
      },
    },

    /** Order ID returned by the gateway when the order is created. */
    gatewayOrderId: {
      type: String,
      default: null,
    },

    /** Payment ID returned by the gateway after successful capture. */
    gatewayPaymentId: {
      type: String,
      default: null,
    },

    /** Raw gateway signature for verification (never sent to client). */
    gatewaySignature: {
      type: String,
      default: null,
      select: false,
    },

    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount cannot be negative"],
    },

    currency: {
      type: String,
      enum: CURRENCIES,
      default: "INR",
    },

    status: {
      type: String,
      required: true,
      enum: {
        values: ORDER_STATUSES,
        message: "Status must be one of: " + ORDER_STATUSES.join(", "),
      },
      default: "created",
    },

    /** Admin notes or failure reason. */
    remarks: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    paidAt: {
      type: Date,
      default: null,
    },

    refundedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt = order creation, updatedAt = last status change
  }
);

/* ── Indexes ──────────────────────────────────────────────────── */
orderSchema.index({ user: 1, status: 1 });
orderSchema.index({ user: 1, orderType: 1, status: 1 });
orderSchema.index({ gatewayOrderId: 1 }, { unique: true, sparse: true });
orderSchema.index({ createdAt: -1 });

/* ── Validation ───────────────────────────────────────────────── */
orderSchema.pre("validate", function (next) {
  if (this.orderType === "single_note" && !this.note) {
    return next(new Error("A single_note order must reference a Note."));
  }
  if (this.orderType === "year_package" && !this.year) {
    return next(new Error("A year_package order must specify a year."));
  }
  next();
});

module.exports = mongoose.model("Order", orderSchema);
