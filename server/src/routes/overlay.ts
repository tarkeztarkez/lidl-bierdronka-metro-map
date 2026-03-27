import { Hono } from "hono";
import { z } from "zod";

import { DEFAULT_MINUTES_RANGE } from "../lib/constants";
import { getOverlayGeometry, loadNormalizedPoints } from "../services/overlay-cache";

const querySchema = z.object({
  storeMinutes: z.coerce.number().int().min(DEFAULT_MINUTES_RANGE.min).max(DEFAULT_MINUTES_RANGE.max).default(10),
  metroMinutes: z.coerce.number().int().min(DEFAULT_MINUTES_RANGE.min).max(DEFAULT_MINUTES_RANGE.max).default(8),
  milkbarMinutes: z.coerce.number().int().min(DEFAULT_MINUTES_RANGE.min).max(DEFAULT_MINUTES_RANGE.max).default(10),
  showMilkbars: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
});

export const overlayRoute = new Hono().get("/", async (c) => {
  const parsed = querySchema.safeParse({
    storeMinutes: c.req.query("storeMinutes"),
    metroMinutes: c.req.query("metroMinutes"),
    milkbarMinutes: c.req.query("milkbarMinutes"),
    showMilkbars: c.req.query("showMilkbars"),
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

  const { storeMinutes, metroMinutes, milkbarMinutes, showMilkbars } = parsed.data;
  const [overlay, storePoints, metroPoints, milkbarPoints] = await Promise.all([
    getOverlayGeometry(storeMinutes, metroMinutes, milkbarMinutes, showMilkbars),
    loadNormalizedPoints("store"),
    loadNormalizedPoints("metro"),
    loadNormalizedPoints("milkbar"),
  ]);
  const usingFallback = overlay.metadata.source !== "refresh";

  return c.json({
    featureCollection: {
      type: "FeatureCollection",
      features: [
        overlay.storeLayer
          ? {
              ...overlay.storeLayer,
              properties: {
                ...(overlay.storeLayer.properties ?? {}),
                kind: "store",
                label: "Store reach",
              },
            }
          : null,
        overlay.metroLayer
          ? {
              ...overlay.metroLayer,
              properties: {
                ...(overlay.metroLayer.properties ?? {}),
                kind: "metro",
                label: "Metro reach",
              },
            }
          : null,
        overlay.intersection
          ? {
              ...overlay.intersection,
              properties: {
                ...(overlay.intersection.properties ?? {}),
                kind: "intersection",
                label: "Overlap",
              },
            }
          : null,
        showMilkbars && overlay.milkbarLayer
          ? {
              ...overlay.milkbarLayer,
              properties: {
                ...(overlay.milkbarLayer.properties ?? {}),
                kind: "milkbar",
                label: "Milkbar reach",
              },
            }
          : null,
      ].filter(Boolean),
    },
    metadata: {
      refreshedAt: overlay.metadata.generatedAt,
      storeCount: overlay.metadata.counts.stores,
      metroCount: overlay.metadata.counts.metros,
      milkbarCount: overlay.metadata.counts.milkbars,
      storeMinutesRange: [overlay.metadata.supportedMinutes.min, overlay.metadata.supportedMinutes.max],
      metroMinutesRange: [overlay.metadata.supportedMinutes.min, overlay.metadata.supportedMinutes.max],
      milkbarMinutesRange: [overlay.metadata.supportedMinutes.min, overlay.metadata.supportedMinutes.max],
      bounds: [
        overlay.metadata.bbox.minLon,
        overlay.metadata.bbox.minLat,
        overlay.metadata.bbox.maxLon,
        overlay.metadata.bbox.maxLat,
      ],
      source: overlay.metadata.source,
      note: usingFallback
        ? "Overlay is currently based on bundled sample POIs, not live Warsaw OSM data."
        : overlay.intersection
          ? undefined
          : showMilkbars
            ? "No triple overlap for the selected minute pair."
            : "No overlap for the selected minute pair.",
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
    demo: usingFallback,
    message: usingFallback
      ? "Live OSM refresh fell back to bundled sample data."
      : overlay.intersection
        ? undefined
        : showMilkbars
          ? "No triple overlap for the selected minute pair."
          : "No overlap for the selected minute pair.",
  });
});
