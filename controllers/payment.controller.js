import axios from "axios";
import User from "../models/users.js";
import crypto from "crypto";

const BASE_URL = process.env.CF_ENV === "sandbox"
  ? "https://sandbox.cashfree.com/pg/orders"
  : "https://api.cashfree.com/pg/orders";

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
      `${BASE_URL}`,
      body,
      { headers }
    );

    console.log("Cashfree order response:", response.data);

    res.json({
      orderId: orderId,
      paymentSessionId: response.data.payment_session_id,
      cashfreeResponse: response.data, // add full response
    });

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Failed to create order" });
  }
};

/*
export const paymentCallback = async (req, res) => {
  try {
    const { orderId } = req.body;

    const headers = {
      "x-client-id": process.env.CF_APP_ID,
      "x-client-secret": process.env.CF_SECRET_KEY,
      "x-api-version": "2022-09-01",
    };

    const response = await axios.get(
      `${BASE_URL}/${orderId}`,
      { headers }
    );
    const isPaid = response.data.order_status === "PAID";

    return res.json({
      success: isPaid,
      orderStatus: response.data.order_status,
      cashfreeResponse: response.data, // add full response
    });
  } catch (err) {
    return res.status(500).json({ error: "Verification failed" });
  }
}; */


export const paymentWebhook = async (req, res) => {
  console.log("🔔 Webhook endpoint hit");

  try {
    const signature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];
    const rawBody = req.body.toString();

    console.log("📦 Raw Body Received:", rawBody);
    console.log("🕒 Timestamp:", timestamp);
    console.log("✍️ Signature from Header:", signature);

    // 🔐 Generate Expected Signature
    const expectedSignature = crypto
      .createHmac("sha256", process.env.CF_SECRET_KEY)
      .update(timestamp + rawBody)
      .digest("base64");

    console.log("🔐 Expected Signature (Generated):", expectedSignature);

    if (signature !== expectedSignature) {
      console.log("❌ Signature Verification Failed");
      return res.status(400).send("Invalid Signature");
    }

    console.log("✅ Signature Verified Successfully");

    const event = JSON.parse(rawBody);
    console.log("📨 Parsed Webhook Event:", event);

    if (event.type !== "PAYMENT_SUCCESS_WEBHOOK") {
      console.log("ℹ️ Ignored Event Type:", event.type);
      return res.status(200).send("Event Ignored");
    }

    if (event.data.payment.payment_status !== "SUCCESS") {
      console.log("⚠️ Payment Not Successful:", event.data.payment.payment_status);
      return res.status(200).send("Payment Not Successful");
    }

    const orderId = event.data.order.order_id;
    const customerId = event.data.customer_details.customer_id;
    const plan = event.data.order.order_note || "PRO";

    console.log("🧾 Order ID:", orderId);
    console.log("👤 Customer ID:", customerId);
    console.log("📦 Plan:", plan);

    const user = await User.findOne({ _id: customerId });

    if (!user) {
      console.log("❌ User not found in DB");
      return res.status(404).send("User Not Found");
    }

    if (user.plan === plan && user.subscriptionStatus === "ACTIVE") {
      console.log("⚠️ User already upgraded. Skipping update.");
      return res.status(200).send("Already Processed");
    }

    // 🔹 Calculate expiration date
    let planDurationDays = 30; // default 1 month
    if (plan === "PRO") planDurationDays = 30;
    if (plan === "ENTERPRISE") planDurationDays = 30;

    const planExpires = new Date();
    planExpires.setDate(planExpires.getDate() + planDurationDays);

    // 🧠 Update user plan, subscription status, paymentId & expiration
    user.plan = plan;
    user.subscriptionStatus = "ACTIVE";
    user.paymentId = event.data.payment.cf_payment_id;
    user.planExpires = planExpires;

    await user.save();

    console.log(`🎉 User plan updated to ${plan}, subscription ACTIVE, expires on ${planExpires}`);

    return res.status(200).send("Webhook Processed Successfully");

  } catch (error) {
    console.error("🔥 Webhook Error:", error);
    return res.status(500).send("Server Error");
  }
};
