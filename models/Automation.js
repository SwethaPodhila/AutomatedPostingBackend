import mongoose from "mongoose";

const AutomationSchema = new mongoose.Schema({
  userId: String,
  prompt: String,
  frequency: String, // weekly / monthly
  interval: { type: Number, default: 1 },
  nextRunAt: Date,
  pageIds: [String],
  status: { type: String, default: "active" }
});

export default mongoose.model("Automation", AutomationSchema);
