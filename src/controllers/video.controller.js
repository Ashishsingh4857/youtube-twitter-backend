import { Video } from "../models/video.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isValidObjectId } from "mongoose";
import {
  destroyOnCloudinary,
  uploadOnCloudinary,
} from "../utils/cloudinary.js";
import { Like } from "../models/like.model.js";
import { Comment } from "../models/comment.model.js";
import { User } from "../models/user.model.js";
const getAllVideos = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortType = -1,
    userId,
    query,
  } = req.query;

  // Input Validation
  if (isNaN(page) || page < 1) throw new ApiError(400, "Invalid page number");
  if (isNaN(limit) || limit < 1)
    throw new ApiError(400, "Invalid limit number");

  // Validate sortType
  // if (sortType !== "asc" && sortType !== "desc")
  //   throw new ApiError(400, "Invalid sort type");

  // Validate sortBy
  const validSortFields = ["createdAt", "title", "userId"];
  if (!validSortFields.includes(sortBy))
    throw new ApiError(400, "Invalid sort field");

  //pipeline construction
  const pipeline = [];
  //search stage
  // for using Full Text based search u need to create a search index in mongoDB atlas
  // you can include field mapppings in search index eg.title, description, as well
  // Field mappings specify which fields within your documents should be indexed for text search.
  // this helps in searching only in title, desc providing faster search results
  // here the name of search index is 'search-videos'
  if (query) {
    console.log(query);
    pipeline.push({
      $search: {
        index: "search-videos",
        text: {
          query: query,
          path: ["title", "description"],
        },
      },
    });
  }
  //userId filter
  if (userId) {
    if (!isValidObjectId(userId)) throw new ApiError(400, "Invalid userId");
    pipeline.push({ $match: { owner: new mongoose.Types.ObjectId(userId) } });
  }
  //only published videos
  pipeline.push({ $match: { isPublished: true } });
  //populate owner details
  pipeline.push({
    $lookup: {
      from: "users",
      localField: "owner",
      foreignField: "_id",
      as: "ownerDetails", //return array ownerDetails:[{_id:",username:"",avatar:{url:""}}]
      pipeline: [
        {
          $project: {
            username: 1,
            "avatar.url": 1,
          },
        },
      ],
    },
  });
  //unwind ownerDetails array to object
  pipeline.push({ $unwind: "$ownerDetails" });
  //sort stage
  pipeline.push({
    $sort: {
      [sortBy]: sortType === "asc" ? 1 : -1,
    },
  });
  //facet stage for pagination the total count of documents
  pipeline.push({
    $facet: {
      metadata: [{ $count: "total" }],
      data: [{ $skip: (page - 1) * limit }, { $limit: parseInt(limit) }],
    },
  });

  try {
    const result = await Video.aggregate(pipeline);
    console.log(result);

    const video = result[0];
    console.log(video);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          videos: video.data,
          pagination: {
            currentPage: parseInt(page),
            limit: parseInt(limit),
            totalVideos: video.metadata[0] ? video.metadata[0].total : 0, // total videos count
          },
        },
        "Videos fetched successfully"
      )
    );
  } catch (error) {
    throw new ApiError(500, "ERROR:fetching videos", error);
  }
});
const publishAVideo = asyncHandler(async (req, res) => {
  const { title, description } = req.body;
  if (!title) throw new ApiError(400, "title is required");

  if (!description) throw new ApiError(400, "description is required");

  // get video, upload to cloudinary, create video
  const videoFileLocalPath = req.files?.videoFile?.[0]?.path;
  const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path;

  if (!videoFileLocalPath) throw new ApiError(400, "video file  is required");

  if (!thumbnailLocalPath) throw new ApiError(400, "thumbnail is required");

  // upload local files in Cloudinary
  const video = await uploadOnCloudinary(videoFileLocalPath);
  const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);
  if (!video?.url) throw new ApiError(500, "something went wrong");

  if (!thumbnail.url) throw new ApiError(500, "something went wrong");

  //upload in database
  try {
    const createdVideo = await Video.create({
      title,
      description,
      duration: video.duration,
      videoFile: {
        url: video.url,
        public_id: video.public_id,
        display_name: video.display_name,
      },
      thumbnail: { url: thumbnail.url, public_id: thumbnail.public_id },
      owner: req.user?._id,
    });
    //check video is created
    const publishedVideo = await Video.findById(createdVideo?._id);

    if (!publishedVideo)
      throw new ApiError(500, "something went wrong while uploading video");

    return res
      .status(201)
      .json(
        new ApiResponse(200, publishedVideo, "video published successfully")
      );
  } catch (error) {
    throw new ApiError(
      500,
      "something went wrong while uploading video",
      error
    );
  }
});

