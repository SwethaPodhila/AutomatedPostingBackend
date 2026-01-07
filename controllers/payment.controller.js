import axios from "axios";
import User from "../models/users.js";
import crypto from "crypto";

// 1️⃣ Create Order
export const createOrder = async (req, res) => {
    try {
        const { plan, userId, customerName, customerEmail, customerPhone } = req.body;

        const amount = plan === "PRO" ? 1 : plan === "ENTERPRISE" ? 2 : 0;
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
            "https://api.cashfree.com/pg/orders",
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

export const paymentCallback = async (req, res) => {
    try {
        const { orderId } = req.body;

        const headers = {
            "x-client-id": process.env.CF_APP_ID,
            "x-client-secret": process.env.CF_SECRET_KEY,
            "x-api-version": "2022-09-01",
        };

        const response = await axios.get(
            `https://api.cashfree.com/pg/orders/${orderId}`,
            { headers }
        );

        return res.json({
            orderStatus: response.data.order_status,
        });
    } catch (err) {
        return res.status(500).json({ error: "Verification failed" });
    }
};

export const cashfreeWebhook = async (req, res) => {
    try {
        const signature = req.headers["x-webhook-signature"];
        const rawBody = req.body;

        const expectedSignature = crypto
            .createHmac("sha256", process.env.CF_WEBHOOK_SECRET)
            .update(rawBody)
            .digest("base64");

        if (signature !== expectedSignature) {
            console.log("❌ Invalid webhook signature");
            return res.status(400).send("Invalid signature");
        }

        const event = JSON.parse(rawBody.toString());

        if (event.type === "PAYMENT_SUCCESS") {
            const order = event.data.order;

            const plan = order.order_note;
            const userId = order.customer_details.customer_id;

            const planExpires = new Date();
            planExpires.setMonth(planExpires.getMonth() + 1);

            await User.findByIdAndUpdate(userId, {
                plan,
                subscriptionStatus: "ACTIVE",
                paymentId: order.cf_order_id,
                planExpires,
            });

            console.log("✅ SECURE webhook DB updated:", userId);
        }

        res.status(200).send("OK");
    } catch (err) {
        console.error("Webhook error:", err.message);
        res.status(500).send("Webhook failed");
    }
};