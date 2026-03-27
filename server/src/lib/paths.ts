import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const serverDir = import.meta.dir;
export const serverRoot = dirname(dirname(serverDir));
export const repoRoot = dirname(serverRoot);
export const dataRoot = join(repoRoot, "data");
export const rawDataDir = join(dataRoot, "raw");
export const cacheDir = join(dataRoot, "cache");

export async function ensureProjectDirs(): Promise<void> {
  await mkdir(rawDataDir, { recursive: true });
  await mkdir(cacheDir, { recursive: true });
}