const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  if (!isValidObjectId(videoId)) throw new ApiError(400, "Invalid videoId");

  //find in db
  const videoExist = await Video.findById(videoId);
  if (!videoExist) throw new ApiError(404, "video not found");
  try {
    const video = await Video.aggregate([
      //first pipeline
      { $match: { _id: videoExist._id } },
      //2nd pipeline
      // join the Likes collection find all the likes documents
      //  where the video field matches the _id of the current video
      {
        $lookup: {
          from: "likes",
          foreignField: "video",
          localField: "_id",
          as: "likes", // result are stored in array called "likes"
        },
      },
      //3rd pipeline
      // join the users collection to get the video owner information
      //match the owner field of the video with users _id
      {
        $lookup: {
          from: "users",
          foreignField: "_id",
          localField: "owner",
          as: "owner",
          //inside pipeline to  proses the owner data
          //join the subscriptions collection  to find all subscribers of the channel
          //match the _id of the owner with channel filed
          pipeline: [
            {
              $lookup: {
                from: "subscriptions",
                foreignField: "channel",
                localField: "_id",
                as: "subscribers",
              },
            },
            //this stage adds new fields to the owner document
            {
              $addFields: {
                subscribersCount: {
                  $size: "$subscribers", //calculate the number of subscribers on the subscribers array
                },
                //check if the current user is subscribed the channel
                isSubscribed: {
                  $cond: {
                    if: {
                      $in: [req.user?._id, "$subscribers.subscriber"], //check user is present in  / return boolean value
                    },
                    then: true,
                    else: false,
                  },
                },
              },
            },
            // stage to include/exclude specific fields from the final output in the owner array
            {
              $project: {
                username: 1,
                "avatar.url": 1,
                subscribersCount: 1,
                isSubscribed: 1,
              },
            },
          ],
        },
      },
      //stage to adds fields- likesCount, owner,isLiked
      {
        $addFields: {
          likesCount: {
            $size: "$likes",
          },
          owner: {
            $first: "$owner",
          },
          isLiked: {
            $cond: {
              if: { $in: [req.user?._id, "$likes.likedBy"] },
              then: true,
              else: false,
            },
          },
        },
      },
      // stage to include/exclude specific fields from the final output
      {
        $project: {
          videoFile: 1,
          thumbnail: 1,
          title: 1,
          description: 1,
          views: 1,
          createdAt: 1,
          duration: 1,
          comments: 1,
          owner: 1,
          likesCount: 1,
          isLiked: 1,
        },
      },
    ]);

    return res
      .status(200)
      .json(new ApiResponse(200, video, "video fetch successfully"));
  } catch (error) {
    throw new ApiError(500, "something went wrong", error);
  }
});

const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { title, description } = req.body ?? {}; // nullish coalescing op (??) -setting empty{} if property is missing
  if (!title && !description && !req.file) {
    throw new ApiError(400, "At least one field is required");
  }
  //check valid id
  if (!isValidObjectId(videoId)) throw new ApiError(400, "Invalid videoId");

  //check video is exist
  const videoExist = await Video.findById(videoId);
  if (!videoExist) throw new ApiError(400, "video does not exist");
  //check ownership
  if (videoExist?.owner?.toString() !== req.user?._id.toString()) {
    throw new ApiError(
      400,
      "you do not have permission to perform this action"
    );
  }
  //files
  let updatedThumbnail;
  if (req.file && req.file?.path) {
    //update on Cloudinary
    const thumbnailLocalPath = req.file?.path;
    updatedThumbnail = await uploadOnCloudinary(thumbnailLocalPath);
    if (!updatedThumbnail?.url) throw new ApiError(500, "something went wrong");
  }

  //available  fields To Update
  const fieldsToUpdate = {};
  if (title) fieldsToUpdate.title = title;
  if (description) fieldsToUpdate.description = description;
  if (updatedThumbnail?.url) {
    fieldsToUpdate.thumbnail = {
      url: updatedThumbnail.url,
      public_id: updatedThumbnail.public_id,
    };
  }

  try {
    //update in db
    const video = await Video.findByIdAndUpdate(
      videoExist._id,
      {
        $set: fieldsToUpdate,
      },
      { new: true }
    );
    if (!video)
      throw new ApiError(500, "something went wrong while updating video");
    // delete old file from Cloudinary
    if (
      videoExist?.thumbnail?.public_id?.toString() !==
        video?.thumbnail?.public_id?.toString() &&
      updatedThumbnail?.url
    ) {
      await destroyOnCloudinary(videoExist?.thumbnail?.public_id);
    }

    return res
      .status(200)
      .json(new ApiResponse(200, video, "video updated successfully"));
  } catch (error) {
    throw new ApiError(500, "something went wrong", error);
  }
});

