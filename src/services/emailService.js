/**
 * Email Service.
 *
 * Sends transactional emails via Nodemailer + SMTP.
 * Falls back to console logging when SMTP is not configured (development).
 *
 * Security: OTP values are NEVER logged. Only email address and status.
 */

const { getTransport } = require("../config/email");
const logger = require("../config/logger");

/**
 * Send an OTP verification email.
 *
 * In development without SMTP: logs OTP to console (ONLY in dev).
 * In production without SMTP: throws an error.
 *
 * @param {string} email — Recipient email address
 * @param {string} otp   — 6-digit OTP code (NOT logged)
 * @returns {Promise<void>}
 */
async function sendOTPEmail(email, otp) {
  const transport = getTransport();

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f7fa; padding: 20px;">
      <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">BAMS Notes</h1>
          <p style="color: #666; margin: 5px 0 0;">Your Study Partner</p>
        </div>
        
        <h2 style="color: #333; font-size: 20px; margin-bottom: 10px;">Verify Your Email</h2>
        <p style="color: #555; line-height: 1.6;">
          Use the following code to sign in to your BAMS Notes account.
          This code expires in <strong>10 minutes</strong>.
        </p>
        
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; letter-spacing: 8px; color: #ffffff; font-weight: 700;">${otp}</span>
        </div>
        
        <p style="color: #888; font-size: 13px; line-height: 1.5;">
          If you didn't request this code, you can safely ignore this email.
          Never share this code with anyone.
        </p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
        <p style="color: #aaa; font-size: 12px; text-align: center;">
          &copy; ${new Date().getFullYear()} BAMS Notes. All rights reserved.
        </p>
      </div>
    </body>
    </html>
  `;

  if (!transport) {
    throw new Error("Email service is not configured — cannot send OTP. Please configure SMTP.");
  }

  await transport.sendMail({
    from: `"BAMS Notes" <${env.SMTP_FROM}>`,
    to: email,
    subject: "Your BAMS Notes Verification Code",
    html: htmlBody,
    text: `Your BAMS Notes verification code is: ${otp}\n\nThis code expires in 10 minutes.\nIf you didn't request this, ignore this email.`,
  });

  // Log the event WITHOUT the OTP value
  logger.auth("otp_sent", { email, method: "smtp" });
}

module.exports = { sendOTPEmail };
