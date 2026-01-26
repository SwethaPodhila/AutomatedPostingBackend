// models/Automation.js
import mongoose from "mongoose";

const AutomationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    platform: {
      type: String,
      enum: ["facebook", "instagram", "linkedin", "twitter","pinterest","telegram","bluesky"],
      required: true,
    },

    pageId: {
      type: String,
      required: true,
    },

    // 🔥 ONLY INPUT
    prompt: {
      type: String,
      required: true,
    },

    // 🔁 SCHEDULING (same as manual)
    startDate: Date,
    endDate: Date,
    times: [String], // ["10:00"]

    status: {
      type: String,
      enum: ["scheduled", "completed", "failed"],
      default: "scheduled",
    },

    lastRunAt: Date, // 🔒 prevent duplicate per time slot
  },
  { timestamps: true }
);

export default mongoose.model("Automation", AutomationSchema);
