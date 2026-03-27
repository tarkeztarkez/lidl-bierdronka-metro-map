import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

import { cacheDir, ensureProjectDirs, rawDataDir } from "../lib/paths";
import { intersectPolygons, makeFallbackLayer } from "../lib/geo";
import type { CacheMetadata, IsochroneFeature, LayerMetadata, MetadataResponse, PoiCategory, PoiFeature } from "../lib/types";
import { mapLimit } from "../lib/parallel";
import { getRefreshConcurrency } from "../lib/refresh-config";
import { sampleMetros, sampleStores } from "./sample-data";
import { requestIsochrones } from "./valhalla";
import { runUnionWorkerPool } from "./union-worker-pool";

const metadataPath = join(cacheDir, "metadata.json");

function layerPath(category: PoiCategory, minutes: number): string {
  return join(cacheDir, `${category}-${String(minutes).padStart(2, "0")}.geojson`);
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

function minuteRange(): number[] {
  return Array.from({ length: 30 }, (_, index) => index + 1);
}

function usedSampleFallback(
  points: Array<{ properties: { source?: string } }>,
): boolean {
  return points.some((point) => point.properties.source === "sample");
}

export async function loadNormalizedPoints(category: PoiCategory): Promise<PoiFeature[]> {
  const fileName = category === "store" ? "stores.geojson" : "metro.geojson";
  const filePath = join(rawDataDir, fileName);
  const parsed = await readJsonIfExists<FeatureCollection>(filePath);

  if (parsed?.features?.length) {
    return parsed.features as PoiFeature[];
  }

  return category === "store" ? sampleStores() : sampleMetros();
}

export async function loadMetadata(): Promise<CacheMetadata | null> {
  return readJsonIfExists<CacheMetadata>(metadataPath);
}

export async function loadLayer(category: PoiCategory, minutes: number): Promise<Feature<Polygon | MultiPolygon> | null> {
  const parsed = await readJsonIfExists<Feature<Polygon | MultiPolygon>>(layerPath(category, minutes));
  if (parsed?.type === "Feature" && parsed.geometry) {
    return parsed;
  }
  return null;
}

export async function buildAndPersistLayers(
  category: PoiCategory,
  points: PoiFeature[],
  minutesRange: number[],
): Promise<LayerMetadata> {
  await ensureProjectDirs();

  if (points.length === 0) {
    return {
      category,
      poiCount: 0,
      minuteRange: {
        min: minutesRange[0] ?? 1,
        max: minutesRange[minutesRange.length - 1] ?? 30,
      },
      minutesAvailable: [],
      updatedAt: new Date().toISOString(),
      source: "empty",
    };
  }

  const sortedMinutes = [...minutesRange].sort((left, right) => left - right);
  const refreshConcurrency = getRefreshConcurrency();
  const perPointIsochrones = await mapLimit(
    points,
    refreshConcurrency,
    (point) => requestIsochrones(point, sortedMinutes),
  );
  const pointCenters = points.map((point) => point.geometry.coordinates as [number, number]);
  const layerTasks = sortedMinutes.map((minutes, minuteIndex) => ({
    category,
    minutes,
    centers: pointCenters,
    isochrones: perPointIsochrones
      .map((isochrones) => isochrones[minuteIndex])
      .filter((feature): feature is IsochroneFeature => Boolean(feature)) as Array<
        Feature<Polygon | MultiPolygon>
      >,
  }));
  const mergedLayers = await runUnionWorkerPool(layerTasks);

  const minuteOutputs: number[] = [];
  const layers = await mapLimit(
    sortedMinutes,
    refreshConcurrency,
    async (minutes, minuteIndex) => {
      const layer = mergedLayers[minuteIndex] ?? makeFallbackLayer(
        pointCenters,
        minutes,
        (index) => ({
          poiId: points[index]?.properties.id,
          poiName: points[index]?.properties.name,
          category,
          minutes,
          source: "fallback",
        }),
      );

      if (!layer) {
        return null;
      }

      await writeJson(layerPath(category, minutes), {
        ...layer,
        properties: {
          category,
          minutes,
          poiCount: points.length,
        },
      });

      return minutes;
    },
  );

  for (const minutes of layers) {
    if (typeof minutes === "number") {
      minuteOutputs.push(minutes);
    }
  }

  return {
    category,
    poiCount: points.length,
    minuteRange: {
      min: minutesRange[0] ?? 1,
      max: minutesRange[minutesRange.length - 1] ?? 30,
    },
    minutesAvailable: minuteOutputs,
    updatedAt: new Date().toISOString(),
    source: "valhalla-or-fallback",
  };
}

export async function refreshCache(): Promise<CacheMetadata> {
  await ensureProjectDirs();
  const [stores, metros] = await Promise.all([loadNormalizedPoints("store"), loadNormalizedPoints("metro")]);

  const storeLayers = await buildAndPersistLayers("store", stores, minuteRange());
  const metroLayers = await buildAndPersistLayers("metro", metros, minuteRange());

  const generatedAt = new Date().toISOString();
  const metadata: CacheMetadata = {
    generatedAt,
    source: usedSampleFallback(stores) || usedSampleFallback(metros)
      ? "refresh-fallback-sample"
      : "refresh",
    supportedMinutes: {
      min: 1,
      max: 30,
    },
    counts: {
      stores: stores.length,
      metros: metros.length,
    },
    layers: {
      store: { ...storeLayers, updatedAt: generatedAt },
      metro: { ...metroLayers, updatedAt: generatedAt },
    },
    bbox: {
      minLon: 20.8,
      minLat: 52.05,
      maxLon: 21.32,
      maxLat: 52.4,
    },
  };

  await writeJson(metadataPath, metadata);
  return metadata;
}

export async function ensureCacheReady(): Promise<CacheMetadata> {
  const metadata = await loadMetadata();
  if (metadata) {
    return metadata;
  }

  return refreshCache();
}

export async function getOverlayGeometry(storeMinutes: number, metroMinutes: number) {
  const metadata = await ensureCacheReady();
  const [storeLayer, metroLayer] = await Promise.all([
    loadLayer("store", storeMinutes),
    loadLayer("metro", metroMinutes),
  ]);

  const storeSamples = sampleStores();
  const metroSamples = sampleMetros();

  const fallbackStores = makeFallbackLayer(
    storeSamples.map((feature) => feature.geometry.coordinates as [number, number]),
    storeMinutes,
    (index) => ({
      poiId: storeSamples[index]?.properties.id,
      poiName: storeSamples[index]?.properties.name,
      category: "store",
      minutes: storeMinutes,
      source: "fallback",
    }),
  );
  const fallbackMetros = makeFallbackLayer(
    metroSamples.map((feature) => feature.geometry.coordinates as [number, number]),
    metroMinutes,
    (index) => ({
      poiId: metroSamples[index]?.properties.id,
      poiName: metroSamples[index]?.properties.name,
      category: "metro",
      minutes: metroMinutes,
      source: "fallback",
    }),
  );

  const left = storeLayer ?? fallbackStores;
  const right = metroLayer ?? fallbackMetros;
  const intersection = intersectPolygons(left, right);

  return {
    metadata,
    intersection,
    storeLayer: left,
    metroLayer: right,
  };
}

export async function readRuntimeMetadata(): Promise<MetadataResponse> {
  const metadata = await loadMetadata();

  if (!metadata) {
    const storeSamples = sampleStores();
    const metroSamples = sampleMetros();

    return {
      generatedAt: new Date().toISOString(),
      cacheReady: false,
      source: "fallback-sample",
      supportedMinutes: {
        min: 1,
        max: 30,
      },
      counts: {
        stores: storeSamples.length,
        metros: metroSamples.length,
      },
      bbox: {
        minLon: 20.8,
        minLat: 52.05,
        maxLon: 21.32,
        maxLat: 52.4,
      },
      storeMinutes: [],
      metroMinutes: [],
      lastRefreshAt: null,
    };
  }

  return {
    generatedAt: metadata.generatedAt,
    cacheReady: true,
    source: metadata.source,
    supportedMinutes: metadata.supportedMinutes,
    counts: metadata.counts,
    bbox: metadata.bbox,
    storeMinutes: metadata.layers.store.minutesAvailable,
    metroMinutes: metadata.layers.metro.minutesAvailable,
    lastRefreshAt: metadata.generatedAt,
  };
}
