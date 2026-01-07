import express from "express";
import { createOrder,paymentCallback,cashfreeWebhook } from "../controllers/payment.controller.js";

const router = express.Router();

// POST /api/payment/create-order
router.post("/create-order", createOrder);

// POST /api/payment/callback
router.post("/callback", paymentCallback);
router.post("/webhook", cashfreeWebhook);

export default router;
