import express from "express";
import { register, verifyOtp, getUserSubscription, login,verifyOtpForForgotPassword,forgotPassword,resetPassword,getUserProfile,deleteUserById,createSupport } from "../controllers/users.controller.js";

const router = express.Router();

router.post("/register", register);
router.post("/verify-otp", verifyOtp);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp-for-forgot-password", verifyOtpForForgotPassword);
router.post("/reset-password", resetPassword);
router.get("/profile/:userId", getUserProfile);
router.delete("/delete/:userId", deleteUserById);
router.post("/support", createSupport);
router.get("/subscription/:userId", getUserSubscription);

export default router;
