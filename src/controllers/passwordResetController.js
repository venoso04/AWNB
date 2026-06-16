const crypto = require("crypto");
const User = require("../models/User");
const PasswordReset = require("../models/PasswordReset");
const { sendPasswordResetEmail } = require("../services/emailService");
const { success, error } = require("../utils/response");

// ─── Config constants ─────────────────────────────────────
const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_RESENDS_PER_HOUR = 3;
const RESEND_COOLDOWN_SECONDS = 60;

const generateOtpCode = () => String(crypto.randomInt(100000, 999999));

// ══════════════════════════════════════════════════════════
// @route   POST /api/auth/forgot-password
// @access  Public
// Body:    { email }
// Always returns 200 (even if email doesn't exist) to prevent
// account enumeration via this endpoint.
// ══════════════════════════════════════════════════════════
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    // Don't reveal whether the email exists — same response either way
    const genericMessage = `If an account exists for ${email}, a password reset code has been sent.`;

    if (!user) {
      return success(res, { expiresInMinutes: OTP_EXPIRY_MINUTES }, genericMessage);
    }

    // Remove any existing reset request for this user
    await PasswordReset.deleteMany({ user: user._id });

    const rawCode = generateOtpCode();
    const codeHash = await PasswordReset.hashCode(rawCode);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await PasswordReset.create({
      user: user._id,
      email: user.email,
      codeHash,
      expiresAt,
    });

    await sendPasswordResetEmail(user.email, user.name, rawCode);

    return success(res, { expiresInMinutes: OTP_EXPIRY_MINUTES }, genericMessage);
  } catch (err) {
    console.error("forgotPassword error:", err);
    return error(res, "Failed to process password reset request", 500);
  }
};

// ══════════════════════════════════════════════════════════
// @route   POST /api/auth/verify-reset-otp
// @access  Public
// Body:    { email, code }
// Lets the client confirm the code is correct BEFORE showing
// the "set new password" screen, without consuming the code.
// ══════════════════════════════════════════════════════════
const verifyResetOtp = async (req, res) => {
  try {
    const { email, code } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return error(res, "Invalid or expired code", 400);
    }

    const resetRecord = await PasswordReset.findOne({ user: user._id }).select("+codeHash");

    if (!resetRecord) {
      return error(res, "No reset request found. Please request a new code.", 404);
    }

    if (resetRecord.expiresAt < new Date()) {
      await resetRecord.deleteOne();
      return error(res, "Reset code has expired. Please request a new one.", 410);
    }

    if (resetRecord.attempts >= MAX_ATTEMPTS) {
      await resetRecord.deleteOne();
      return error(
        res,
        "Too many incorrect attempts. Please request a new code.",
        429
      );
    }

    const isMatch = await resetRecord.verifyCode(String(code).trim());

    if (!isMatch) {
      resetRecord.attempts += 1;
      await resetRecord.save();

      const attemptsLeft = MAX_ATTEMPTS - resetRecord.attempts;
      return error(
        res,
        `Incorrect code. ${attemptsLeft} attempt${attemptsLeft !== 1 ? "s" : ""} remaining.`,
        400
      );
    }

    // Mark as verified so resetPassword can be called without
    // resubmitting the code (still required again as a safety check)
    resetRecord.verified = true;
    await resetRecord.save();

    return success(res, {}, "Code verified. You can now set a new password.");
  } catch (err) {
    console.error("verifyResetOtp error:", err);
    return error(res, "Code verification failed", 500);
  }
};

// ══════════════════════════════════════════════════════════
// @route   POST /api/auth/reset-password
// @access  Public
// Body:    { email, code, newPassword }
// ══════════════════════════════════════════════════════════
const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return error(res, "Invalid or expired code", 400);
    }

    const resetRecord = await PasswordReset.findOne({ user: user._id }).select("+codeHash");

    if (!resetRecord) {
      return error(res, "No reset request found. Please request a new code.", 404);
    }

    if (resetRecord.expiresAt < new Date()) {
      await resetRecord.deleteOne();
      return error(res, "Reset code has expired. Please request a new one.", 410);
    }

    if (resetRecord.attempts >= MAX_ATTEMPTS) {
      await resetRecord.deleteOne();
      return error(res, "Too many incorrect attempts. Please request a new code.", 429);
    }

    const isMatch = await resetRecord.verifyCode(String(code).trim());

    if (!isMatch) {
      resetRecord.attempts += 1;
      await resetRecord.save();

      const attemptsLeft = MAX_ATTEMPTS - resetRecord.attempts;
      return error(
        res,
        `Incorrect code. ${attemptsLeft} attempt${attemptsLeft !== 1 ? "s" : ""} remaining.`,
        400
      );
    }

    // ── Success: update password, revoke all sessions, delete reset record ──
    user.password = newPassword;
    user.refreshTokens = [];
    await user.save();

    await resetRecord.deleteOne();

    return success(res, {}, "Password has been reset successfully. Please log in.");
  } catch (err) {
    console.error("resetPassword error:", err);
    return error(res, "Password reset failed", 500);
  }
};

// ══════════════════════════════════════════════════════════
// @route   POST /api/auth/resend-reset-otp
// @access  Public
// Body:    { email }
// ══════════════════════════════════════════════════════════
const resendResetOtp = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    const genericMessage = `If an account exists for ${email}, a new code has been sent.`;

    if (!user) {
      return success(res, { expiresInMinutes: OTP_EXPIRY_MINUTES }, genericMessage);
    }

    const existingReset = await PasswordReset.findOne({ user: user._id });

    if (existingReset) {
      if (existingReset.lastResendAt) {
        const secondsSinceLastResend =
          (Date.now() - existingReset.lastResendAt.getTime()) / 1000;

        if (secondsSinceLastResend < RESEND_COOLDOWN_SECONDS) {
          const waitSeconds = Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceLastResend);
          return error(
            res,
            `Please wait ${waitSeconds} second${waitSeconds !== 1 ? "s" : ""} before requesting another code.`,
            429
          );
        }
      }

      if (existingReset.resendCount >= MAX_RESENDS_PER_HOUR) {
        return error(
          res,
          "Maximum resend limit reached. Please wait before requesting a new code.",
          429
        );
      }
    }

    await PasswordReset.deleteMany({ user: user._id });

    const rawCode = generateOtpCode();
    const codeHash = await PasswordReset.hashCode(rawCode);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    const resendCount = existingReset ? existingReset.resendCount + 1 : 1;

    await PasswordReset.create({
      user: user._id,
      email: user.email,
      codeHash,
      expiresAt,
      resendCount,
      lastResendAt: new Date(),
    });

    await sendPasswordResetEmail(user.email, user.name, rawCode);

    return success(
      res,
      { expiresInMinutes: OTP_EXPIRY_MINUTES, resendsRemaining: MAX_RESENDS_PER_HOUR - resendCount },
      genericMessage
    );
  } catch (err) {
    console.error("resendResetOtp error:", err);
    return error(res, "Failed to resend code", 500);
  }
};

module.exports = {
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  resendResetOtp,
};
