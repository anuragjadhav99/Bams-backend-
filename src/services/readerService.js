/**
 * Reader Service.
 *
 * Business logic for the eBook reader — the most security-critical
 * part of the platform.
 *
 * Security rules:
 *   ❌ S3 key is NEVER returned to the client
 *   ❌ S3 key is NEVER logged
 *   ✅ All access goes through hasAccess()
 *   ✅ Signed URLs expire in 60 seconds
 *   ✅ Anti-piracy session tracking on every page access
 */

const { Note, Page, Session } = require("../models");
const hasAccess = require("../helpers/hasAccess");
const { getSignedPageUrl } = require("./s3Service");
const logger = require("../config/logger");

/**
 * Get a single page for the reader.
 *
 * 1. Fetch the Page document (with +s3Key)
 * 2. Check sample vs purchased access
 * 3. Generate pre-signed S3 URL (60s expiry)
 * 4. Create/update anti-piracy Session
 * 5. Return page URL (never the s3Key)
 *
 * @param {string} userId
 * @param {string} noteId
 * @param {number} pageNumber
 * @param {{ ip: string, userAgent: string, deviceFingerprint?: string }} clientInfo
 * @returns {Promise<{ pageUrl, pageNumber, totalPages, isSample }>}
 */
async function getPage(userId, noteId, pageNumber, clientInfo) {
  // Fetch note for totalPages
  const note = await Note.findById(noteId).select("totalPages samplePages title").lean();
  if (!note) {
    throw Object.assign(new Error("Note not found"), { statusCode: 404 });
  }

  // Validate page number
  if (pageNumber < 1 || pageNumber > note.totalPages) {
    throw Object.assign(
      new Error(`Page number must be between 1 and ${note.totalPages}`),
      { statusCode: 400 }
    );
  }

  // Fetch the page WITH the hidden s3Key
  const page = await Page.findOne({ note: noteId, pageNumber }).select("+s3Key").lean();
  if (!page) {
    throw Object.assign(new Error("Page not found"), { statusCode: 404 });
  }

  // Access check: sample pages are free for any authenticated user
  const isSample = page.isSample || pageNumber <= note.samplePages;

  if (!isSample) {
    const granted = await hasAccess(userId, noteId);
    if (!granted) {
      logger.reader("access_denied", {
        userId,
        noteId,
        pageNumber,
        ip: clientInfo.ip,
      });
      throw Object.assign(
        new Error("Purchase required to access this page"),
        { statusCode: 403 }
      );
    }
  }

  // Generate pre-signed S3 URL (60 second expiry)
  const pageUrl = await getSignedPageUrl(page.s3Key, 60);

  // Anti-piracy: create or update reading session
  await Session.findOneAndUpdate(
    { user: userId, note: noteId, isActive: true },
    {
      $set: {
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        deviceFingerprint: clientInfo.deviceFingerprint || null,
        lastActiveAt: new Date(),
      },
      $setOnInsert: {
        user: userId,
        note: noteId,
        isActive: true,
      },
    },
    { upsert: true, new: true }
  );

  logger.reader("page_accessed", {
    userId,
    noteId,
    pageNumber,
    isSample,
    ip: clientInfo.ip,
  });

  // Return page data — NEVER include s3Key
  return {
    pageUrl,
    pageNumber,
    totalPages: note.totalPages,
    isSample,
  };
}

/**
 * Update heartbeat for an active reading session.
 *
 * @param {string} userId
 * @param {string} noteId
 * @returns {Promise<void>}
 */
async function heartbeat(userId, noteId) {
  await Session.findOneAndUpdate(
    { user: userId, note: noteId, isActive: true },
    { $set: { lastActiveAt: new Date() } }
  );

  logger.reader("heartbeat", { userId, noteId });
}

/**
 * Get reader info for a note (metadata for the reader UI).
 *
 * @param {string} userId
 * @param {string} noteId
 * @returns {Promise<Object>}
 */
async function getReaderInfo(userId, noteId) {
  const note = await Note.findById(noteId)
    .select("title totalPages samplePages subject coverImage")
    .populate({ path: "subject", select: "name year slug" })
    .lean();

  if (!note) {
    throw Object.assign(new Error("Note not found"), { statusCode: 404 });
  }

  const isPurchased = await hasAccess(userId, noteId);

  return {
    title: note.title,
    totalPages: note.totalPages,
    samplePages: note.samplePages,
    coverImage: note.coverImage,
    subject: note.subject,
    isPurchased,
  };
}

module.exports = { getPage, heartbeat, getReaderInfo };
