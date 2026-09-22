import { Router } from "express";
import {
  getSubscribedChannels,
  getUserChannelSubscribers,
  toggleSubscription,
  getSubscriptionStatus,
} from "../controllers/subscription.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const subscriptionRouter = Router();
subscriptionRouter.use(verifyJWT);

subscriptionRouter.route("/c/:channelId/status").get(getSubscriptionStatus);

subscriptionRouter
  .route("/c/:channelId")
  .get(getUserChannelSubscribers)
  .post(toggleSubscription);

subscriptionRouter.route("/u/:subscriberId").get(getSubscribedChannels);

export default subscriptionRouter;
