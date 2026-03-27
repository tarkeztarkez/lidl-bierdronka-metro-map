import { Hono } from "hono";

import { loadNormalizedPoints, readRuntimeMetadata } from "../services/overlay-cache";

export const metadataRoute = new Hono().get("/", async (c) => {
  const [runtime, storePoints, metroPoints] = await Promise.all([
    readRuntimeMetadata(),
    loadNormalizedPoints("store"),
    loadNormalizedPoints("metro"),
  ]);

  return c.json({
    metadata: {
      refreshedAt: runtime.lastRefreshAt ?? runtime.generatedAt,
      storeCount: runtime.counts.stores,
      metroCount: runtime.counts.metros,
      storeMinutesRange: [runtime.supportedMinutes.min, runtime.supportedMinutes.max],
      metroMinutesRange: [runtime.supportedMinutes.min, runtime.supportedMinutes.max],
      bounds: [runtime.bbox.minLon, runtime.bbox.minLat, runtime.bbox.maxLon, runtime.bbox.maxLat],
      source: runtime.source,
      note: runtime.cacheReady ? "Cached overlay data ready." : "Using bundled Warsaw sample data until refresh runs.",
      storePoints: storePoints.map((feature) => ({
        id: feature.properties.id,
        name: feature.properties.name,
        kind: "store" as const,
        position: feature.geometry.coordinates,
      })),
      metroPoints: metroPoints.map((feature) => ({
        id: feature.properties.id,
        name: feature.properties.name,
        kind: "metro" as const,
        position: feature.geometry.coordinates,
      })),
    },
    message: runtime.cacheReady ? undefined : "Refresh data to replace the bundled sample geometry.",
    demo: !runtime.cacheReady,
  });
});
