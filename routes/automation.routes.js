import express from "express";
import { triggerMakeAutomation,getUserAccounts } from "../controllers/automation.controller.js";

const router = express.Router();

router.post("/trigger", triggerMakeAutomation);
router.get("/accounts", getUserAccounts);

export default router;
