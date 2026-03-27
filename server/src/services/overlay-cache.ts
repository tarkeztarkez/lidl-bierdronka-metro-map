import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

import { cacheDir, ensureProjectDirs, rawDataDir } from "../lib/paths";
import { clipToWarsawBounds, intersectPolygons, makeFallbackLayer } from "../lib/geo";
import type { CacheMetadata, IsochroneFeature, LayerMetadata, MetadataResponse, PoiCategory, PoiFeature } from "../lib/types";
import { mapLimit } from "../lib/parallel";
import { getRefreshConcurrency, getValhallaConcurrency } from "../lib/refresh-config";
import { sampleMetros, sampleMilkbars, sampleStores } from "./sample-data";
import { requestIsochrones } from "./valhalla";
import { runUnionWorkerPool } from "./union-worker-pool";

const metadataPath = join(cacheDir, "metadata.json");

function emptyLayerMetadata(category: PoiCategory, updatedAt: string, supportedMinutes: { min: number; max: number }): LayerMetadata {
  return {
    category,
    poiCount: 0,
    minuteRange: supportedMinutes,
    minutesAvailable: [],
    updatedAt,
    source: "missing",
  };
}

function normalizeMetadata(metadata: CacheMetadata): CacheMetadata {
  const generatedAt = metadata.generatedAt ?? new Date().toISOString();
  const supportedMinutes = metadata.supportedMinutes ?? { min: 1, max: 30 };

  return {
    ...metadata,
    generatedAt,
    supportedMinutes,
    counts: {
      stores: metadata.counts?.stores ?? 0,
      metros: metadata.counts?.metros ?? 0,
      milkbars: metadata.counts?.milkbars ?? 0,
    },
    layers: {
      store: metadata.layers?.store ?? emptyLayerMetadata("store", generatedAt, supportedMinutes),
      metro: metadata.layers?.metro ?? emptyLayerMetadata("metro", generatedAt, supportedMinutes),
      milkbar: metadata.layers?.milkbar ?? emptyLayerMetadata("milkbar", generatedAt, supportedMinutes),
    },
  };
}

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

function countIsochroneSources(
  perPointIsochrones: IsochroneFeature[][],
): LayerMetadata["debug"] {
  const debug: NonNullable<LayerMetadata["debug"]> = {
    valhallaPoiCounts: {},
    fallbackPoiCounts: {},
  };

  for (const pointIsochrones of perPointIsochrones) {
    for (const isochrone of pointIsochrones) {
      const target = isochrone.properties.source === "fallback"
        ? debug.fallbackPoiCounts!
        : debug.valhallaPoiCounts!;
      const minuteKey = String(isochrone.properties.minutes);
      target[minuteKey] = (target[minuteKey] ?? 0) + 1;
    }
  }

  return debug;
}

export async function loadNormalizedPoints(category: PoiCategory): Promise<PoiFeature[]> {
  const fileName = category === "store"
    ? "stores.geojson"
    : category === "metro"
      ? "metro.geojson"
      : "milkbar.geojson";
  const filePath = join(rawDataDir, fileName);
  const parsed = await readJsonIfExists<FeatureCollection>(filePath);

  if (parsed?.features?.length) {
    return parsed.features as PoiFeature[];
  }

  return category === "store" ? sampleStores() : category === "metro" ? sampleMetros() : sampleMilkbars();
}

