import express from "express";
import { triggerAutomation,getUserAccounts } from "../controllers/automation.controller.js";

const router = express.Router();

router.post("/trigger", triggerAutomation);
router.get("/accounts/:userId", getUserAccounts);

export default router;
   