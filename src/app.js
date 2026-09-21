import express from "express";
import cors from "cors"; // Cross-Origin Resource Sharing
import cookieParser from "cookie-parser"; // Parse Cookie header and populate req.cookies

const app = express();
const PORT = process.env.PORT || 8000;
// Middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);
app.use(express.json({ limit: "16kb" })); // Enable JSON body parsing

// Enable URL-encoded body parsing
app.use(
  express.urlencoded({
    extended: true,
    inflate: true,
    limit: "16kb",
  })
);
// Serve static files from the "public" directory
app.use(express.static("public"));
// Enable cookie parsing
app.use(cookieParser());

//routes import
import healthCheckRouter from "./routes/healthcheck.routes.js";
import userRouter from "./routes/user.routes.js";
import videoRouter from "./routes/video.routes.js";
import commentRouter from "./routes/comment.routes.js";
import likeRouter from "./routes/like.routes.js";
import tweetRouter from "./routes/tweet.routes.js";
import subscriptionRouter from "./routes/subscription.routes.js";
import playlistRouter from "./routes/playlist.routes.js";
import dashboardRouter from "./routes/dashboard.routes.js";
import reactionRouter from "./routes/reaction.routes.js";

//routes declaration
app.use("/api/v1/users", userRouter); // path or handler
app.use("/api/v1/healthcheck", healthCheckRouter);
app.use("/api/v1/videos", videoRouter);
app.use("/api/v1/comments", commentRouter);
app.use("/api/v1/likes", likeRouter);
app.use("/api/v1/tweets", tweetRouter);
app.use("/api/v1/subscriptions", subscriptionRouter);
app.use("/api/v1/playlist", playlistRouter);
app.use("/api/v1/dashboard", dashboardRouter);
app.use("/api/v1/reaction", reactionRouter);

//example url -  http://localhost:3000/api/v1/users/register
export { app, PORT };
