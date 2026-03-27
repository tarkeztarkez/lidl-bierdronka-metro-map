import { Hono } from "hono";

import { loadNormalizedPoints, readRuntimeMetadata } from "../services/overlay-cache";

export const metadataRoute = new Hono().get("/", async (c) => {
  const [runtime, storePoints, metroPoints] = await Promise.all([
    readRuntimeMetadata(),
    loadNormalizedPoints("store"),
    loadNormalizedPoints("metro"),
  ]);
  const usingFallback = runtime.source !== "refresh";

  return c.json({
    metadata: {
      refreshedAt: runtime.lastRefreshAt ?? runtime.generatedAt,
      storeCount: runtime.counts.stores,
      metroCount: runtime.counts.metros,
      storeMinutesRange: [runtime.supportedMinutes.min, runtime.supportedMinutes.max],
      metroMinutesRange: [runtime.supportedMinutes.min, runtime.supportedMinutes.max],
      bounds: [runtime.bbox.minLon, runtime.bbox.minLat, runtime.bbox.maxLon, runtime.bbox.maxLat],
      source: runtime.source,
      note: usingFallback
        ? "Using bundled sample POIs because live OSM refresh did not complete successfully."
        : "Cached overlay data ready.",
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
    message: usingFallback ? "Live OSM data is not loaded yet. Current counts come from bundled sample data." : undefined,
    demo: usingFallback,
  });
});
