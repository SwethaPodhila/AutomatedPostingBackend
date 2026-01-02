import axios from "axios";
import User from "../models/users.js";

// 1️⃣ Create Order
export const createOrder = async (req, res) => {
    try {
        const { plan, userId, customerName, customerEmail, customerPhone } = req.body;

        const amount = plan === "PRO" ? 999 : plan === "ENTERPRISE" ? 1999 : 0;
        if (!amount) return res.status(400).json({ error: "Invalid plan" });

        const orderId = `ORDER_${Date.now()}`;

        const body = {
            order_id: orderId,
            order_amount: amount.toString(), // Cashfree expects string
            order_currency: "INR",
            customer_details: {
                customer_id: userId,
                customer_name: customerName,
                customer_email: customerEmail,
                customer_phone: customerPhone,
            },
            order_note: plan,
        };

        const headers = {
            "Content-Type": "application/json",
            "x-client-id": process.env.CF_APP_ID,
            "x-client-secret": process.env.CF_SECRET_KEY,
            "x-api-version": "2022-09-01",
        };

        const response = await axios.post(
            "https://sandbox.cashfree.com/pg/orders",
            body,
            { headers }
        );

        console.log("Cashfree order response:", response.data);

        res.json({
            orderId: orderId,
            paymentSessionId: response.data.payment_session_id,
        });
    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json({ error: "Failed to create order" });
    }
};

// 2️⃣ Payment Callback / Verification
export const paymentCallback = async (req, res) => {
    try {
        const { orderId } = req.body;
        if (!orderId) return res.status(400).json({ error: "Order ID missing" });

        // Verify payment status with Cashfree
        const headers = {
            "x-client-id": process.env.CF_APP_ID,
            "x-client-secret": process.env.CF_SECRET_KEY,
            "x-api-version": "2022-09-01",
        };

        const response = await axios.get(
            `https://sandbox.cashfree.com/pg/orders/${orderId}`,
            { headers }
        );

        console.log("🔍 Verify Order:", response.data);

        if (response.data.order_status === "PAID") {
            const plan = response.data.order_note;
            const userId = response.data.customer_details.customer_id;

            const planExpires = new Date();
            planExpires.setMonth(planExpires.getMonth() + 1);

            await User.findByIdAndUpdate(userId, {
                plan,
                subscriptionStatus: "ACTIVE",
                paymentId: response.data.cf_order_id,
                planExpires,
            });

            console.log("✅ DB UPDATED for user:", userId);
            return res.json({ success: true });
        } else {
            return res.json({ success: false, message: "Payment not completed yet" });
        }
    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json({ error: "Payment verification failed" });
    }
};