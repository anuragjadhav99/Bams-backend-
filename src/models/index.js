/**
 * Barrel export — import all models from one place:
 *
 *   const { User, Note, Order } = require("./models");
 */
const User = require("./User");
const Subject = require("./Subject");
const Note = require("./Note");
const Page = require("./Page");
const Order = require("./Order");
const Subscription = require("./Subscription");
const Session = require("./Session");
const OTP = require("./OTP");
const RefreshToken = require("./RefreshToken");

module.exports = {
  User,
  Subject,
  Note,
  Page,
  Order,
  Subscription,
  Session,
  OTP,
  RefreshToken,
};
