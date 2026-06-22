const { body, validationResult } = require("express-validator");
const { error } = require("../utils/response");

// ─── Run validation and return errors if any ─────────────
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(res, "Validation failed", 422, errors.array());
  }
  next();
};

// ─── Register rules ───────────────────────────────────────
const registerRules = [
  body("name")
    .trim()
    .notEmpty().withMessage("Name is required")
    .isLength({ min: 2, max: 50 }).withMessage("Name must be 2–50 characters"),

  body("email")
    .trim()
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Invalid email address")
    .normalizeEmail(),

  body("password")
    .notEmpty().withMessage("Password is required")
    .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
    .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter")
    .matches(/[0-9]/).withMessage("Password must contain at least one number"),
];

// ─── Login rules ──────────────────────────────────────────
const loginRules = [
  body("email")
    .trim()
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Invalid email address")
    .normalizeEmail(),

  body("password")
    .notEmpty().withMessage("Password is required"),
];

// ─── Change password rules (logged-in user) ───────────────
const changePasswordRules = [
  body("currentPassword")
    .notEmpty().withMessage("Current password is required"),

  body("newPassword")
    .notEmpty().withMessage("New password is required")
    .isLength({ min: 8 }).withMessage("New password must be at least 8 characters")
    .matches(/[A-Z]/).withMessage("New password must contain at least one uppercase letter")
    .matches(/[0-9]/).withMessage("New password must contain at least one number"),
];

// ─── Google auth rules ──────────────────────────────────────
const googleAuthRules = [
  body("idToken")
    .trim()
    .notEmpty().withMessage("Google idToken is required"),
];

// ─── Forgot password rules ─────────────────────────────────
const forgotPasswordRules = [
  body("email")
    .trim()
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Invalid email address")
    .normalizeEmail(),
];

// ─── Verify reset OTP rules ────────────────────────────────
const verifyResetOtpRules = [
  body("email")
    .trim()
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Invalid email address")
    .normalizeEmail(),

  body("code")
    .trim()
    .notEmpty().withMessage("Verification code is required")
    .isLength({ min: 6, max: 6 }).withMessage("Code must be 6 digits"),
];

// ─── Reset password rules ──────────────────────────────────
const resetPasswordRules = [
  body("email")
    .trim()
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Invalid email address")
    .normalizeEmail(),

  body("code")
    .trim()
    .notEmpty().withMessage("Verification code is required")
    .isLength({ min: 6, max: 6 }).withMessage("Code must be 6 digits"),

  body("newPassword")
    .notEmpty().withMessage("New password is required")
    .isLength({ min: 8 }).withMessage("New password must be at least 8 characters")
    .matches(/[A-Z]/).withMessage("New password must contain at least one uppercase letter")
    .matches(/[0-9]/).withMessage("New password must contain at least one number"),
];

module.exports = {
  validate,
  registerRules,
  loginRules,
  googleAuthRules,
  changePasswordRules,
  forgotPasswordRules,
  verifyResetOtpRules,
  resetPasswordRules,
};
