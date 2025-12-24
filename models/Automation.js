import mongoose from "mongoose";

const AutomationSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },

  prompt: {
    type: String,
    required: true
  },

  frequency: {
    type: String,
    default: "daily"
  },

  interval: {
    type: Number,
    default: 1
  },

  // 🔥 CHANGE STRING → DATE
  startDate: {
    type: Date,
    required: true
  },

  endDate: {
    type: Date,
    required: true
  },

  time: {
    type: String, // "10:30"
    required: true
  },

  nextRunAt: {
    type: Date,
    required: true
  },

  lastPostedAt: {
    type: Date,
    default: null
  },

  pageIds: {
    type: [String],
    required: true
  },

  status: {
    type: String,
    default: "active"
  }
}, { timestamps: true });

export default mongoose.model("Automation", AutomationSchema);
