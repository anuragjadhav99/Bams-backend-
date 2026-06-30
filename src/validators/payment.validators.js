/**
 * Payment validation rules.
 *
 * Express-validator chains for payment-related request bodies.
 *
 * @module validators/payment
 */

const { body } = require("express-validator");
const { ORDER_TYPES } = require("../config/constants");

/** Validate order creation. */
const validateOrder = [
  body("orderType")
    .trim()
    .notEmpty()
    .withMessage("Order type is required")
    .isIn(ORDER_TYPES)
    .withMessage(`Order type must be one of: ${ORDER_TYPES.join(", ")}`),
  body("noteId")
    .optional()
    .isMongoId()
    .withMessage("Note ID must be a valid MongoDB ObjectId"),
  body("year")
    .optional()
    .isIn(["first_year", "second_year", "third_year", "final_year"])
    .withMessage("Year must be a valid academic year"),
  body("plan")
    .optional()
    .isIn(["monthly", "yearly"])
    .withMessage("Plan must be monthly or yearly"),
];

/** Validate payment verification. */
const validatePaymentVerify = [
  body("razorpayOrderId")
    .trim()
    .notEmpty()
    .withMessage("Razorpay order ID is required"),
  body("razorpayPaymentId")
    .trim()
    .notEmpty()
    .withMessage("Razorpay payment ID is required"),
  body("razorpaySignature")
    .trim()
    .notEmpty()
    .withMessage("Razorpay signature is required"),
];

module.exports = {
  validateOrder,
  validatePaymentVerify,
};
