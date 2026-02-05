import { existsSync, mkdirSync } from "fs";
import type { ApiConfig } from "../config";

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
