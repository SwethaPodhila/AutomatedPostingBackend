import User from "../models/users.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";

// 📩 Send OTP Email
const sendOtpEmail = async (email, otp) => {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    await transporter.sendMail({
        from: `"Verify Your Account" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Your OTP Code",
        text: `Your OTP is ${otp}. It will expire in 5 minutes.`,
    });
};

export const register = async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        // 🔍 Validation
        if (!name || !email || !phone || !password)
            return res.status(400).json({ msg: "All fields are required", success: false });

        if (name.length < 3)
            return res.status(400).json({ msg: "Name must be at least 3 characters", success: false });

        if (!/^\S+@\S+\.\S+$/.test(email))
            return res.status(400).json({ msg: "Invalid email format", success: false });

        if (!/^[0-9]{10}$/.test(phone))
            return res.status(400).json({ msg: "Phone must be a valid 10-digit number", success: false });

        if (password.length < 6)
            return res.status(400).json({ msg: "Password must be at least 6 characters", success: false });

        const userExists = await User.findOne({ email });
        if (userExists)
            return res.status(400).json({ msg: "User already exists", success: false });

        // 🔐 Hash Password
        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        const user = await User.create({
            name,
            email,
            phone,
            password: hashedPassword,
            otp,
            otpExpires: Date.now() + 5 * 60 * 1000, // 5 mins
        });

        await sendOtpEmail(email, otp);
        res.json({ msg: "OTP sent to email. Please verify.", success: true });
    } catch (err) {
        console.error("Error during registration:", err);
        res.status(500).json({ msg: "Server error", success: false });
    }
};

export const verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        console.log("📨 Received OTP verification request:", { email, otp });

        const user = await User.findOne({ email });
        if (!user) {
            return res.json({ msg: "User not found", success: false });
        }

        // ❌ OTP validation
        if (user.otp !== otp) {
            return res.json({ msg: "Invalid OTP", success: false });
        }

        if (Date.now() > user.otpExpires) {
            return res.json({ msg: "OTP expired", success: false });
        }

        // ✅ OTP VERIFIED → START FREE TRIAL
        user.isVerified = true;
        user.plan = "FREE";
        user.subscriptionStatus = "ACTIVE";

        // 🔥 Trial start time = NOW (use createdAt)
        user.createdAt = new Date();

        user.otp = null;
        user.otpExpires = null;
        await user.save();

        console.log("✅ OTP verified & free trial started for:", user.email);

        // 🔑 JWT token (include plan info)
        const token = jwt.sign(
            {
                id: user._id.toString(),
                name: user.name,
                email: user.email,
                plan: user.plan,
                subscriptionStatus: user.subscriptionStatus,
                createdAt: user.createdAt
            },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        return res.json({
            msg: "Account verified successfully",
            success: true,
            token,
            userId: user._id.toString(),
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                plan: user.plan,
                subscriptionStatus: user.subscriptionStatus,
                createdAt: user.createdAt
            }
        });
    } catch (err) {
        console.error("🚨 Error in verifyOtp:", err.message);
        res.status(500).json({ msg: err.message });
    }
};


// 🧾 Login Controller
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user)
            return res.json({ msg: "User not found", success: false });

        if (!user.isVerified)
            return res.json({
                msg: "Please verify your email before login",
                success: false
            });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch)
            return res.json({ msg: "Invalid password", success: false });

        // 🔥 7 DAYS FREE TRIAL CHECK (using createdAt)
        if (user.plan === "FREE") {
            const trialEnd =
                new Date(user.createdAt).getTime() +
                7 * 24 * 60 * 60 * 1000;

            if (Date.now() > trialEnd) {
                user.subscriptionStatus = "INACTIVE";
                await user.save();

                return res.json({
                    success: false,
                    msg: "Your 7 days free trial is completed. Please upgrade."
                });
            }
        }

        // 🔑 JWT token with plan info
        const token = jwt.sign(
            {
                id: user._id.toString(),
                name: user.name,
                email: user.email,
                plan: user.plan,
                subscriptionStatus: user.subscriptionStatus,
                createdAt: user.createdAt
            },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        return res.json({
            msg: "Login successful",
            success: true,
            token,
            userId: user._id.toString(),
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                plan: user.plan,
                phone: user.phone,
                subscriptionStatus: user.subscriptionStatus,
                createdAt: user.createdAt
            }
        });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};


// Helper to generate 6-digit OTP
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ msg: "User not found", success: false });

        const otp = generateOtp();
        user.resetPasswordOtp = otp;
        user.resetPasswordOtpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
        await user.save();

        // Send OTP email
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Your OTP for Password Reset",
            text: `Your OTP is ${otp}. It expires in 10 minutes.`,
        });

        res.json({ msg: "OTP sent to your email", success: true });
    } catch (err) {
        console.error("Forgot Password Error:", err.message);
        res.status(500).json({ msg: "Server error", success: false });
    }
};

// 2️⃣ Verify OTP for Forgot Password
export const verifyOtpForForgotPassword = async (req, res) => {
    try {
        const { email, otp } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ msg: "User not found", success: false });

        if (user.resetPasswordOtp !== otp)
            return res.status(400).json({ msg: "Invalid OTP", success: false });

        if (Date.now() > user.resetPasswordOtpExpires)
            return res.status(400).json({ msg: "OTP expired", success: false });

        // OTP verified
        user.resetPasswordOtp = null;
        user.resetPasswordOtpExpires = null;
        await user.save();

        res.json({ msg: "OTP verified successfully", success: true });
    } catch (err) {
        console.error("Verify OTP Error:", err.message);
        res.status(500).json({ msg: "Server error", success: false });
    }
};

export const resetPassword = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user)
            return res.status(400).json({ msg: "User not found", success: false });

        // hash the password
        const salt = await bcrypt.genSalt(10); // 10 rounds
        const hashedPassword = await bcrypt.hash(password, salt);

        user.password = hashedPassword;
        await user.save();

        res.json({ msg: "Password updated successfully", success: true });
    } catch (err) {
        console.error("Reset Password Error:", err.message);
        res.status(500).json({ msg: "Server error", success: false });
    }
};
