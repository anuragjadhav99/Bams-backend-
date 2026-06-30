/**
 * Swagger / OpenAPI Configuration.
 *
 * Contains the OpenAPI 3.0 spec metadata, security schemes,
 * component schemas, and tag definitions.
 *
 * Path definitions remain in docs/swagger.js to keep
 * route documentation close to the route definitions.
 *
 * @module config/swagger
 */

const { env } = require("./env");

/**
 * OpenAPI 3.0 specification metadata and component definitions.
 * @type {Object}
 */
const swaggerConfig = {
  openapi: "3.0.0",
  info: {
    title: "BAMS Study Notes API",
    version: "1.0.0",
    description:
      "REST API for the BAMS Study Notes platform — eBook-style notes with purchase entitlements, paginated reader, and anti-piracy monitoring.",
    contact: {
      name: "BAMS Notes Team",
      email: "admin@bamsnotes.in",
    },
  },
  servers: [
    {
      url: `http://localhost:${env.PORT}/api`,
      description: "Development server",
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Enter your JWT access token",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string", example: "Error description" },
          errors: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
      },
      Pagination: {
        type: "object",
        properties: {
          total: { type: "integer", example: 100 },
          page: { type: "integer", example: 1 },
          limit: { type: "integer", example: 12 },
          totalPages: { type: "integer", example: 9 },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string", example: "665a1b2c3d4e5f6789012345" },
          name: { type: "string", example: "Ananya Sharma" },
          email: { type: "string", example: "ananya@bams.in" },
          role: { type: "string", enum: ["student", "admin"] },
          avatar: { type: "string", nullable: true },
          phone: { type: "string", nullable: true },
        },
      },
      Subject: {
        type: "object",
        properties: {
          _id: { type: "string" },
          name: { type: "string", example: "Padartha Vigyan" },
          slug: { type: "string", example: "padartha-vigyan" },
          year: { type: "string", enum: ["first_year", "second_year", "third_year", "final_year"] },
          sortOrder: { type: "integer" },
          description: { type: "string" },
          isActive: { type: "boolean" },
        },
      },
      Note: {
        type: "object",
        properties: {
          _id: { type: "string" },
          title: { type: "string", example: "Padartha Vigyan Complete Notes" },
          slug: { type: "string", example: "padartha-vigyan-complete" },
          description: { type: "string" },
          coverImage: { type: "string", nullable: true },
          totalPages: { type: "integer", example: 120 },
          samplePages: { type: "integer", example: 5 },
          price: { type: "number", example: 149 },
          mrp: { type: "number", nullable: true, example: 299 },
          currency: { type: "string", example: "INR" },
          publishStatus: { type: "string", enum: ["draft", "published", "archived"] },
          tags: { type: "array", items: { type: "string" } },
          author: { type: "string" },
          subject: { $ref: "#/components/schemas/Subject" },
          isPurchased: { type: "boolean" },
        },
      },
      Order: {
        type: "object",
        properties: {
          _id: { type: "string" },
          orderType: { type: "string", enum: ["single_note", "year_package", "full_package", "subscription"] },
          amount: { type: "number", example: 149 },
          currency: { type: "string", example: "INR" },
          status: { type: "string", enum: ["created", "pending", "paid", "failed", "refunded"] },
          paidAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      Subscription: {
        type: "object",
        properties: {
          _id: { type: "string" },
          plan: { type: "string", enum: ["monthly", "yearly"] },
          status: { type: "string", enum: ["active", "expired", "cancelled", "paused"] },
          currentPeriodStart: { type: "string", format: "date-time" },
          currentPeriodEnd: { type: "string", format: "date-time" },
          autoRenew: { type: "boolean" },
        },
      },
    },
  },
  tags: [
    { name: "Health", description: "Service health check" },
    { name: "Auth", description: "Authentication — Google OAuth & Email OTP" },
    { name: "Subjects", description: "Academic subjects catalog" },
    { name: "Notes", description: "Study notes catalog" },
    { name: "Reader", description: "eBook reader — page access & sessions" },
    { name: "Payment", description: "Razorpay payment integration" },
    { name: "User", description: "User profile & dashboard" },
    { name: "Admin", description: "Admin panel — platform management" },
  ],
};

module.exports = { swaggerConfig };
