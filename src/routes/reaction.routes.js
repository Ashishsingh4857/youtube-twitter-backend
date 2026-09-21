import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { toggleReaction } from "../controllers/reaction.controller.js";
const reactionRouter = Router();
reactionRouter.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file
reactionRouter;

reactionRouter.route("/toggle-reaction/v/:videoId").post(toggleReaction);
export default reactionRouter;
