import type { FeatureCollection, Point } from "geojson";

import { DEFAULT_OVERPASS_URL, WARSAW_BBOX } from "../lib/constants";
import { ensureProjectDirs, rawDataDir } from "../lib/paths";
import { makePointFeature } from "../lib/geo";
import type { PoiFeature, PoiProperties } from "../lib/types";
import { sampleMetros, sampleStores } from "./sample-data";

type OverpassElement =
  | {
      type: "node" | "way" | "relation";
      id: number;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    };

type OverpassResponse = {
  elements: OverpassElement[];
};

function overpassEndpoint(): string {
  return Bun.env.OVERPASS_URL ?? DEFAULT_OVERPASS_URL;
}

function baseQuery(): string {
  const { minLon, minLat, maxLon, maxLat } = WARSAW_BBOX;
  return `${minLat},${minLon},${maxLat},${maxLon}`;
}

function extractCoordinate(element: OverpassElement): [number, number] | null {
  if (typeof element.lon === "number" && typeof element.lat === "number") {
    return [element.lon, element.lat];
  }

  if (element.center && typeof element.center.lon === "number" && typeof element.center.lat === "number") {
    return [element.center.lon, element.center.lat];
  }

  return null;
}

function normalizePoi(
  element: OverpassElement,
  category: "store" | "metro",
  subtype: string,
): PoiFeature | null {
  const coordinate = extractCoordinate(element);
  if (!coordinate) {
    return null;
  }

  const tags = element.tags ?? {};
  const name = tags.name ?? tags.brand ?? tags.operator ?? `${category}-${element.id}`;
  const properties: PoiProperties = {
    id: `${category}-${element.id}`,
    name,
    category,
    subtype,
    source: "overpass",
    brand: tags.brand,
    operator: tags.operator,
  };

  return makePointFeature(coordinate[0], coordinate[1], properties) as PoiFeature;
}

async function queryOverpass(query: string): Promise<OverpassResponse> {
  const response = await fetch(overpassEndpoint(), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "accept": "application/json",
    },
    body: new URLSearchParams({ data: query }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as OverpassResponse;
}

async function persistRawFile(filename: string, collection: FeatureCollection<Point>): Promise<void> {
  await ensureProjectDirs();
  await Bun.write(`${rawDataDir}/${filename}`, JSON.stringify(collection, null, 2));
}

export async function fetchAndNormalizeStores(): Promise<PoiFeature[]> {
  try {
    const query = `
[out:json][timeout:180];
(
  node["shop"~"supermarket|convenience|grocery"](52.05,20.8,52.4,21.32);
  way["shop"~"supermarket|convenience|grocery"](52.05,20.8,52.4,21.32);
  relation["shop"~"supermarket|convenience|grocery"](52.05,20.8,52.4,21.32);
  node["brand"~"Lidl|Biedronka",i](52.05,20.8,52.4,21.32);
  way["brand"~"Lidl|Biedronka",i](52.05,20.8,52.4,21.32);
  relation["brand"~"Lidl|Biedronka",i](52.05,20.8,52.4,21.32);
);
out center tags;
`;
    const payload = await queryOverpass(query);
    const stores = payload.elements
      .map((element) => normalizePoi(element, "store", element.tags?.shop ?? "supermarket"))
      .filter((feature): feature is PoiFeature => Boolean(feature))
      .filter((feature) => /lidl|biedronka/i.test(`${feature.properties.brand ?? ""} ${feature.properties.name}`));

    const collection: FeatureCollection<Point> = {
      type: "FeatureCollection",
      features: stores,
    };
    await persistRawFile("stores.geojson", collection);
    return stores;
  } catch {
    const fallback = sampleStores();
    await persistRawFile("stores.geojson", {
      type: "FeatureCollection",
      features: fallback,
    });
    return fallback;
  }
}

export async function fetchAndNormalizeMetros(): Promise<PoiFeature[]> {
  try {
    const query = `
[out:json][timeout:180];
(
  node["railway"="subway_entrance"](52.05,20.8,52.4,21.32);
  node["station"="subway"](52.05,20.8,52.4,21.32);
  way["railway"="station"]["station"="subway"](52.05,20.8,52.4,21.32);
  relation["railway"="station"]["station"="subway"](52.05,20.8,52.4,21.32);
);
out center tags;
`;
    const payload = await queryOverpass(query);
    const metros = payload.elements
      .map((element) => normalizePoi(element, "metro", element.tags?.station ?? element.tags?.railway ?? "metro"))
      .filter((feature): feature is PoiFeature => Boolean(feature));

    const collection: FeatureCollection<Point> = {
      type: "FeatureCollection",
      features: metros,
    };
    await persistRawFile("metro.geojson", collection);
    return metros;
  } catch {
    const fallback = sampleMetros();
    await persistRawFile("metro.geojson", {
      type: "FeatureCollection",
      features: fallback,
    });
    return fallback;
  }
}
