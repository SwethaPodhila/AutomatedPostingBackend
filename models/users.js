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

  // New fields for subscription
  plan: { type: String, enum: ["FREE", "PRO", "ENTERPRISE"], default: "FREE" },
  subscriptionStatus: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "INACTIVE" },
  paymentId: { type: String }, // Cashfree transaction reference
  planExpires: { type: Date },
},
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
