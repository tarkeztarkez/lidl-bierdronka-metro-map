import { Hono } from "hono";
import { z } from "zod";

import { DEFAULT_MINUTES_RANGE } from "../lib/constants";
import { getOverlayGeometry, loadNormalizedPoints } from "../services/overlay-cache";

const querySchema = z.object({
  storeMinutes: z.coerce.number().int().min(DEFAULT_MINUTES_RANGE.min).max(DEFAULT_MINUTES_RANGE.max).default(10),
  metroMinutes: z.coerce.number().int().min(DEFAULT_MINUTES_RANGE.min).max(DEFAULT_MINUTES_RANGE.max).default(8),
});

export const overlayRoute = new Hono().get("/", async (c) => {
  const parsed = querySchema.safeParse({
    storeMinutes: c.req.query("storeMinutes"),
    metroMinutes: c.req.query("metroMinutes"),
  });

  if (!parsed.success) {
    return c.json(
      {
        error: "Invalid query parameters",
        issues: parsed.error.issues,
      },
      400,
    );
  }

  const { storeMinutes, metroMinutes } = parsed.data;
  const [overlay, storePoints, metroPoints] = await Promise.all([
    getOverlayGeometry(storeMinutes, metroMinutes),
    loadNormalizedPoints("store"),
    loadNormalizedPoints("metro"),
  ]);

  return c.json({
    featureCollection: {
      type: "FeatureCollection",
      features: overlay.intersection ? [overlay.intersection] : [],
    },
    metadata: {
      refreshedAt: overlay.metadata.generatedAt,
      storeCount: overlay.metadata.counts.stores,
      metroCount: overlay.metadata.counts.metros,
      storeMinutesRange: [overlay.metadata.supportedMinutes.min, overlay.metadata.supportedMinutes.max],
      metroMinutesRange: [overlay.metadata.supportedMinutes.min, overlay.metadata.supportedMinutes.max],
      bounds: [
        overlay.metadata.bbox.minLon,
        overlay.metadata.bbox.minLat,
        overlay.metadata.bbox.maxLon,
        overlay.metadata.bbox.maxLat,
      ],
      source: overlay.metadata.source,
      note: overlay.intersection ? undefined : "No overlap for the selected minute pair.",
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
    demo: overlay.metadata.source !== "refresh",
    message: overlay.intersection ? undefined : "No overlap for the selected minute pair.",
  });
});
