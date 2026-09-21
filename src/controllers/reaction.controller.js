import { asyncHandler } from "../utils/asyncHandler.js";
import { isValidObjectId, mongoose } from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Video } from "../models/video.model.js";
import { Reaction } from "../models/reaction.model.js";

const toggleReaction = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const { videoId } = req.params;
  const { reactionType } = req.body; // reactionType: 'like' or 'dislike'
  const userId = req.user._id;
  //   validation
  if (!isValidObjectId(videoId)) throw new ApiError(400, "Invalid videoId");
  const videoExist = await Video.findById(videoId);
  if (!videoExist) throw new ApiError(404, "video not found");

  if (!["like", "dislike"].includes(reactionType))
    throw new ApiError(400, "Invalid reactionType");

  const filter = { userId, videoId };
  const existing = await Reaction.findOne(filter).session(session);

  let likeInc = 0;
  let dislikeInc = 0;
  let userReaction = null;
  try {
    if (!existing) {
      // Case 1: New reaction - create it
      await Reaction.create([{ userId, videoId, reactionType }], {
        session,
      });
      reactionType === "like" ? (likeInc = 1) : (dislikeInc = 1);
      userReaction = reactionType;
    } else if (existing.reactionType === reactionType) {
      // Case 2: Same reaction clicked again - remove it
      await Reaction.deleteOne({ _id: existing._id }).session(session);
      reactionType === "like" ? (likeInc = -1) : (dislikeInc = -1);
      userReaction = null;
    } else {
      // Case 3: Switch reaction - like to dislike or vice versa
      await Reaction.updateOne(
        { _id: existing._id },
        { reactionType, updatedAt: new Date() }
      ).session(session);

      if (reactionType === "like") {
        likeInc = 1;
        dislikeInc = -1;
      } else {
        likeInc = -1;
        dislikeInc = 1;
      }
      userReaction = reactionType;
    }

    // Update cached counts in Video/Post collection
    const updatedVideo = await Video.findByIdAndUpdate(
      videoId,
      { $inc: { likeCount: likeInc, dislikeCount: dislikeInc } },
      { new: true, session }
    );

    await session.commitTransaction();
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          likeCount: updatedVideo.likeCount,
          dislikeCount: updatedVideo.dislikeCount,
          userReaction,
        },
        "reaction Updated successfully"
      )
    );
  } catch (error) {
    await session.abortTransaction();
    if (error.code === 11000)
      throw new ApiError(409, "Duplicate reaction", error);

    throw new ApiError(500, "Internal server error", error);
  } finally {
    session.endSession();
  }
});
export { toggleReaction };
