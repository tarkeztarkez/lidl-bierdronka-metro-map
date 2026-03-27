import type { Feature, FeatureCollection, Geometry, Polygon, MultiPolygon, Point } from "geojson";

export type PoiCategory = "store" | "metro" | "milkbar";

export type PoiFeature = Feature<Point, PoiProperties>;

export interface PoiProperties {
  id: string;
  name: string;
  category: PoiCategory;
  subtype: string;
  source: "osm" | "sample";
  minutesMax?: number;
  brand?: string;
  operator?: string;
}

export type IsochroneFeature = Feature<Polygon | MultiPolygon, IsochroneProperties>;

export interface IsochroneProperties {
  poiId: string;
  poiName: string;
  category: PoiCategory;
  minutes: number;
  source: "valhalla" | "fallback";
}

export interface LayerMetadata {
  category: PoiCategory;
  poiCount: number;
  minuteRange: { min: number; max: number };
  minutesAvailable: number[];
  updatedAt: string;
  source: string;
  debug?: {
    valhallaPoiCounts?: Record<string, number>;
    fallbackPoiCounts?: Record<string, number>;
  };
}

export interface CacheMetadata {
  generatedAt: string;
  source: string;
  supportedMinutes: { min: number; max: number };
  counts: { stores: number; metros: number; milkbars: number };
  layers: Record<PoiCategory, LayerMetadata>;
  bbox: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
}

export interface OverlayResponse {
  type: "FeatureCollection";
  features: Feature<Geometry, Record<string, unknown>>[];
}

export interface MetadataResponse {
  generatedAt: string;
  cacheReady: boolean;
  source: string;
  supportedMinutes: { min: number; max: number };
  counts: { stores: number; metros: number; milkbars: number };
  bbox: CacheMetadata["bbox"];
  storeMinutes: number[];
  metroMinutes: number[];
  milkbarMinutes: number[];
  lastRefreshAt: string | null;
  layers?: CacheMetadata["layers"];
}
