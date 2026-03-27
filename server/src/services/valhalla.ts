import { DEFAULT_VALHALLA_URL } from "../lib/constants";
import { makeApproxIsochrone } from "../lib/geo";
import type { IsochroneFeature, PoiFeature } from "../lib/types";

function valhallaBaseUrl(): string {
  return Bun.env.VALHALLA_URL ?? DEFAULT_VALHALLA_URL;
}

function valhallaPoint(feature: PoiFeature): [number, number] {
  const [longitude, latitude] = feature.geometry.coordinates as [number, number];
  return [longitude, latitude];
}

export async function requestIsochrone(poi: PoiFeature, minutes: number): Promise<IsochroneFeature> {
  const [longitude, latitude] = valhallaPoint(poi);

  try {
    const response = await fetch(`${valhallaBaseUrl()}/isochrone`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        locations: [{ lat: latitude, lon: longitude }],
        costing: "pedestrian",
        contours: [{ time: minutes }],
        polygons: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Valhalla request failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as { features?: IsochroneFeature[] };
    const feature = payload.features?.[0];
    if (!feature) {
      throw new Error("Valhalla returned no feature");
    }

    const category = poi.properties.category === "metro" ? "metro" : "store";

    feature.properties = {
      poiId: poi.properties.id,
      poiName: poi.properties.name,
      category,
      minutes,
      source: "valhalla",
    } as IsochroneFeature["properties"];

    return feature;
  } catch {
    return makeApproxIsochrone(longitude, latitude, minutes, {
      poiId: poi.properties.id,
      poiName: poi.properties.name,
      category: poi.properties.category,
      minutes,
      source: "fallback",
    });
  }
}
