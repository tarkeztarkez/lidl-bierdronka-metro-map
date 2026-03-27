export type Minutes = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30

export type Position = [number, number]

export type PolygonGeometry = {
  type: 'Polygon'
  coordinates: Position[][]
}

export type MultiPolygonGeometry = {
  type: 'MultiPolygon'
  coordinates: Position[][][]
}

export type PointGeometry = {
  type: 'Point'
  coordinates: Position
}

export type GeoJsonGeometry =
  | PolygonGeometry
  | MultiPolygonGeometry
  | PointGeometry

export interface GeoJsonFeature {
  type: 'Feature'
  geometry: GeoJsonGeometry
  properties?: Record<string, unknown>
  id?: string | number
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJsonFeature[]
}

export interface SourcePoint {
  id?: string
  name: string
  kind: 'store' | 'metro' | 'milkbar'
  position: Position
  note?: string
}

export interface ApiMetadata {
  refreshedAt?: string
  storeCount?: number
  metroCount?: number
  milkbarCount?: number
  storeMinutesRange?: [number, number]
  metroMinutesRange?: [number, number]
  milkbarMinutesRange?: [number, number]
  bounds?: [number, number, number, number]
  source?: string
  note?: string
  sourcePoints?: SourcePoint[]
  storePoints?: SourcePoint[]
  metroPoints?: SourcePoint[]
  milkbarPoints?: SourcePoint[]
}

export interface OverlayResponse {
  type?: 'FeatureCollection'
  featureCollection?: GeoJsonFeatureCollection
  geojson?: GeoJsonFeatureCollection
  overlay?: GeoJsonFeatureCollection
  metadata?: ApiMetadata
  demo?: boolean
  message?: string
}

export interface LiveResponse {
  metadata?: ApiMetadata
  message?: string
  demo?: boolean
}

export type OverlayDisplayMode = 'full' | 'intersection'
