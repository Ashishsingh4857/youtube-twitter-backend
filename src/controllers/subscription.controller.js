import { asyncHandler } from "../utils/asyncHandler.js";
import { Subscription } from "../models/subscription.model.js";
import { User } from "../models/user.model.js";
import mongoose, { isValidObjectId } from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const toggleSubscription = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  // Input validation
  if (!isValidObjectId(channelId)) {
    throw new ApiError(400, "Invalid channelId");
  }

  // Existence check
  const channel = await User.findById(channelId); // channelId = userId
  if (!channel) {
    throw new ApiError(
      400,
      "Invalid channelId ! No channel found with this id"
    );
  }

  // Check if already subscribed
  const existedSubscription = await Subscription.findOne({
    subscriber: req.user?._id,
    channel: channelId,
  });

  if (existedSubscription) {
    await Subscription.deleteOne({ _id: existedSubscription?._id });
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { isSubscribed: false },
          "channel unsubscribed successfully"
        )
      );
  }

  // If not subscribed then create new subscriber
  try {
    const newSubscription = await Subscription.create({
      subscriber: req.user?._id,
      channel: channelId,
    });

    return res
      .status(201)
      .json(
        new ApiResponse(
          201,
          { isSubscribed: true },
          "channel subscribed successfully"
        )
      );
  } catch (error) {
    throw new ApiError(
      500,
      "Internal server error. Could not toggle Subscription",
      error
    );
  }
});

// controller to return subscriber list of a channel
const getUserChannelSubscribers = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  // Input validation
  if (!isValidObjectId(channelId)) {
    throw new ApiError(400, "Invalid channelId");
  }
  // Existence check
  const channel = await User.findById(channelId);
  if (!channel) {
    throw new ApiError(400, "Invalid channelId! No channel found with this id");
  }

  const subscribers = await Subscription.aggregate([
    {
      $match: { channel: new mongoose.Types.ObjectId(channelId) },
    },
    // join with the users  collection
    {
      $lookup: {
        from: "users",
        localField: "subscriber",
        foreignField: "_id",
        as: "subscriber",
        pipeline: [
          {
            $project: {
              _id: 1,
              username: 1,
              fullName: 1,
              avatar: 1,
              description: 1,
            },
          },
        ],
      },
    },
    { $unwind: "$subscriber" },
    { $replaceRoot: { newRoot: "$subscriber" } },
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        subscribers,
        subscribersCount: subscribers.length,
      },
      "Fetched User Channel Subscribers"
    )
  );
});

const getSubscriptionStatus = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  if (!isValidObjectId(channelId)) {
    throw new ApiError(400, "Invalid channelId");
  }

  const existedSubscription = await Subscription.findOne({
    subscriber: req.user?._id,
    channel: channelId,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { isSubscribed: !!existedSubscription },
        "Fetched subscription status"
      )
    );
});

// controller to return channel list to which user has subscribed
const getSubscribedChannels = asyncHandler(async (req, res) => {
  const { subscriberId } = req.params;

  if (!isValidObjectId(subscriberId)) {
    throw new ApiError(400, "Invalid subscriberId");
  }

  const pipeline = [
    { $match: { subscriber: new mongoose.Types.ObjectId(subscriberId) } },
    {
      $lookup: {
        from: "users",
        localField: "channel",
        foreignField: "_id",
        as: "Channel",
        pipeline: [
          {
            $lookup: {
              from: "subscriptions",
              localField: "_id",
              foreignField: "channel",
              as: "subs",
            },
          },
          {
            $addFields: {
              subscribersCount: { $size: "$subs" },
            },
          },
          {
            $project: {
              _id: 1,
              username: 1,
              fullName: 1,
              "avatar.url": 1,
              subscribersCount: 1,
            },
          },
        ],
      },
    },
    { $unwind: "$Channel" },
    { $replaceRoot: { newRoot: "$Channel" } },
  ];

  const subscribedChannels = await Subscription.aggregate(pipeline);

  return res
    .status(200)
    .json(
      new ApiResponse(200, subscribedChannels, "Fetched subscribed channels")
    );
});

//remove subscriber
const removeSubscriber = asyncHandler(async (req, res) => {
  const { subscriberId } = req.params;
  const channelId = req.user._id;

  if (!isValidObjectId(subscriberId)) {
    throw new ApiError(400, "Invalid subscriberId");
  }

  const subscription = await Subscription.findOneAndDelete({
    channel: channelId,
    subscriber: subscriberId,
  });

  if (!subscription) {
    throw new ApiError(404, "Subscriber not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Subscriber removed successfully"));
});
export {
  toggleSubscription,
  getUserChannelSubscribers,
  getSubscribedChannels,
  getSubscriptionStatus,
  removeSubscriber,
};
