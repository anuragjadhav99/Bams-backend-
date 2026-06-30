/**
 * Reader Controller.
 *
 * Security-critical endpoints for the eBook reader.
 * The S3 key NEVER leaves this layer.
 */

const readerService = require("../services/readerService");
const validateObjectId = require("../middleware/objectIdValidator");

/**
 * GET /api/reader/:noteId/page/:pageNumber
 * Fetch a single page for the reader.
 *
 * Returns a pre-signed S3 URL (60s expiry), never the S3 key.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
async function getPage(req, res, next) {
  try {
    const { noteId } = req.params;
    const pageNumber = parseInt(req.params.pageNumber, 10);

    if (isNaN(pageNumber) || pageNumber < 1) {
      return res.status(400).json({
        success: false,
        message: "Page number must be a positive integer",
      });
    }

    const clientInfo = {
      ip: req.ip,
      userAgent: req.headers["user-agent"] || "unknown",
      deviceFingerprint: req.headers["x-device-fingerprint"] || null,
    };

    const result = await readerService.getPage(
      req.user.id,
      noteId,
      pageNumber,
      clientInfo
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/reader/:noteId/heartbeat
 * Keep the reading session alive for anti-piracy tracking.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
async function heartbeat(req, res, next) {
  try {
    const { noteId } = req.params;

    await readerService.heartbeat(req.user.id, noteId);

    res.status(200).json({
      success: true,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reader/:noteId/info
 * Return note metadata for the reader UI initialization.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
async function getReaderInfo(req, res, next) {
  try {
    const { noteId } = req.params;

    const result = await readerService.getReaderInfo(req.user.id, noteId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getPage, heartbeat, getReaderInfo };
