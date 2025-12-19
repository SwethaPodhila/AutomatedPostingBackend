import mongoose from "mongoose";

const AutomationPostSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true
    },

    automationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Automation",
      required: true
    },

    pageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SocialAccount",
      required: true
    },

    caption: {
      type: String,
      required: true
    },

    imageUrl: {
      type: String,
      required: true
    },

    postedAt: {
      type: Date,
      default: Date.now
    },

    status: {
      type: String,
      enum: ["success", "failed"],
      default: "success"
    },

    error: {
      type: String
    }
  },
  { timestamps: true }
);

export default mongoose.model("AutomationPost", AutomationPostSchema);
