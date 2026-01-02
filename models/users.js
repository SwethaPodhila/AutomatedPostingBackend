// models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  otp: { type: String },
  otpExpires: { type: Date },
  resetPasswordOtp: { type: String },   // forgot-password OTP
  resetPasswordOtpExpires: { type: Date }, // forgot-password OTP expiry
  isVerified: { type: Boolean, default: false },
});

export default mongoose.model("User", userSchema);
