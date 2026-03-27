import {
  bboxPolygon,
  cleanCoords,
  circle,
  combine,
  featureCollection,
  intersect,
  multiPolygon,
  point,
  union,
} from "@turf/turf";
import type { Feature, FeatureCollection, Geometry, GeoJsonProperties, MultiPolygon, Point, Polygon } from "geojson";

import type { IsochroneFeature, PoiFeature } from "./types";
import { WARSAW_BBOX } from "./constants";

export function makePointFeature(longitude: number, latitude: number, properties: GeoJsonProperties): Feature<Point> {
  return point([longitude, latitude], properties);
}

export function makeApproxIsochrone(longitude: number, latitude: number, minutes: number, properties: Record<string, unknown>): IsochroneFeature {
  const radiusKm = Math.max(0.35, minutes * 0.55);
  return circle([longitude, latitude], radiusKm, {
    steps: 64,
    units: "kilometers",
    properties,
  }) as unknown as IsochroneFeature;
}

export function mergePolygons(features: Array<Feature<Polygon | MultiPolygon>>): Feature<Polygon | MultiPolygon> | null {
  const clean = features
    .filter(Boolean)
    .map((feature) => cleanCoords(feature) as Feature<Polygon | MultiPolygon>);

  if (clean.length === 0) {
    return null;
  }

  if (clean.length === 1) {
    return clean[0] ?? null;
  }

  try {
    return union(featureCollection(clean)) as Feature<Polygon | MultiPolygon> | null;
  } catch {
    let current = clean[0] ?? null;

    for (const next of clean.slice(1)) {
      if (!current) {
        current = next;
        continue;
      }

      try {
        current = union(featureCollection([current, next])) as Feature<Polygon | MultiPolygon> | null;
      } catch {
        continue;
      }
    }

    return current;
  }
}

export function combinePolygons(
  features: Array<Feature<Polygon | MultiPolygon>>,
): Feature<Polygon | MultiPolygon> | null {
  const clean = features
    .filter(Boolean)
    .map((feature) => cleanCoords(feature) as Feature<Polygon | MultiPolygon>);

  if (clean.length === 0) {
    return null;
  }

  if (clean.length === 1) {
    return clean[0] ?? null;
  }

  try {
    const combined = combine(featureCollection(clean));
    const first = combined.features[0];
    return (first as Feature<Polygon | MultiPolygon> | undefined) ?? null;
  } catch {
    const coordinates = clean.flatMap((feature) =>
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates,
    );

    return multiPolygon(coordinates) as Feature<MultiPolygon>;
  }
}

export function intersectPolygons(
  a: Feature<Polygon | MultiPolygon> | null,
  b: Feature<Polygon | MultiPolygon> | null,
): Feature<Polygon | MultiPolygon> | null {
  if (!a || !b) {
    return null;
  }

  const result = intersect(featureCollection([a, b]));
  return (result as Feature<Polygon | MultiPolygon> | null) ?? null;
}

export function clipToWarsawBounds(
  feature: Feature<Polygon | MultiPolygon> | null,
): Feature<Polygon | MultiPolygon> | null {
  if (!feature) {
    return null;
  }

  const bounds = bboxPolygon([
    WARSAW_BBOX.minLon,
    WARSAW_BBOX.minLat,
    WARSAW_BBOX.maxLon,
    WARSAW_BBOX.maxLat,
  ]) as Feature<Polygon>;

  const clipped = intersect(featureCollection([feature, bounds]));
  return (clipped as Feature<Polygon | MultiPolygon> | null) ?? null;
}

export function geometryIsEmpty(geometry: Geometry | null | undefined): boolean {
  if (!geometry) {
    return true;
  }

  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.length === 0;
  }

  return false;
}

export function makeFallbackLayer(
  centers: Array<[number, number]>,
  minutes: number,
  propertiesFactory: (index: number) => Record<string, unknown>,
): Feature<Polygon | MultiPolygon> | null {
  const polygons = centers.map(([longitude, latitude], index) =>
    circle([longitude, latitude], Math.max(0.35, minutes * 0.55), {
      steps: 64,
      units: "kilometers",
      properties: propertiesFactory(index),
    }) as Feature<Polygon>,
  );

  return mergePolygons(polygons);
}

export function sampleGridPoints(): Array<[number, number]> {
  return [
    [21.0122, 52.2297],
    [21.0225, 52.235],
    [21.035, 52.241],
    [20.99, 52.24],
    [20.955, 52.247],
    [21.06, 52.215],
    [21.085, 52.23],
    [21.1, 52.245],
  ];
}

export function centroidish(feature: Feature<Point>): [number, number] {
  const [longitude, latitude] = feature.geometry.coordinates as [number, number];
  return [longitude, latitude];
}

export function outlineFeature(feature: Feature<Polygon | MultiPolygon>) {
  return feature;
}

export function featureCollectionOfPoints(features: PoiFeature[]): FeatureCollection<Point> {
  return featureCollection(features.map((feature) => feature));
}
