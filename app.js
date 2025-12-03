import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
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
  "http://localhost:3000", // your local frontend
  "https://automatedpostingsfrontend.onrender.com" // deployed frontend
];

app.use(cors({
  origin: function(origin, callback){
    // allow requests with no origin like Postman
    if(!origin) return callback(null, true);
    if(allowedOrigins.indexOf(origin) === -1){
      const msg = `The CORS policy for this site does not allow access from the specified Origin.`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.use("/user", userRoutes);
app.use("/social", socialRoutes);

// publish & metrics
app.post('/publish/facebook', facebookController.publish);
app.get('/metrics/facebook', facebookController.metrics);

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT} 🚀`);
});
