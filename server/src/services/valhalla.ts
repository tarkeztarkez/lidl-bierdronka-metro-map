import { DEFAULT_VALHALLA_URL } from "../lib/constants";
import { makeApproxIsochrone } from "../lib/geo";
import type { IsochroneFeature, PoiFeature } from "../lib/types";

const PUBLIC_VALHALLA_URL = "https://valhalla1.openstreetmap.de";
const DEFAULT_CONTOUR_BATCH_SIZE = 4;

function valhallaBaseUrls(): string[] {
  const configured = Bun.env.VALHALLA_URLS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured?.length) {
    return configured;
  }

  if (Bun.env.VALHALLA_URL) {
    return [Bun.env.VALHALLA_URL, PUBLIC_VALHALLA_URL];
  }

  return [DEFAULT_VALHALLA_URL, PUBLIC_VALHALLA_URL];
}

function valhallaPoint(feature: PoiFeature): [number, number] {
  const [longitude, latitude] = feature.geometry.coordinates as [number, number];
  return [longitude, latitude];
}

function contourBatchSize(): number {
  const raw = Number(Bun.env.VALHALLA_CONTOUR_BATCH_SIZE ?? DEFAULT_CONTOUR_BATCH_SIZE);

  if (!Number.isFinite(raw) || raw < 1) {
    return DEFAULT_CONTOUR_BATCH_SIZE;
  }

  return Math.max(1, Math.floor(raw));
}

function chunkMinutes(minutesRange: number[]): number[][] {
  const chunks: number[][] = [];
  const batchSize = contourBatchSize();

  for (let index = 0; index < minutesRange.length; index += batchSize) {
    chunks.push(minutesRange.slice(index, index + batchSize));
  }

  return chunks;
}

async function requestIsochroneBatch(
  poi: PoiFeature,
  sortedMinutes: number[],
): Promise<IsochroneFeature[]> {
  const [longitude, latitude] = valhallaPoint(poi);

  try {
    let lastError: Error | null = null;

    for (const baseUrl of valhallaBaseUrls()) {
      try {
        const response = await fetch(`${baseUrl}/isochrone`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            locations: [{ lat: latitude, lon: longitude }],
            costing: "pedestrian",
            contours: sortedMinutes.map((minutes) => ({ time: minutes })),
            polygons: true,
          }),
        });

        if (!response.ok) {
          throw new Error(`Valhalla request failed: ${response.status} ${response.statusText}`);
        }

        const payload = (await response.json()) as { features?: IsochroneFeature[] };
        const features = payload.features ?? [];
        if (features.length !== sortedMinutes.length) {
          throw new Error("Valhalla returned no feature");
        }

        const category = poi.properties.category;

        return features.map((feature, index) => {
          feature.properties = {
            poiId: poi.properties.id,
            poiName: poi.properties.name,
            category,
            minutes: sortedMinutes[index] ?? sortedMinutes[0] ?? 1,
            source: "valhalla",
          } as IsochroneFeature["properties"];

          return feature;
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError ?? new Error("No Valhalla endpoint responded");
  } catch {
    return sortedMinutes.map((minutes) =>
      makeApproxIsochrone(longitude, latitude, minutes, {
        poiId: poi.properties.id,
        poiName: poi.properties.name,
        category: poi.properties.category,
        minutes,
        source: "fallback",
      }),
    );
  }
}

export async function requestIsochrone(poi: PoiFeature, minutes: number): Promise<IsochroneFeature> {
  const [feature] = await requestIsochrones(poi, [minutes]);
  if (!feature) {
    throw new Error(`No isochrone generated for ${poi.properties.id} at ${minutes} minutes`);
  }
  return feature;
}

export async function requestIsochrones(
  poi: PoiFeature,
  minutesRange: number[],
): Promise<IsochroneFeature[]> {
  const sortedMinutes = [...minutesRange].sort((left, right) => left - right);
  const batches = chunkMinutes(sortedMinutes);
  const features = await Promise.all(
    batches.map((minutes) => requestIsochroneBatch(poi, minutes)),
  );

  return features.flat().sort((left, right) => left.properties.minutes - right.properties.minutes);
}
