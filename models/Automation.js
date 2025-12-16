const mongoose = require("mongoose");

const AutomationPostSchema = new mongoose.Schema(
  {
    user: {
      type: String,
      required: true
    },

    content: {
      type: String,
      required: true
    },

    frequency: {
      type: String,
      enum: ["weekly", "monthly"],
      required: true
    },

    startDate: {
      type: Date,
      required: true
    },

    socialAccounts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SocialAccount"
      }
    ],

    status: {
      type: String,
      enum: ["active", "paused"],
      default: "active"
    },

    lastTriggeredAt: Date,
    nextTriggerAt: Date
  },
  { timestamps: true }
);

module.exports = mongoose.model("AutomationPost", AutomationPostSchema);
