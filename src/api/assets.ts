import { existsSync, mkdirSync } from "fs";

import type { ApiConfig } from "../config";

export function ensureAssetsDir(cfg: ApiConfig) {
  if (!existsSync(cfg.assetsRoot)) {
    mkdirSync(cfg.assetsRoot, { recursive: true });
  }
}

export function getFileType(mediaType: String) {
  const type = mediaType.split("/")
  return type[1] || "";
}