/**
 * AWS S3 Service.
 *
 * Provides secure S3 operations for the BAMS platform:
 *   • getSignedPageUrl(s3Key, expiresIn) — generate pre-signed GET URL
 *
 * Uses AWS SDK v3 (@aws-sdk/client-s3 + @aws-sdk/s3-request-presigner).
 * The S3 key is NEVER returned to the client.
 */

const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { getS3Client } = require("../config/s3");
const { env } = require("../config/env");
const logger = require("../config/logger");

/**
 * Generate a pre-signed GET URL for a page's S3 object.
 *
 * The signed URL expires after `expiresIn` seconds (default 60).
 * This URL is what the client uses to fetch the actual page image.
 *
 * ⚠️  The s3Key itself must NEVER be sent to the client.
 *
 * @param {string} s3Key    — The private S3 object key (e.g. "notes/<id>/pages/007.webp")
 * @param {number} [expiresIn=60] — URL expiry in seconds
 * @returns {Promise<string>} Pre-signed URL
 */
async function getSignedPageUrl(s3Key, expiresIn = 60) {
  const client = getS3Client();

  const command = new GetObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: s3Key,
  });

  const url = await getSignedUrl(client, command, { expiresIn });

  logger.debug("S3 signed URL generated", {
    bucket: env.AWS_S3_BUCKET,
    expiresIn,
    // s3Key is intentionally NOT logged — it's sensitive
  });

  return url;
}

module.exports = { getSignedPageUrl };