export async function loadMetadata(): Promise<CacheMetadata | null> {
  const metadata = await readJsonIfExists<CacheMetadata>(metadataPath);
  return metadata ? normalizeMetadata(metadata) : null;
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
  const valhallaConcurrency = Math.min(getValhallaConcurrency(), points.length);
  const perPointIsochrones = await mapLimit(
    points,
    valhallaConcurrency,
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

      const clippedLayer = clipToWarsawBounds(layer);
      if (!clippedLayer) {
        return null;
      }

      await writeJson(layerPath(category, minutes), {
        ...clippedLayer,
        properties: {
          ...(clippedLayer.properties ?? {}),
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
    debug: countIsochroneSources(perPointIsochrones),
  };
}

export async function refreshCache(): Promise<CacheMetadata> {
  await ensureProjectDirs();
  const [stores, metros, milkbars] = await Promise.all([
    loadNormalizedPoints("store"),
    loadNormalizedPoints("metro"),
    loadNormalizedPoints("milkbar"),
  ]);

  const [storeLayers, metroLayers, milkbarLayers] = await Promise.all([
    buildAndPersistLayers("store", stores, minuteRange()),
    buildAndPersistLayers("metro", metros, minuteRange()),
    buildAndPersistLayers("milkbar", milkbars, minuteRange()),
  ]);

  const generatedAt = new Date().toISOString();
  const metadata: CacheMetadata = {
    generatedAt,
    source: usedSampleFallback(stores) || usedSampleFallback(metros) || usedSampleFallback(milkbars)
      ? "refresh-fallback-sample"
      : "refresh",
    supportedMinutes: {
      min: 1,
      max: 30,
    },
    counts: {
      stores: stores.length,
      metros: metros.length,
      milkbars: milkbars.length,
    },
    layers: {
      store: { ...storeLayers, updatedAt: generatedAt },
      metro: { ...metroLayers, updatedAt: generatedAt },
      milkbar: { ...milkbarLayers, updatedAt: generatedAt },
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

export async function getOverlayGeometry(
  storeMinutes: number,
  metroMinutes: number,
  milkbarMinutes: number,
  showMilkbars = false,
) {
  const metadata = await ensureCacheReady();
  const [storeLayer, metroLayer, milkbarLayer] = await Promise.all([
    loadLayer("store", storeMinutes),
    loadLayer("metro", metroMinutes),
    showMilkbars ? loadLayer("milkbar", milkbarMinutes) : Promise.resolve(null),
  ]);

  const storeSamples = sampleStores();
  const metroSamples = sampleMetros();
  const milkbarSamples = sampleMilkbars();

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
  const fallbackMilkbars = showMilkbars
    ? makeFallbackLayer(
      milkbarSamples.map((feature) => feature.geometry.coordinates as [number, number]),
      milkbarMinutes,
      (index) => ({
        poiId: milkbarSamples[index]?.properties.id,
        poiName: milkbarSamples[index]?.properties.name,
        category: "milkbar",
        minutes: milkbarMinutes,
        source: "fallback",
      }),
    )
    : null;

  const left = storeLayer ?? fallbackStores;
  const right = metroLayer ?? fallbackMetros;
  const milkbar = showMilkbars ? milkbarLayer ?? fallbackMilkbars : null;
  const baseIntersection = intersectPolygons(left, right);
  const intersection = showMilkbars && baseIntersection && milkbar
    ? intersectPolygons(baseIntersection, milkbar)
    : baseIntersection;

  return {
    metadata,
    intersection,
    storeLayer: left,
    metroLayer: right,
    milkbarLayer: milkbar,
  };
}

export async function readRuntimeMetadata(): Promise<MetadataResponse> {
  const metadata = await loadMetadata();

  if (!metadata) {
    const storeSamples = sampleStores();
    const metroSamples = sampleMetros();
    const milkbarSamples = sampleMilkbars();

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
        milkbars: milkbarSamples.length,
      },
      bbox: {
        minLon: 20.8,
        minLat: 52.05,
        maxLon: 21.32,
        maxLat: 52.4,
      },
      storeMinutes: [],
      metroMinutes: [],
      milkbarMinutes: [],
      lastRefreshAt: null,
      layers: undefined,
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
    milkbarMinutes: metadata.layers.milkbar.minutesAvailable,
    lastRefreshAt: metadata.generatedAt,
    layers: metadata.layers,
  };
}
