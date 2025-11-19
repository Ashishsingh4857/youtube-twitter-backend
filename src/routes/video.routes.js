import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  publishAVideo,
  getAllVideos,
  getVideoById,
  deleteVideo,
  updateVideo,
  togglePublishStatus,
  getVideosByUser,
} from "../controllers/video.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
const videoRouter = Router();
videoRouter.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

videoRouter
  .route("/")
  .get(getAllVideos)
  .post(
    upload.fields([
      {
        name: "videoFile",
        maxCount: 1,
      },
      {
        name: "thumbnail",
        maxCount: 1,
      },
    ]),
    publishAVideo
  );
videoRouter
  .route("/:videoId")
  .get(getVideoById)
  .delete(deleteVideo)
  .patch(upload.single("thumbnail"), updateVideo);

videoRouter.route("/toggle/publish/:videoId").patch(togglePublishStatus);
videoRouter.route("/user/:username").get(getVideosByUser);

export default videoRouter;
