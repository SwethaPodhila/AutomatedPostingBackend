import mongoose from "mongoose";
const AutoManual = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    platform: {
      type: String,
      enum: ["facebook", "instagram"],
      required: true,
    },

    pageId: {
      type: String,
      required: true,
    },

    message: String,

    mediaUrl: String,

    mediaType: {
      type: String,
      enum: ["image", "video"],
    },

    // 🔥 NEW FIELDS
    startDate: Date,
    endDate: Date,

    times: [String], // ["10:00", "14:00", "18:30"]

    status: {
      type: String,
      enum: ["scheduled", "posted", "failed"],
      default: "scheduled",
    },

    lastRunAt: Date, // avoid duplicate posting
  },
  { timestamps: true }
);

export default mongoose.model("AutoManual", AutoManual);
