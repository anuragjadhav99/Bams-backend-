/**
 * AWS S3 Client Configuration.
 *
 * Provides a lazy-initialised singleton S3Client instance.
 * Credentials are read from environment variables via config/env.
 *
 * @module config/s3
 */

const { S3Client } = require("@aws-sdk/client-s3");
const { env } = require("./env");

/** @type {S3Client|null} */
let s3Client = null;

/**
 * Get or create the S3 client singleton.
 *
 * @returns {S3Client}
 */
function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

module.exports = { getS3Client, s3: getS3Client() };
