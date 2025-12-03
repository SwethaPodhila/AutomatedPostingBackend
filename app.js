import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./config/db.js";
import userRoutes from "./routes/user.routes.js";
import socialRoutes from "./routes/social.routes.js";
import * as facebookController from "./controllers/social.controller.js";

dotenv.config();
connectDB();

const app = express();

// ✅ CORS setup for multiple origins
const allowedOrigins = [
  "http://localhost:3000", // local frontend
  "https://automatedpostingsfrontend.onrender.com" // deployed frontend
];

app.use(cors({
  origin: function(origin, callback){
    if(!origin) return callback(null, true); // allow Postman / server requests
    if(allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"), false);
  },
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  credentials: true, // allow cookies / auth headers
}));

// ✅ Handle preflight requests
app.options("*", cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

// Routes
app.use("/user", userRoutes);
app.use("/social", socialRoutes);

// Facebook publish & metrics
app.post('/publish/facebook', facebookController.publish);
app.get('/metrics/facebook', facebookController.metrics);

// Start server
app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT} 🚀`);
});
