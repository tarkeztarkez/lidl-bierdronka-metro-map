import { useEffect, useMemo, useRef } from 'react'
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Pane,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'
import type {
  ApiMetadata,
  GeoJsonFeatureCollection,
  OverlayDisplayMode,
} from './types'
import { sampleMetadata } from './sampleData'
import { isFeatureCollection } from './api'
import L, { type LatLngBoundsExpression } from 'leaflet'

const WARSAW_CENTER: [number, number] = [52.2297, 21.0122]
const WARSAW_BOUNDS: LatLngBoundsExpression = [
  [52.16, 20.9],
  [52.32, 21.18],
]

function BoundsSync({
  featureCollection,
  metadata,
}: {
  featureCollection: GeoJsonFeatureCollection | null
  metadata: ApiMetadata
}) {
  const map = useMap()
  const hasFittedRef = useRef(false)

  useEffect(() => {
    if (hasFittedRef.current) {
      return
    }

    if (featureCollection?.features.length) {
      const focusFeatures = featureCollection.features.filter(
        (feature) => feature.properties?.kind === 'intersection',
      )
      const focusCollection = focusFeatures.length
        ? {
            ...featureCollection,
            features: focusFeatures,
          }
        : featureCollection
      const bounds = L.geoJSON(focusCollection as never).getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.12), { padding: [32, 32], animate: true })
        hasFittedRef.current = true
        return
      }
    }

    const boundsFromMetadata = metadata.bounds
      ? ([
          [metadata.bounds[1], metadata.bounds[0]],
          [metadata.bounds[3], metadata.bounds[2]],
        ] as LatLngBoundsExpression)
      : null

    if (boundsFromMetadata) {
      map.fitBounds(boundsFromMetadata, { padding: [32, 32], animate: true })
      hasFittedRef.current = true
      return
    }

    map.setView(WARSAW_CENTER, 12, { animate: true })
    hasFittedRef.current = true
  }, [featureCollection, map, metadata.bounds])

  return null
}

function sourceStyle(kind: 'store' | 'metro' | 'milkbar') {
  return kind === 'store'
    ? { color: '#cf4d28', fillColor: '#f76b3f' }
    : kind === 'metro'
      ? { color: '#1f6feb', fillColor: '#6ba8ff' }
      : { color: '#187a57', fillColor: '#3fc48b' }
}

function overlayStyle(kind: unknown) {
  if (kind === 'store') {
    return {
      color: '#cf4d28',
      weight: 2.25,
      opacity: 0.92,
      fillColor: '#f76b3f',
      fillOpacity: 0.1,
    }
  }

  if (kind === 'metro') {
    return {
      color: '#1f6feb',
      weight: 2.25,
      opacity: 0.92,
      fillColor: '#6ba8ff',
      fillOpacity: 0.08,
    }
  }

  if (kind === 'milkbar') {
    return {
      color: '#187a57',
      weight: 2.25,
      opacity: 0.92,
      fillColor: '#3fc48b',
      fillOpacity: 0.08,
    }
  }

  return {
    color: '#c68817',
    weight: 2.75,
    opacity: 1,
    fillColor: '#f1b64c',
    fillOpacity: 0.58,
  }
}

interface MapViewProps {
  featureCollection: GeoJsonFeatureCollection
  metadata: ApiMetadata
  isLoading: boolean
  overlayDisplayMode: OverlayDisplayMode
  storeMinutes: number
  metroMinutes: number
  milkbarMinutes: number
  showMilkbars: boolean
}

function featuresByKind(
  featureCollection: GeoJsonFeatureCollection | null,
  kind: 'store' | 'metro' | 'milkbar' | 'intersection',
): GeoJsonFeatureCollection | null {
  if (!featureCollection) {
    return null
  }

  const features = featureCollection.features.filter(
    (feature) => feature.properties?.kind === kind,
  )

  return features.length
    ? {
        type: 'FeatureCollection',
        features,
      }
    : null
}

function featureCollectionKey(
  featureCollection: GeoJsonFeatureCollection | null,
  fallback: string,
): string {
  if (!featureCollection) {
    return fallback
  }

  return featureCollection.features
    .map((feature) => [
      String(feature.properties?.kind ?? fallback),
      String(feature.properties?.minutes ?? 'na'),
      feature.geometry.type,
      String(feature.id ?? ''),
    ].join(':'))
    .join('|')
}

