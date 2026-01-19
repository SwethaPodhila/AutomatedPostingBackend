import mongoose from "mongoose";

const supportSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true
    },
    subject: {
      type: String,
      required: true,
      enum: [
        "Connection Problem",
        "Account Problems",
        "Postings Problem",
        "Plans",
        "Features",
        "Registration or Login",
        "Others"
      ]
    },
    message: {
      type: String,
      required: true
    },
    status: {
      type: String,
      default: "OPEN"
    }
  },
  { timestamps: true }
);

export default mongoose.model("Support", supportSchema);
