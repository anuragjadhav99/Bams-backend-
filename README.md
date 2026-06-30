# BAMS Backend API

Node.js + Express 5 REST API server for the BAMS Study Notes Platform.

## Features

- Google OAuth + JWT authentication with access/refresh tokens
- Razorpay payment integration with webhook verification
- eBook-style paginated reader with session tracking
- AWS S3 presigned URL generation for private content delivery
- Anti-piracy session monitoring
- Admin dashboard endpoints
- Rate limiting, input validation, and security middleware

## Prerequisites

- Node.js ≥ 18.0.0
- MongoDB Atlas cluster (or local MongoDB instance)
- AWS S3 bucket configured
- Razorpay account (for payments)

## Setup

```bash
cd Backend
cp .env.example .env        # fill in your credentials
npm install
```

## Environment Variables

See [.env.example](./.env.example) for the full list. Required variables:

| Variable                | Description                        |
| ----------------------- | ---------------------------------- |
| `MONGODB_URI`           | MongoDB connection string          |
| `JWT_ACCESS_SECRET`     | Secret for signing access tokens   |
| `JWT_REFRESH_SECRET`    | Secret for signing refresh tokens  |
| `GOOGLE_CLIENT_ID`      | Google OAuth client ID             |
| `GOOGLE_CLIENT_SECRET`  | Google OAuth client secret         |
| `AWS_REGION`            | AWS region for S3                  |
| `AWS_ACCESS_KEY_ID`     | AWS access key                     |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key                     |
| `AWS_S3_BUCKET`         | S3 bucket name                     |
| `RAZORPAY_KEY_ID`       | Razorpay key ID                    |
| `RAZORPAY_KEY_SECRET`   | Razorpay key secret                |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook secret          |

## Running

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start

# Run tests
npm test

# Seed subjects
npm run seed

# Validate Mongoose schemas
npm run validate
```

## API Documentation

When the server is running, Swagger docs are available at:
```
http://localhost:5000/api/docs
```

## Project Structure

```
Backend/
├── src/
│   ├── config/        → DB, env, logger, S3, email, Swagger config
│   ├── controllers/   → Route handler logic
│   ├── docs/          → Swagger documentation definitions
│   ├── helpers/       → Utility helpers (e.g., access checks)
│   ├── middleware/     → Auth, validation, rate limiting, error handling
│   ├── models/        → Mongoose schemas and models
│   ├── routes/        → Express route definitions
│   ├── scripts/       → Schema validation scripts
│   ├── seeds/         → Database seeding scripts
│   ├── services/      → Business logic layer
│   ├── utils/         → Shared utilities
│   ├── validators/    → Request body validation rules
│   ├── app.js         → Express app configuration
│   └── index.js       → Server entry point
├── tests/             → Jest test suites
├── logs/              → Winston log files (production)
├── package.json
└── .env.example
```
