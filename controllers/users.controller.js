import User from "../models/users.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import Support from "../models/Support.js";

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

export const getUserProfile = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId).select(
            "-password -otp -otpExpires -resetPasswordOtp -resetPasswordOtpExpires"
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        res.status(200).json({
            success: true,
            data: user,
        });
    } catch (error) {
        console.error("Get profile error:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

// 🗑️ Delete User by ID
export const deleteUserById = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                msg: "User ID is required",
                success: false
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                msg: "User not found",
                success: false
            });
        }

        await User.findByIdAndDelete(userId);

        return res.json({
            msg: "User deleted successfully",
            success: true
        });

    } catch (err) {
        console.error("🚨 Error deleting user:", err);
        res.status(500).json({
            msg: "Server error",
            success: false
        });
    }
};

// 🆘 CREATE SUPPORT REQUEST
export const createSupport = async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        // 🔍 Validation
        if (!name || !email || !subject || !message) {
            return res.status(400).json({
                success: false,
                msg: "All fields are required"
            });
        }

        // 💾 Save to DB
        await Support.create({
            name,
            email,
            subject,
            message
        });

        // 📩 CREATE TRANSPORTER (IMPORTANT FIX)
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        // 📩 Mail to Admin
        await transporter.sendMail({
            from: `"Website Support" <${process.env.EMAIL_USER}>`,
            to: process.env.ADMIN_EMAIL,
            subject: `New Support Request - ${subject}`,
            html: `
                <h2>New Support Request</h2>
                <p><b>Name:</b> ${name}</p>
                <p><b>Email:</b> ${email}</p>
                <p><b>Issue:</b> ${subject}</p>
                <p><b>Message:</b></p>
                <p>${message}</p>
            `
        });

        // 📩 Auto reply to User
        await transporter.sendMail({
            from: `"Support Team" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "We have received your request",
            html: `
                <p>Hello ${name},</p>
                <p>Thank you for contacting our support team.</p>
                <p>We have received your request regarding <b>${subject}</b>.</p>
                <p>Our team will get back to you shortly.</p>
                <br/>
                <p>Regards,<br/>Support Team</p>
            `
        });

        res.json({
            success: true,
            msg: "Your request has been submitted successfully"
        });

    } catch (err) {
        console.error("Support error:", err);
        res.status(500).json({
            success: false,
            msg: "Server error"
        });
    }
};