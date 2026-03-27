import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { ensureProjectDirs } from "../lib/paths";
import { DEFAULT_MINUTES_RANGE } from "../lib/constants";
import { fetchAndNormalizeMetros, fetchAndNormalizeStores } from "./osm";
import { buildAndPersistLayers, loadNormalizedPoints } from "./overlay-cache";
import type { CacheMetadata } from "../lib/types";
import { cacheDir } from "../lib/paths";

function usedSampleFallback(
  points: Array<{ properties: { source?: string } }>,
): boolean {
  return points.some((point) => point.properties.source === "sample");
}

function minuteRange(): number[] {
  return Array.from(
    { length: DEFAULT_MINUTES_RANGE.max - DEFAULT_MINUTES_RANGE.min + 1 },
    (_, index) => DEFAULT_MINUTES_RANGE.min + index,
  );
}

export async function runRefreshPipeline(): Promise<CacheMetadata> {
  console.time("refresh:total");
  await ensureProjectDirs();
  const reuseRawCache = Bun.env.REFRESH_SKIP_FETCH === "1";
  console.time("refresh:osm");
  const [stores, metros] = await (
    reuseRawCache
      ? Promise.all([loadNormalizedPoints("store"), loadNormalizedPoints("metro")])
      : Promise.all([fetchAndNormalizeStores(), fetchAndNormalizeMetros()])
  );
  console.timeEnd("refresh:osm");
  console.time("refresh:layers");
  const [storeLayers, metroLayers] = await Promise.all([
    buildAndPersistLayers("store", stores, minuteRange()),
    buildAndPersistLayers("metro", metros, minuteRange()),
  ]);
  console.timeEnd("refresh:layers");
  const usedFallback = usedSampleFallback(stores) || usedSampleFallback(metros);

  const generatedAt = new Date().toISOString();
  const metadata: CacheMetadata = {
    generatedAt,
    source: usedFallback ? "refresh-fallback-sample" : "refresh",
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
  console.timeEnd("refresh:total");
  return metadata;
}
