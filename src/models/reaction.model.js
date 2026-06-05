import mongoose, { Schema } from "mongoose";

const reactionSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    videoId: { type: Schema.Types.ObjectId, ref: "Video", required: true },
    reactionType: {
      type: String,
      enum: ["like", "dislike"],
      required: true,
    },
  },
  { timestamps: true }
);

reactionSchema.index({ userId: 1, postId: 1 }, { unique: true });
// faster Count query
reactionSchema.index({ postId: 1, reactionType: 1 });

export const Reaction = mongoose.model("Reaction", reactionSchema);
