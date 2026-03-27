import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { ensureProjectDirs } from "../lib/paths";
import { DEFAULT_MINUTES_RANGE } from "../lib/constants";
import { fetchAndNormalizeMetros, fetchAndNormalizeStores } from "./osm";
import { buildAndPersistLayers } from "./overlay-cache";
import { requestIsochrone } from "./valhalla";
import type { CacheMetadata } from "../lib/types";
import { cacheDir } from "../lib/paths";

function minuteRange(): number[] {
  return Array.from(
    { length: DEFAULT_MINUTES_RANGE.max - DEFAULT_MINUTES_RANGE.min + 1 },
    (_, index) => DEFAULT_MINUTES_RANGE.min + index,
  );
}

export async function runRefreshPipeline(): Promise<CacheMetadata> {
  await ensureProjectDirs();
  const [stores, metros] = await Promise.all([fetchAndNormalizeStores(), fetchAndNormalizeMetros()]);
  const [storeLayers, metroLayers] = await Promise.all([
    buildAndPersistLayers("store", stores, minuteRange(), requestIsochrone),
    buildAndPersistLayers("metro", metros, minuteRange(), requestIsochrone),
  ]);

  const generatedAt = new Date().toISOString();
  const metadata: CacheMetadata = {
    generatedAt,
    source: "refresh",
    supportedMinutes: DEFAULT_MINUTES_RANGE,
    counts: {
      stores: stores.length,
      metros: metros.length,
    },
    layers: {
      store: { ...storeLayers, updatedAt: generatedAt },
      metro: { ...metroLayers, updatedAt: generatedAt },
    },
    bbox: {
      minLon: 20.8,
      minLat: 52.05,
      maxLon: 21.32,
      maxLat: 52.4,
    },
  };

  await writeFile(join(cacheDir, "metadata.json"), JSON.stringify(metadata, null, 2));
  return metadata;
}
