import { Hono } from "hono";

import { loadNormalizedPoints, readRuntimeMetadata } from "../services/overlay-cache";

export const metadataRoute = new Hono().get("/", async (c) => {
  const [runtime, storePoints, metroPoints, milkbarPoints] = await Promise.all([
    readRuntimeMetadata(),
    loadNormalizedPoints("store"),
    loadNormalizedPoints("metro"),
    loadNormalizedPoints("milkbar"),
  ]);
  const usingFallback = runtime.source !== "refresh";

  return c.json({
    metadata: {
      refreshedAt: runtime.lastRefreshAt ?? runtime.generatedAt,
      storeCount: runtime.counts.stores,
      metroCount: runtime.counts.metros,
      milkbarCount: runtime.counts.milkbars,
      storeMinutesRange: [runtime.supportedMinutes.min, runtime.supportedMinutes.max],
      metroMinutesRange: [runtime.supportedMinutes.min, runtime.supportedMinutes.max],
      milkbarMinutesRange: [runtime.supportedMinutes.min, runtime.supportedMinutes.max],
      bounds: [runtime.bbox.minLon, runtime.bbox.minLat, runtime.bbox.maxLon, runtime.bbox.maxLat],
      source: runtime.source,
      note: usingFallback
        ? "Using bundled sample POIs because live OSM refresh did not complete successfully."
        : "Cached overlay data ready.",
      layers: runtime.layers,
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
      milkbarPoints: milkbarPoints.map((feature) => ({
        id: feature.properties.id,
        name: feature.properties.name,
        kind: "milkbar" as const,
        position: feature.geometry.coordinates,
      })),
    },
    message: usingFallback ? "Live OSM data is not loaded yet. Current counts come from bundled sample data." : undefined,
    demo: usingFallback,
  });
});
