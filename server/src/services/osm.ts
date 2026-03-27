import { rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";

import { centroid } from "@turf/turf";
import type { Feature, FeatureCollection, Geometry, Point } from "geojson";

import { WARSAW_BBOX } from "../lib/constants";
import { makePointFeature } from "../lib/geo";
import { ensureProjectDirs, rawDataDir } from "../lib/paths";
import type { PoiFeature, PoiProperties } from "../lib/types";
import { sampleMetros, sampleMilkbars, sampleStores } from "./sample-data";

type OSMFeature = Feature<Geometry, Record<string, unknown>>;

type OsmDataset = {
  stores: PoiFeature[];
  metros: PoiFeature[];
  milkbars: PoiFeature[];
};

const EXTRACT_URL = Bun.env.OSM_EXTRACT_URL ?? "https://download.bbbike.org/osm/bbbike/Warsaw/Warsaw.osm.geojson.xz";
const EXTRACT_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const EXTRACT_FILE = join(rawDataDir, "Warsaw.osm.geojson.xz");
const EXTRACT_DOWNLOAD_FILE = `${EXTRACT_FILE}.download`;
const DUPLICATE_DISTANCE_METERS = 35;
const TARGET_BRANDS = ["Biedronka", "Lidl"] as const;

let datasetPromise: Promise<OsmDataset> | null = null;

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function featureProperties(feature: OSMFeature): Record<string, unknown> {
  return feature.properties ?? {};
}

function propertyText(properties: Record<string, unknown>, keys: string[]): string {
  return keys
    .map((key) => asString(properties[key]) ?? "")
    .join(" ");
}

function pickName(properties: Record<string, unknown>, fallback: string): string {
  return asString(properties.name)
    ?? asString(properties.brand)
    ?? asString(properties.operator)
    ?? fallback;
}

function toCoordinate(feature: OSMFeature): [number, number] | null {
  if (feature.geometry.type === "Point") {
    return feature.geometry.coordinates as [number, number];
  }

  try {
    return centroid(feature).geometry.coordinates as [number, number];
  } catch {
    return null;
  }
}

function normalizePoi(
  category: "store" | "metro" | "milkbar",
  coordinate: [number, number],
  properties: Record<string, unknown>,
  index: number,
): PoiFeature {
  const subtype = category === "store"
    ? asString(properties.shop) ?? "store"
    : category === "metro"
      ? asString(properties.station) ?? asString(properties.railway) ?? "metro"
      : asString(properties.amenity) ?? "milkbar";
  const normalized: PoiProperties = {
    id: `${category}-${index}`,
    name: pickName(properties, `${category}-${index}`),
    category,
    subtype,
    source: "osm",
    brand: asString(properties.brand),
    operator: asString(properties.operator),
  };

  return makePointFeature(coordinate[0], coordinate[1], normalized) as PoiFeature;
}

function isStore(properties: Record<string, unknown>): boolean {
  const auxiliaryAmenity = new Set([
    "parking",
    "parking_space",
    "bicycle_parking",
    "charging_station",
    "vending_machine",
    "waste_basket",
    "bicycle_repair_station",
    "trolley_bay",
    "recycling",
    "fast_food",
  ]);
  const amenity = asString(properties.amenity);

  if (amenity && auxiliaryAmenity.has(amenity)) {
    return false;
  }

  const haystack = propertyText(properties, ["brand", "name", "operator", "brand:wikidata", "brand:wikipedia"]);
  return TARGET_BRANDS.some((brand) => new RegExp(brand, "i").test(haystack));
}

function isMetro(properties: Record<string, unknown>): boolean {
  return asString(properties.station) === "subway"
    && asString(properties.railway) === "station"
    && asString(properties.name) !== undefined;
}

function isMilkbar(properties: Record<string, unknown>): boolean {
  const haystack = propertyText(properties, [
    "name",
    "official_name",
    "alt_name",
    "old_name",
    "short_name",
    "brand",
    "description",
    "operator",
  ]);

  return /bar mleczny/i.test(haystack);
}

function isWithinWarsawBbox([longitude, latitude]: [number, number]): boolean {
  return longitude >= WARSAW_BBOX.minLon
    && longitude <= WARSAW_BBOX.maxLon
    && latitude >= WARSAW_BBOX.minLat
    && latitude <= WARSAW_BBOX.maxLat;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMeters(left: [number, number], right: [number, number]): number {
  const earthRadius = 6_371_000;
  const [leftLon, leftLat] = left;
  const [rightLon, rightLat] = right;
  const latitudeDelta = toRadians(rightLat - leftLat);
  const longitudeDelta = toRadians(rightLon - leftLon);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(leftLat)) * Math.cos(toRadians(rightLat)) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

function normalizeDuplicateKey(point: PoiFeature): string {
  const name = (point.properties.brand ?? point.properties.operator ?? point.properties.name)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  return `${point.properties.category}:${name}`;
}

function dedupePois(points: PoiFeature[]): PoiFeature[] {
  const deduped: PoiFeature[] = [];

  for (const point of points) {
    const coordinate = point.geometry.coordinates as [number, number];
    const duplicateKey = normalizeDuplicateKey(point);
    const duplicate = deduped.find((candidate) => {
      if (normalizeDuplicateKey(candidate) !== duplicateKey) {
        return false;
      }

      return distanceMeters(candidate.geometry.coordinates as [number, number], coordinate) <= DUPLICATE_DISTANCE_METERS;
    });

    if (!duplicate) {
      deduped.push(point);
    }
  }

  return deduped;
}

function parseFeatureLine(line: string): OSMFeature | null {
  const trimmed = line.trim();

  if (!trimmed || trimmed === '{"type":"FeatureCollection","features":[' || trimmed === "]}") {
    return null;
  }

  const withoutComma = trimmed.endsWith(",") ? trimmed.slice(0, -1) : trimmed;
  return JSON.parse(withoutComma) as OSMFeature;
}

async function runCommand(command: string[]): Promise<void> {
  const process = Bun.spawn({
    cmd: command,
    stdout: "ignore",
    stderr: "pipe",
  });
  const exitCode = await process.exited;

  if (exitCode === 0) {
    return;
  }

  const errorText = process.stderr ? await new Response(process.stderr).text() : "";
  throw new Error(errorText.trim() || `${command[0]} exited with code ${exitCode}`);
}

async function ensureExtractFile(): Promise<string> {
  await ensureProjectDirs();

  try {
    const current = await stat(EXTRACT_FILE);
    if (Date.now() - current.mtimeMs < EXTRACT_CACHE_TTL_MS) {
      return EXTRACT_FILE;
    }
  } catch {
    // The file does not exist yet.
  }

  await rm(EXTRACT_DOWNLOAD_FILE, { force: true });
  await runCommand(["curl", "-L", "--fail", "--silent", "--show-error", "-o", EXTRACT_DOWNLOAD_FILE, EXTRACT_URL]);
  await rename(EXTRACT_DOWNLOAD_FILE, EXTRACT_FILE);
  return EXTRACT_FILE;
}

async function loadDataset(): Promise<OsmDataset> {
  if (!datasetPromise) {
    datasetPromise = (async () => {
      const extractFile = await ensureExtractFile();
      const process = Bun.spawn({
        cmd: ["xz", "-dc", extractFile],
        stdout: "pipe",
        stderr: "pipe",
      });
      const input = Readable.fromWeb(process.stdout);
      const reader = createInterface({
        input,
        crlfDelay: Infinity,
      });
      const stores: PoiFeature[] = [];
      const metros: PoiFeature[] = [];
      const milkbars: PoiFeature[] = [];
      let storeIndex = 0;
      let metroIndex = 0;
      let milkbarIndex = 0;

      for await (const line of reader) {
        const feature = parseFeatureLine(line);
        if (!feature) {
          continue;
        }

        const properties = featureProperties(feature);
        const matchesStore = isStore(properties);
        const matchesMetro = isMetro(properties);
        const matchesMilkbar = isMilkbar(properties);

        if (!matchesStore && !matchesMetro && !matchesMilkbar) {
          continue;
        }

        const coordinate = toCoordinate(feature);
        if (!coordinate || !isWithinWarsawBbox(coordinate)) {
          continue;
        }

        if (matchesStore) {
          if (feature.geometry.type !== "Point") {
            continue;
          }

          storeIndex += 1;
          const poi = normalizePoi("store", coordinate, properties, storeIndex);
          stores.push(poi);
        }

        if (matchesMetro) {
          metroIndex += 1;
          metros.push(normalizePoi("metro", coordinate, properties, metroIndex));
        }

        if (matchesMilkbar) {
          milkbarIndex += 1;
          milkbars.push(normalizePoi("milkbar", coordinate, properties, milkbarIndex));
        }
      }

      const exitCode = await process.exited;
      if (exitCode !== 0) {
        const errorText = process.stderr ? await new Response(process.stderr).text() : "";
        throw new Error(errorText.trim() || `xz exited with code ${exitCode}`);
      }

      return {
        stores: dedupePois(stores),
        metros: dedupePois(metros),
        milkbars: dedupePois(milkbars),
      };
    })().catch((error) => {
      datasetPromise = null;
      throw error;
    });
  }

  return datasetPromise;
}

async function persistRawFile(filename: string, collection: FeatureCollection<Point>): Promise<void> {
  await ensureProjectDirs();
  await Bun.write(`${rawDataDir}/${filename}`, JSON.stringify(collection, null, 2));
}

export async function fetchAndNormalizeStores(): Promise<PoiFeature[]> {
  try {
    const dataset = await loadDataset();
    await persistRawFile("stores.geojson", {
      type: "FeatureCollection",
      features: dataset.stores,
    });
    return dataset.stores;
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
    const dataset = await loadDataset();
    await persistRawFile("metro.geojson", {
      type: "FeatureCollection",
      features: dataset.metros,
    });
    return dataset.metros;
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

export async function fetchAndNormalizeMilkbars(): Promise<PoiFeature[]> {
  try {
    const dataset = await loadDataset();
    await persistRawFile("milkbar.geojson", {
      type: "FeatureCollection",
      features: dataset.milkbars,
    });
    return dataset.milkbars;
  } catch (error) {
    console.warn("Milkbar refresh fell back to sample data:", error instanceof Error ? error.message : String(error));
    const fallback = sampleMilkbars();
    await persistRawFile("milkbar.geojson", {
      type: "FeatureCollection",
      features: fallback,
    });
    return fallback;
  }
}
