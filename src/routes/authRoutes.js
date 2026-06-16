const express = require("express");
const router = express.Router();

const {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getMe,
  updateMe,
  changePassword,
} = require("../controllers/authController");

const {
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  resendResetOtp,
} = require("../controllers/passwordResetController");

const { protect } = require("../middleware/auth");
const {
  validate,
  registerRules,
  loginRules,
  changePasswordRules,
  forgotPasswordRules,
  verifyResetOtpRules,
  resetPasswordRules,
} = require("../middleware/validators");

// ─── Public: registration & login (no verification step) ─
router.post("/register", registerRules, validate, register);
router.post("/login", loginRules, validate, login);
router.post("/refresh", refresh);

// ─── Public: forgot password flow ─────────────────────────
router.post("/forgot-password", forgotPasswordRules, validate, forgotPassword);
router.post("/verify-reset-otp", verifyResetOtpRules, validate, verifyResetOtp);
router.post("/reset-password", resetPasswordRules, validate, resetPassword);
router.post("/resend-reset-otp", forgotPasswordRules, validate, resendResetOtp);

// ─── Protected ───────────────────────────────────────────
router.use(protect);

router.get("/me", getMe);
router.patch("/me", updateMe);
router.patch("/change-password", changePasswordRules, validate, changePassword);
router.post("/logout", logout);
router.post("/logout-all", logoutAll);

module.exports = router;
