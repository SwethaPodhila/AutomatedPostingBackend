import mongoose from "mongoose";

const AutomationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  prompt: { type: String, required: true },
  frequency: { type: String, default: "daily" }, // can be "daily", "weekly", "monthly"
  interval: { type: Number, default: 1 },
  startDate: { type: String, required: true },   // stores user input date (YYYY-MM-DD)
  endDate: { type: String, required: true },     // stores user input date (YYYY-MM-DD)
  time: { type: String, required: true },        // stores user input time (HH:MM)
  nextRunAt: { type: Date, required: true },     // first run datetime
  pageIds: { type: [String], required: true },   // array of page IDs
  status: { type: String, default: "active" }
}, { timestamps: true });

export default mongoose.model("Automation", AutomationSchema);