export function MapView({
  featureCollection,
  metadata,
  isLoading,
  overlayDisplayMode,
  storeMinutes,
  metroMinutes,
  milkbarMinutes,
  showMilkbars,
}: MapViewProps) {
  const sourcePoints = useMemo(
    () => {
      if (metadata.source === 'demo') {
        return [
          ...(sampleMetadata.storePoints ?? []),
          ...(sampleMetadata.metroPoints ?? []),
          ...(showMilkbars ? sampleMetadata.milkbarPoints ?? [] : []),
        ]
      }

      return [
        ...(metadata.storePoints ?? []),
        ...(metadata.metroPoints ?? []),
        ...(showMilkbars ? metadata.milkbarPoints ?? [] : []),
      ]
    },
    [metadata.milkbarPoints, metadata.metroPoints, metadata.source, metadata.storePoints, showMilkbars],
  )

  const overlayGeometry = useMemo(
    () => isFeatureCollection(featureCollection) ? featureCollection : null,
    [featureCollection],
  )
  const showOverlayLayers = !isLoading
  const storeGeometry = useMemo(
    () => showOverlayLayers && overlayDisplayMode === 'full'
      ? featuresByKind(overlayGeometry, 'store')
      : null,
    [overlayDisplayMode, overlayGeometry, showOverlayLayers],
  )
  const metroGeometry = useMemo(
    () => showOverlayLayers && overlayDisplayMode === 'full'
      ? featuresByKind(overlayGeometry, 'metro')
      : null,
    [overlayDisplayMode, overlayGeometry, showOverlayLayers],
  )
  const intersectionGeometry = useMemo(
    () => showOverlayLayers ? featuresByKind(overlayGeometry, 'intersection') : null,
    [overlayGeometry, showOverlayLayers],
  )
  const milkbarGeometry = useMemo(
    () => showOverlayLayers && overlayDisplayMode === 'full' && showMilkbars
      ? featuresByKind(overlayGeometry, 'milkbar')
      : null,
    [overlayDisplayMode, overlayGeometry, showMilkbars, showOverlayLayers],
  )
  const storeGeometryKey = useMemo(
    () => featureCollectionKey(storeGeometry, 'store'),
    [storeGeometry],
  )
  const metroGeometryKey = useMemo(
    () => featureCollectionKey(metroGeometry, 'metro'),
    [metroGeometry],
  )
  const intersectionGeometryKey = useMemo(
    () => featureCollectionKey(intersectionGeometry, 'intersection'),
    [intersectionGeometry],
  )
  const milkbarGeometryKey = useMemo(
    () => featureCollectionKey(milkbarGeometry, 'milkbar'),
    [milkbarGeometry],
  )

  return (
    <section className="map-shell" aria-label="Map visualization">
      <div className="map-frame">
        <MapContainer
          className="leaflet-map"
          center={WARSAW_CENTER}
          zoom={12}
          scrollWheelZoom
          zoomControl={false}
          bounds={WARSAW_BOUNDS}
        >
          <BoundsSync featureCollection={overlayGeometry} metadata={metadata} />
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            opacity={0.68}
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <Pane name="access-store-pane" style={{ zIndex: 420 }} />
          <Pane name="access-metro-pane" style={{ zIndex: 425 }} />
          <Pane name="access-milkbar-pane" style={{ zIndex: 427 }} />
          <Pane name="access-intersection-pane" style={{ zIndex: 430 }} />
          <Pane name="access-source-pane" style={{ zIndex: 440 }} />

          {storeGeometry ? (
            <GeoJSON
              key={`${storeGeometryKey}:${storeMinutes}`}
              data={storeGeometry as never}
              pane="access-store-pane"
              style={(feature) => overlayStyle(feature?.properties?.kind)}
            />
          ) : null}
          {metroGeometry ? (
            <GeoJSON
              key={`${metroGeometryKey}:${metroMinutes}`}
              data={metroGeometry as never}
              pane="access-metro-pane"
              style={(feature) => overlayStyle(feature?.properties?.kind)}
            />
          ) : null}
          {milkbarGeometry ? (
            <GeoJSON
              key={`${milkbarGeometryKey}:${milkbarMinutes}`}
              data={milkbarGeometry as never}
              pane="access-milkbar-pane"
              style={(feature) => overlayStyle(feature?.properties?.kind)}
            />
          ) : null}
          {intersectionGeometry ? (
            <GeoJSON
              key={`${intersectionGeometryKey}:${storeMinutes}:${metroMinutes}:${milkbarMinutes}:${showMilkbars ? 'milkbar' : 'base'}`}
              data={intersectionGeometry as never}
              pane="access-intersection-pane"
              style={(feature) => overlayStyle(feature?.properties?.kind)}
            />
          ) : null}

          {sourcePoints.map((point) => (
            <CircleMarker
              key={point.id ?? `${point.kind}-${point.name}-${point.position.join(',')}`}
              center={[point.position[1], point.position[0]]}
              pane="access-source-pane"
              pathOptions={{
                ...sourceStyle(point.kind),
                weight: 2,
                fillOpacity: 0.95,
              }}
              radius={point.kind === 'store' ? 6 : 7}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={1} permanent={false}>
                <span>
                  {point.name}
                  {point.note ? ` · ${point.note}` : ''}
                </span>
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>

        <div className="map-hud">
          {isLoading ? (
            <div className="legend-card legend-card-loading" aria-live="polite">
              <span className="legend-title">Overlay Status</span>
              <div className="loading-row">
                <span className="loading-dot" aria-hidden="true" />
                <strong>Recalculating intersection</strong>
              </div>
              <p>
                Waiting for fresh geometry for {storeMinutes} min grocery reach, {metroMinutes} min metro reach
                {showMilkbars ? `, and ${milkbarMinutes} min milkbar reach.` : '.'}
              </p>
            </div>
          ) : null}
          <div className="legend-card">
            <span className="legend-title">Legend</span>
            {overlayDisplayMode === 'full' ? (
              <>
                <div className="legend-row">
                  <i className="swatch swatch-store" />
                  <span>Store walking area</span>
                </div>
                <div className="legend-row">
                  <i className="swatch swatch-metro" />
                  <span>Metro walking area</span>
                </div>
                {showMilkbars ? (
                  <div className="legend-row">
                    <i className="swatch swatch-milkbar" />
                    <span>Milkbar walking area</span>
                  </div>
                ) : null}
              </>
            ) : null}
            <div className="legend-row">
              <i className="swatch swatch-overlap" />
              <span>
                {overlayDisplayMode === 'full'
                  ? showMilkbars ? 'Triple-overlap fill' : 'Intersection fill'
                  : showMilkbars ? 'Triple-overlap only' : 'Intersection only'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