const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  //check valid id
  if (!isValidObjectId(videoId)) throw new ApiError(400, "Invalid videoId");
  //existence check
  const videoExist = await Video.findById(videoId);
  if (!videoExist) throw new ApiError(400, "video does not exist");

  // ownership check
  if (videoExist?.owner?.toString() !== req.user?._id.toString()) {
    throw new ApiError(
      400,
      "you do not have permission to perform this action"
    );
  }
  //delete video from db
  try {
    const deletedVideo = await Video.deleteOne({ _id: videoExist?._id });
    if (!deletedVideo)
      throw new ApiError(400, "Failed to delete the video please try again");
    //delete from Cloudinary
    await destroyOnCloudinary(videoExist?.videoFile?.public_id, "video"); // delete video
    await destroyOnCloudinary(videoExist?.thumbnail?.public_id); // delete thumbnail
    //delete other data related to video
    await Like.deleteMany({ video: videoId });
    await Comment.deleteMany({ video: videoId });

    return res
      .status(200)
      .json(new ApiResponse(200, deleteVideo, "video deleted successfully"));
  } catch (error) {
    throw new ApiError(500, "something went wrong", error);
  }
});

const togglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  //check valid id
  if (!isValidObjectId(videoId)) throw new ApiError(400, "Invalid videoId");

  //existence check
  const videoExist = await Video.findById(videoId);
  if (!videoExist) throw new ApiError(400, "video does not exist");

  // ownership check
  if (videoExist?.owner?.toString() !== req.user?._id.toString()) {
    throw new ApiError(
      400,
      "you do not have permission to perform this action"
    );
  }
  try {
    //update the field
    const updatedVideo = await Video.findByIdAndUpdate(
      videoExist?._id,
      {
        $set: { isPublished: !videoExist?.isPublished },
      },
      { new: true }
    ).select("_id isPublished");

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          updatedVideo,
          "video publication status updated successfully"
        )
      );
  } catch (error) {
    throw new ApiError(500, "something went wrong", error);
  }
});
const getVideosByUser = asyncHandler(async (req, res) => {
  const { username } = req.params;

  if (!username) {
    throw new ApiError(400, "Username is required");
  }

  // Find user by username
  const user = await User.findOne({ username });
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  try {
    const videos = await Video.aggregate([
      // Match videos by owner (user)
      {
        $match: {
          owner: user._id,
        },
      },
      // Join the Likes collection to get likes count and check if liked
      {
        $lookup: {
          from: "likes",
          foreignField: "video",
          localField: "_id",
          as: "likes",
        },
      },
      // Join the Comments collection to get comments count
      {
        $lookup: {
          from: "comments",
          foreignField: "video",
          localField: "_id",
          as: "comments",
        },
      },
      // Add fields for likes count, comments count, and isLiked
      {
        $addFields: {
          likesCount: {
            $size: "$likes",
          },
          commentsCount: {
            $size: "$comments",
          },
          isLiked: {
            $cond: {
              if: {
                $in: [req.user?._id, "$likes.likedBy"],
              },
              then: true,
              else: false,
            },
          },
        },
      },
      // Join the users collection to get owner details
      {
        $lookup: {
          from: "users",
          foreignField: "_id",
          localField: "owner",
          as: "owner",
        },
      },
      // Add fields for owner details
      {
        $addFields: {
          owner: {
            $first: "$owner",
          },
        },
      },
      // Project required fields
      {
        $project: {
          videoFile: 1,
          thumbnail: 1,
          title: 1,
          description: 1,
          views: 1,
          createdAt: 1,
          duration: 1,
          likesCount: 1,
          commentsCount: 1,
          isLiked: 1,
          owner: {
            username: "$owner.username",
            avatar: "$owner.avatar",
          },
        },
      },
    ]);

    return res
      .status(200)
      .json(new ApiResponse(200, videos, "Videos fetched successfully"));
  } catch (error) {
    throw new ApiError(500, "Something went wrong", error);
  }
});

export {
  getAllVideos,
  publishAVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
  getVideosByUser,
};
