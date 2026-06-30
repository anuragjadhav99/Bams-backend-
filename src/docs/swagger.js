/**
 * Swagger API Documentation.
 *
 * Assembles the OpenAPI 3.0 spec from config (metadata, schemas)
 * and local path definitions, then mounts swagger-ui-express.
 *
 * Served at /api/docs.
 */

const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const { swaggerConfig } = require("../config/swagger");

const options = {
  definition: {
    ...swaggerConfig,
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          description: "Returns service health status with DB connectivity, uptime, and memory usage.",
          responses: {
            200: { description: "Service is healthy" },
            503: { description: "Service is unhealthy" },
          },
        },
      },
      "/auth/google": {
        post: {
          tags: ["Auth"],
          summary: "Login with Google",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["idToken"],
                  properties: {
                    idToken: { type: "string", description: "Google ID token" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Login successful — returns tokens and user" },
            401: { description: "Invalid Google token" },
          },
        },
      },
      "/auth/otp/send": {
        post: {
          tags: ["Auth"],
          summary: "Send OTP to email",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email"],
                  properties: {
                    email: { type: "string", format: "email" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "OTP sent" },
            422: { description: "Validation error" },
            429: { description: "Rate limited" },
          },
        },
      },
      "/auth/otp/verify": {
        post: {
          tags: ["Auth"],
          summary: "Verify OTP and login",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "otp"],
                  properties: {
                    email: { type: "string", format: "email" },
                    otp: { type: "string", minLength: 6, maxLength: 6 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Login successful — returns tokens and user" },
            400: { description: "Invalid or expired OTP" },
            429: { description: "Rate limited" },
          },
        },
      },
      "/auth/refresh": {
        post: {
          tags: ["Auth"],
          summary: "Refresh access token",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["refreshToken"],
                  properties: {
                    refreshToken: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "New access token" },
            401: { description: "Invalid or expired refresh token" },
          },
        },
      },
      "/auth/logout": {
        post: {
          tags: ["Auth"],
          summary: "Logout",
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: "Logged out" },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/subjects": {
        get: {
          tags: ["Subjects"],
          summary: "Get all subjects grouped by year",
          responses: {
            200: { description: "Subjects grouped by academic year" },
          },
        },
      },
      "/notes": {
        get: {
          tags: ["Notes"],
          summary: "Get paginated notes",
          parameters: [
            { name: "year", in: "query", schema: { type: "string" } },
            { name: "subjectId", in: "query", schema: { type: "string" } },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 12 } },
          ],
          responses: {
            200: { description: "Paginated notes list" },
          },
        },
      },
      "/notes/{slug}": {
        get: {
          tags: ["Notes"],
          summary: "Get note by slug",
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: { description: "Note detail with isPurchased" },
            404: { description: "Note not found" },
          },
        },
      },
      "/reader/{noteId}/page/{pageNumber}": {
        get: {
          tags: ["Reader"],
          summary: "Get a page (signed URL)",
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "noteId", in: "path", required: true, schema: { type: "string" } },
            { name: "pageNumber", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Page URL (60s expiry)" },
            403: { description: "Purchase required" },
            404: { description: "Page not found" },
          },
        },
      },
      "/reader/{noteId}/heartbeat": {
        post: {
          tags: ["Reader"],
          summary: "Keep reading session alive",
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "noteId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: { description: "Heartbeat acknowledged" },
          },
        },
      },
      "/reader/{noteId}/info": {
        get: {
          tags: ["Reader"],
          summary: "Get reader metadata",
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "noteId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: { description: "Reader info with isPurchased" },
          },
        },
      },
      "/payment/create-order": {
        post: {
          tags: ["Payment"],
          summary: "Create Razorpay order",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["orderType"],
                  properties: {
                    orderType: { type: "string", enum: ["single_note", "year_package", "full_package", "subscription"] },
                    noteId: { type: "string" },
                    year: { type: "string" },
                    plan: { type: "string", enum: ["monthly", "yearly"] },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Razorpay order created" },
            400: { description: "Validation error" },
          },
        },
      },
      "/payment/verify": {
        post: {
          tags: ["Payment"],
          summary: "Verify payment",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["razorpayOrderId", "razorpayPaymentId", "razorpaySignature"],
                  properties: {
                    razorpayOrderId: { type: "string" },
                    razorpayPaymentId: { type: "string" },
                    razorpaySignature: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Payment verified" },
            400: { description: "Verification failed" },
          },
        },
      },
      "/payment/webhook": {
        post: {
          tags: ["Payment"],
          summary: "Razorpay webhook",
          description: "Called by Razorpay — no auth required",
          responses: {
            200: { description: "Webhook processed" },
          },
        },
      },
      "/user/profile": {
        get: {
          tags: ["User"],
          summary: "Get profile",
          security: [{ BearerAuth: [] }],
          responses: { 200: { description: "User profile" } },
        },
        patch: {
          tags: ["User"],
          summary: "Update profile (name/phone)",
          security: [{ BearerAuth: [] }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    phone: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Profile updated" } },
        },
      },
      "/user/purchases": {
        get: {
          tags: ["User"],
          summary: "Get purchase history",
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
          responses: { 200: { description: "Paginated purchases" } },
        },
      },
      "/user/subscription": {
        get: {
          tags: ["User"],
          summary: "Get active subscription",
          security: [{ BearerAuth: [] }],
          responses: { 200: { description: "Active subscription or null" } },
        },
      },
      "/user/dashboard": {
        get: {
          tags: ["User"],
          summary: "Get dashboard data",
          security: [{ BearerAuth: [] }],
          responses: { 200: { description: "Aggregated dashboard data" } },
        },
      },
      "/admin/stats": {
        get: {
          tags: ["Admin"],
          summary: "Platform stats",
          security: [{ BearerAuth: [] }],
          responses: { 200: { description: "Platform metrics" } },
        },
      },
      "/admin/users": {
        get: {
          tags: ["Admin"],
          summary: "List users",
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "role", in: "query", schema: { type: "string" } },
            { name: "accountStatus", in: "query", schema: { type: "string" } },
          ],
          responses: { 200: { description: "Paginated user list" } },
        },
      },
      "/admin/users/{id}/status": {
        patch: {
          tags: ["Admin"],
          summary: "Update user status",
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["accountStatus"],
                  properties: {
                    accountStatus: { type: "string", enum: ["active", "suspended", "deleted"] },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Status updated" } },
        },
      },
      "/admin/orders": {
        get: {
          tags: ["Admin"],
          summary: "List orders",
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "orderType", in: "query", schema: { type: "string" } },
            { name: "dateFrom", in: "query", schema: { type: "string", format: "date" } },
            { name: "dateTo", in: "query", schema: { type: "string", format: "date" } },
          ],
          responses: { 200: { description: "Paginated order list" } },
        },
      },
      "/admin/notes": {
        post: {
          tags: ["Admin"],
          summary: "Create note",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title", "subjectId", "price", "totalPages"],
                  properties: {
                    title: { type: "string" },
                    subjectId: { type: "string" },
                    price: { type: "number" },
                    totalPages: { type: "integer" },
                    samplePages: { type: "integer" },
                    mrp: { type: "number" },
                    description: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Note created" } },
        },
      },
      "/admin/notes/{id}": {
        patch: {
          tags: ["Admin"],
          summary: "Update note",
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "Note updated" } },
        },
        delete: {
          tags: ["Admin"],
          summary: "Archive note (soft delete)",
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "Note archived" } },
        },
      },
      "/admin/notes/{noteId}/pages": {
        post: {
          tags: ["Admin"],
          summary: "Register page metadata",
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "noteId", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["pages"],
                  properties: {
                    pages: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["pageNumber", "s3Key"],
                        properties: {
                          pageNumber: { type: "integer" },
                          s3Key: { type: "string" },
                          contentType: { type: "string" },
                          isSample: { type: "boolean" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Pages registered" } },
        },
      },
    },
  },
  apis: [], // Paths defined inline above
};

const swaggerSpec = swaggerJsdoc(options);

/**
 * Mount Swagger UI on the given Express app.
 * @param {import("express").Application} app
 */
function setupSwagger(app) {
  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "BAMS Notes API Docs",
    })
  );

  // Also serve raw spec as JSON
  app.get("/api/docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
}

module.exports = { setupSwagger };
