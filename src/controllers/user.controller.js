import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import {
  uploadOnCloudinary,
  destroyOnCloudinary,
} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
// Generate Access and Refresh Tokens
const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const activeUser = await User.findById(userId);
    const accessToken = activeUser.generateAccessToken();
    const refreshToken = activeUser.generateRefreshToken();
    activeUser.refreshToken = refreshToken;
    await activeUser.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(500, "Something went wrong while generating tokens");
  }
};
const registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, username, password } = req.body;
  if (
    // validation - not empty
    [fullName, email, username, password].some((field) => field === undefined)
  ) {
    throw new ApiError(400, "All fields are required");
  }
  // check if user already exists
  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }
  // console.log(req.files);

  const avatarLocalPath = req.files?.avatar?.[0]?.path;
  const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

  // return res.send("ok");
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }
  // upload local files in Cloudinary
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);
  if (!avatar) {
    throw new ApiError(400, "Avatar file is required");
  }
  // upload in database
  const user = await User.create({
    fullName,
    avatar: avatar?.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  // check user creation in db
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken" // Exclude (remove) password and refresh token from the response
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }
  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered Successfully"));
});
//login method
const loginUser = asyncHandler(async (req, res) => {
  //todos// req body -> data
  // username or email
  //find the user
  //password check
  //access and refresh token
  //send cookie

  const { username, email, password } = req.body;
  if (!(email || username)) {
    throw new ApiError(400, "username or email is required");
  }
  //find user in database
  const user = await User.findOne({ $or: [{ username }, { email }] });
  if (!user) {
    throw new ApiError(404, "User does not exist");
  }
  //compare password
  const isPasswordValid = await user.isPasswordCorrect(password); //method injected in during user model creation
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );
  //send cookie
  const options = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged In Successfully"
      )
    );
});
//logout  method
const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1, // this removes the field from document
      },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  //req.cookie.refreshToken  Encrypted
  // decode
  // compare with db refresh token if both are same generate new token
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;
  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized request");
  }
  const decodedToken = jwt.verify(
    incomingRefreshToken,
    process.env.REFRESH_TOKEN_SECRET,
    {
      httpOnly: true,
      secure: true,
    }
  );
  const user = await User.findById(decodedToken?._id);
  if (!user) {
    throw new ApiError(401, "Invalid refresh token");
  }
  if (incomingRefreshToken !== user?.refreshToken) {
    throw new ApiError(401, "Refresh token is expired or used");
  }
  const { accessToken, newRefreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );
  const options = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", newRefreshToken, options)
    .json(
      new ApiResponse(
        200,
        { accessToken, refreshToken: newRefreshToken },
        "Access token refreshed"
      )
    );
});
const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body; // Get old and new passwords from request body
  if (!oldPassword || !newPassword) {
    throw new ApiError(400, "Old password and new password are required");
  }
  const user = await User.findById(req.user?._id); // Find the user by ID from the authenticated request
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  // Verify the old password
  const isPasswordValid = await user.isPasswordCorrect(oldPassword);
  if (!isPasswordValid) {
    throw new ApiError(400, "Invalid old password");
  }
  user.password = newPassword;
  await user.save({ validateBeforeSave: false }); // Save the user with the new password
  return res
    .status(200)
    .json(new ApiResponse(201, {}, "password changed successfully"));
});

//get current user
const getCurrentUser = asyncHandler(async (req, res) => {
  const user = req.user.toJSON();
  delete user.password;
  delete user.refreshToken;
  return res
    .status(200)
    .json(new ApiResponse(200, user, "User fetched successfully"));
});

// Update user account details (e.g., fullName, username, email)
const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, username, email } = req.body;
  if (!fullName && !username && !email) {
    throw new ApiError(400, "At least one field is required to update");
  }
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        email: email,
        fullName: fullName,
        username: username, // add this line
      },
    },
    { new: true }
  ).select("-password -refreshToken");
  // Exclude password from the response

  if (!user) {
    throw new ApiError(500, "Something went wrong while updating user");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, user, "User updated successfully"));
});
const updateUserAvatar = asyncHandler(async (req, res) => {
  // req.file => from multer middleware
  // req.user => from verifyJwt middleware
  const avatarLocalPath = req.file?.path;
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath); // Upload to Cloudinary
  if (!avatar?.url) {
    throw new ApiError(400, "Error while uploading avatar");
  }

  // Update user's avatar in the database
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        "avatar.url": avatar.url,
        "avatar.public_id": avatar.public_id,
      },
    },
    { new: true }
  ).select("-password -refreshToken");
  //  delete old image
  if (req.user?.avatar?.public_id) {
    await destroyOnCloudinary(req.user.avatar.public_id, "image");
  }

  return res
    .status(200)
    .json(ApiResponse(200, user, "Avatar image updated successfully"));
});
const updateUserCoverImage = asyncHandler(async (req, res) => {
  // req.file => from multer middleware
  // req.user => from verifyJwt middleware
  const coverImageLocalPath = req.file?.path;
  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image file is missing");
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath); // Upload to Cloudinary
  if (!coverImage.url) {
    throw new ApiError(400, "Error while uploading cover image");
  }

  // Update user's cover image in the database
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        "coverImage.url": coverImage.url,
        "coverImage.public_id": coverImage.public_id,
      },
    },
    { new: true }
  ).select("-password -refreshToken");
  // TODO: delete old image
  if (req.user?.coverImage?.public_id) {
    await destroyOnCloudinary(req.user.coverImage.public_id, "image");
  }

  return res
    .status(200)
    .json(ApiResponse(200, user, "Cover image updated successfully"));
});
const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;
  if (!username?.trim()) {
    throw new ApiError(400, "username is missing");
  }

  const channel = await User.aggregate([
    {
      $match: {
        username: username.toLowerCase(),
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "_id",
        foreignField: "owner",
        as: "videos",
      },
    },
    {
      $addFields: {
        subscribersCount: {
          $size: "$subscribers",
        },
        channelsSubscribedToCount: {
          $size: "$subscribedTo",
        },
        isSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
        totalVideos: {
          $size: "$videos",
        },
      },
    },
    {
      $project: {
        fullName: 1,
        username: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        isSubscribed: 1,
        "avatar.url": 1,
        coverImage: 1,
        email: 1,
        createdAt: 1,
        updatedAt: 1,
        totalVideos: 1,
        videos: 1,
      },
    },
  ]);

  if (!channel?.length) {
    throw new ApiError(404, "channel does not exists");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "User channel fetched successfully")
    );
});

const getWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user._id),
      },
    },
    {
      $lookup: {
        from: "videos",
        foreignField: "_id",
        localField: "watchHistory",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              foreignField: "_id",
              localField: "owner",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    "avatar.url": 1,
                    _id: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: { $first: "$owner" },
            },
          },
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0].watchHistory,
        "Watch history fetched successfully"
      )
    );
});
export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory,
};
