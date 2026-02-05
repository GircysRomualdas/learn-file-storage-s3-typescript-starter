import { respondWithJSON } from "./json";
import { getFileType, getVideoAspectRatio } from "./assets";
import { type ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { unlink } from "fs/promises";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { getBearerToken, validateJWT } from "../auth";
import path from "path";
import { randomBytes } from "crypto";
import { getVideo, updateVideo } from "../db/videos";

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading video", videoId, "by user", userID);

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }

  if (video.userID !== userID) {
    throw new UserForbiddenError("User is not the owner of this video");
  }

  const formData = await req.formData();
  const file = formData.get("video");
  if (!(file instanceof File)) {
    throw new BadRequestError("Video file missing");
  }

  const MAX_UPLOAD_SIZE = 1 << 30;
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("Video file is too large");
  }

  const mediaType = file.type;
  if (!mediaType) {
    throw new BadRequestError("Missing Content-Type for video");
  }
  if (mediaType !== "video/mp4") {
    throw new BadRequestError("Invalid file type. Only MP4 allowed.");
  }

  const arrayBuffer = await file.arrayBuffer();
  if (!arrayBuffer) {
    throw new Error("Error reading file data");
  }

  const fileType = getFileType(mediaType);
  if (!fileType) {
    throw new Error("Unsupported or invalid file type");
  }

  const fileName = randomBytes(32).toString("base64url");
  const tempFilePath = path.join(cfg.assetsRoot, `${fileName}.${fileType}`);
  await Bun.write(tempFilePath, arrayBuffer);
  let key;

  try {
    const localFile = Bun.file(tempFilePath);
    const aspectRatio = await getVideoAspectRatio(tempFilePath);
    key = `${aspectRatio}/${fileName}.${fileType}`;
    const s3File = cfg.s3Client.file(key);
    await s3File.write(localFile);
  } finally {
    await unlink(tempFilePath);
  }

  const videoURL = `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${key}`;
  video.videoURL = videoURL;
  updateVideo(cfg.db, video);

  return respondWithJSON(200, video);
}
