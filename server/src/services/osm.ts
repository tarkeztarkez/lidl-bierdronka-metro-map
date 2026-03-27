import type { FeatureCollection, Point } from "geojson";

import { DEFAULT_OVERPASS_URL, WARSAW_BBOX } from "../lib/constants";
import { ensureProjectDirs, rawDataDir } from "../lib/paths";
import { makePointFeature } from "../lib/geo";
import { mapLimit } from "../lib/parallel";
import { getRefreshConcurrency } from "../lib/refresh-config";
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

type PhotonFeature = {
  geometry?: {
    type?: string;
    coordinates?: [number, number];
  };
  properties?: {
    osm_id?: number | string;
    name?: string;
    city?: string;
    postcode?: string;
    street?: string;
  };
};

type PhotonResponse = {
  features?: PhotonFeature[];
};

type BoundingBox = {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
};

const FALLBACK_OVERPASS_URLS = [
  DEFAULT_OVERPASS_URL,
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

function overpassEndpoints(): string[] {
  const configured = Bun.env.OVERPASS_URLS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured?.length) {
    return configured;
  }

  if (Bun.env.OVERPASS_URL) {
    return [Bun.env.OVERPASS_URL];
  }

  return FALLBACK_OVERPASS_URLS;
}

function bboxClause(): string {
  const { minLon, minLat, maxLon, maxLat } = WARSAW_BBOX;
  return `(${minLat},${minLon},${maxLat},${maxLon})`;
}

function bboxClauseFor(box: BoundingBox): string {
  return `(${box.minLat},${box.minLon},${box.maxLat},${box.maxLon})`;
}

function splitBoundingBox(rows: number, columns: number): BoundingBox[] {
  const boxes: BoundingBox[] = [];
  const latStep = (WARSAW_BBOX.maxLat - WARSAW_BBOX.minLat) / rows;
  const lonStep = (WARSAW_BBOX.maxLon - WARSAW_BBOX.minLon) / columns;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      boxes.push({
        minLat: WARSAW_BBOX.minLat + latStep * row,
        maxLat: row === rows - 1 ? WARSAW_BBOX.maxLat : WARSAW_BBOX.minLat + latStep * (row + 1),
        minLon: WARSAW_BBOX.minLon + lonStep * column,
        maxLon: column === columns - 1 ? WARSAW_BBOX.maxLon : WARSAW_BBOX.minLon + lonStep * (column + 1),
      });
    }
  }

  return boxes;
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
  const errors: string[] = [];

  for (const endpoint of overpassEndpoints()) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "accept": "application/json",
        },
        body: new URLSearchParams({ data: query }).toString(),
      });

      if (!response.ok) {
        errors.push(`${endpoint}: ${response.status} ${response.statusText}`);
        continue;
      }

      return (await response.json()) as OverpassResponse;
    } catch (error) {
      errors.push(`${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Overpass query failed. Attempts: ${errors.join(" | ")}`);
}

async function queryOverpassMany(queries: string[], concurrency: number): Promise<OverpassElement[]> {
  const results = await mapLimit(
    queries,
    concurrency,
    async (query) => (await queryOverpass(query)).elements,
  );

  return results.flat();
}

async function persistRawFile(filename: string, collection: FeatureCollection<Point>): Promise<void> {
  await ensureProjectDirs();
  await Bun.write(`${rawDataDir}/${filename}`, JSON.stringify(collection, null, 2));
}

async function queryPhoton(term: string): Promise<PhotonFeature[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", term);
  url.searchParams.set("limit", "250");
  url.searchParams.set("bbox", `${WARSAW_BBOX.minLon},${WARSAW_BBOX.minLat},${WARSAW_BBOX.maxLon},${WARSAW_BBOX.maxLat}`);

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "lidl-bierdronka-metro-map/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Photon request failed for ${term}: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as PhotonResponse;
  return payload.features ?? [];
}

async function fetchStoresFromPhoton(): Promise<PoiFeature[]> {
  const brands = ["Biedronka", "Lidl"];
  const results = await Promise.all(brands.map((brand) => queryPhoton(brand)));

  return dedupePois(
    results.flatMap((features, brandIndex) =>
      features
        .filter((feature) => feature.geometry?.type === "Point" && feature.geometry.coordinates)
        .map((feature, index) => {
          const coordinates = feature.geometry?.coordinates;
          if (!coordinates) {
            return null;
          }

          return makePointFeature(coordinates[0], coordinates[1], {
            id: `photon-store-${feature.properties?.osm_id ?? `${brands[brandIndex]}-${index}`}`,
            name: feature.properties?.name ?? brands[brandIndex],
            category: "store",
            subtype: "supermarket",
            source: "overpass",
            brand: brands[brandIndex],
          }) as PoiFeature;
        })
        .filter((feature): feature is PoiFeature => Boolean(feature)),
    ),
  );
}

function dedupePois(points: PoiFeature[]): PoiFeature[] {
  const seen = new Set<string>();
  const deduped: PoiFeature[] = [];

  for (const point of points) {
    const [longitude, latitude] = point.geometry.coordinates as [number, number];
    const key = `${point.properties.name}|${longitude.toFixed(6)}|${latitude.toFixed(6)}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(point);
  }

  return deduped;
}

export async function fetchAndNormalizeStores(): Promise<PoiFeature[]> {
  try {
    const stores = await fetchStoresFromPhoton();

    const collection: FeatureCollection<Point> = {
      type: "FeatureCollection",
      features: stores,
    };
    await persistRawFile("stores.geojson", collection);
    return stores;
  } catch (error) {
    console.warn("Store refresh fell back to sample data:", error instanceof Error ? error.message : String(error));
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
  node["station"="subway"]${bboxClause()};
  node["railway"="station"]["station"="subway"]${bboxClause()};
  node["public_transport"="station"]["subway"="yes"]${bboxClause()};
  way["railway"="station"]["station"="subway"]${bboxClause()};
  way["public_transport"="station"]["subway"="yes"]${bboxClause()};
  relation["railway"="station"]["station"="subway"]${bboxClause()};
  relation["public_transport"="station"]["subway"="yes"]${bboxClause()};
);
out center tags;
`;
    const payload = await queryOverpass(query);
    const metros = dedupePois(payload.elements
      .map((element) => normalizePoi(element, "metro", element.tags?.station ?? element.tags?.railway ?? "metro"))
      .filter((feature): feature is PoiFeature => Boolean(feature)));

    const collection: FeatureCollection<Point> = {
      type: "FeatureCollection",
      features: metros,
    };
    await persistRawFile("metro.geojson", collection);
    return metros;
  } catch (error) {
    console.warn("Metro refresh fell back to sample data:", error instanceof Error ? error.message : String(error));
    const fallback = sampleMetros();
    await persistRawFile("metro.geojson", {
      type: "FeatureCollection",
      features: fallback,
    });
    return fallback;
  }
}
