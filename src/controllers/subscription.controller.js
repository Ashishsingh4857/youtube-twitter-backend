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
    throw new ApiError(
      400,
      "Invalid channelId ! No channel found with this id"
    );
  }

  const pipeline = [
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
              "avatar.url": 1,
            },
          },
        ],
      },
    },
    //This stage processes multiple pipelines within a single stage. In this case, it's used to calculate the subscribers and the subscribers count in a single pipeline
    {
      $facet: {
        subscribers: [
          {
            $unwind: "$subscriber",
          },
          {
            $project: {
              _id: 0,
              subscriber: "$subscriber",
            },
          },
        ],
        subscribersCount: [
          {
            $count: "count",
          },
        ],
      },
    },
  ];

  try {
    const result = await Subscription.aggregate(pipeline);
    console.log(result);

    const subscribers = result[0].subscribers;
    const subscribersCount = result[0].subscribersCount[0]?.count || 0;

    if (!subscribers || subscribers.length === 0) {
      throw new ApiError(404, "No subscribers found");
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { subscribers, subscribersCount },
          "Fetched User Channel Subscribers"
        )
      );
  } catch (error) {
    throw new ApiError(
      500,
      "Internal server error. Unable to fetch User Channel Subscribers",
      error
    );
  }
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

  // Input validation
  if (!isValidObjectId(subscriberId)) {
    throw new ApiError(400, "Invalid subscriberId");
  }

  // Existence check
  const user = await User.findById(subscriberId);
  if (!user) {
    throw new ApiError(
      400,
      "Invalid subscriberId ! No user found with this id"
    );
  }

  const pipeline = [
    {
      $match: { subscriber: new mongoose.Types.ObjectId(subscriberId) },
    },
    {
      $lookup: {
        from: "users",
        localField: "channel",
        foreignField: "_id",
        as: "Channel",
        pipeline: [
          {
            $project: {
              _id: 1,
              username: 1,
              fullName: 1,
              "avatar.url": 1,
            },
          },
        ],
      },
    },
    {
      $facet: {
        Channels_Subscribed_To: [{ $unwind: "$Channel" }],
        channels_Subscribed_To_Count: [{ $count: "count" }],
      },
    },
  ];

  try {
    const result = await Subscription.aggregate(pipeline);
    const subscribedChannels = result[0].Channels_Subscribed_To;
    const subscribedChannelsCount =
      result[0].channels_Subscribed_To_Count[0]?.count || 0;

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { subscribedChannels, subscribedChannelsCount },
          "Fetched subscribed channels"
        )
      );
  } catch (error) {
    throw new ApiError(
      500,
      "Internal server error. Unable to fetch subscribed channels",
      error
    );
  }
});
export {
  toggleSubscription,
  getUserChannelSubscribers,
  getSubscribedChannels,
  getSubscriptionStatus,
};
