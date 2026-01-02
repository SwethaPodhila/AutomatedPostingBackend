import express from "express";
import { register, verifyOtp, login,verifyOtpForForgotPassword,forgotPassword,resetPassword } from "../controllers/users.controller.js";

const router = express.Router();

router.post("/register", register);
router.post("/verify-otp", verifyOtp);
router.post("/login", login);

router.post("/forgot-password", forgotPassword);
router.post("/verify-otp-for-forgot-password", verifyOtpForForgotPassword);
router.post("/reset-password", resetPassword);

export default router;
