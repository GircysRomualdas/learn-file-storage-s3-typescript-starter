import { existsSync, mkdirSync } from "fs";
import type { ApiConfig } from "../config";
import type { Video } from "../db/videos";

export function ensureAssetsDir(cfg: ApiConfig) {
  if (!existsSync(cfg.assetsRoot)) {
    mkdirSync(cfg.assetsRoot, { recursive: true });
  }
}

export function getFileType(mediaType: string) {
  const type = mediaType.split("/");
  return type[1] || "";
}

type AspectRatio = "landscape" | "portrait" | "other";

export async function getVideoAspectRatio(
  filePath: string,
): Promise<AspectRatio> {
  const proc = Bun.spawn([
    "ffprobe",
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "json",
    filePath,
  ]);
  const stdoutText = await new Response(proc.stdout).text();
  const stderrText = await new Response(proc.stderr).text();

  if ((await proc.exited) !== 0) {
    throw new Error(`ffprobe failed: ${stderrText}`);
  }

  const data = JSON.parse(stdoutText);

  if (!data.streams || data.streams.length === 0) {
    throw new Error("No video stream found");
  }

  const { width, height } = data.streams[0];

  const ratio = Math.floor((width / height) * 100) / 100;

  if (ratio === Math.floor((16 / 9) * 100) / 100) {
    return "landscape";
  }

  if (ratio === Math.floor((9 / 16) * 100) / 100) {
    return "portrait";
  }

  return "other";
}

export async function processVideoForFastStart(
  inputFilePath: string,
): Promise<string> {
  const outputFilePath = `${inputFilePath}.processed`;
  const proc = Bun.spawn([
    "ffmpeg",
    "-i",
    inputFilePath,
    "-movflags",
    "faststart",
    "-map_metadata",
    "0",
    "-codec",
    "copy",
    "-f",
    "mp4",
    outputFilePath,
  ]);
  const stderrText = await new Response(proc.stderr).text();

  if ((await proc.exited) !== 0) {
    throw new Error(`ffmpeg failed: ${stderrText}`);
  }

  return outputFilePath;
}

async function generatePresignedURL(
  cfg: ApiConfig,
  key: string,
  expireTime: number,
): Promise<string> {
  const url = await cfg.s3Client.presign(key, {
    expiresIn: expireTime,
  });
  return url;
}

export async function dbVideoToSignedVideo(
  cfg: ApiConfig,
  video: Video,
): Promise<Video> {
  const url = video.videoURL;

  if (!url) {
    return video;
  }

  video.videoURL = await generatePresignedURL(cfg, url, 60);
  return video;
}
