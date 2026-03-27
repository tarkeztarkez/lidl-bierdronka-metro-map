import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import DirectionsBikeRoundedIcon from '@mui/icons-material/DirectionsBikeRounded'
import DirectionsWalkRoundedIcon from '@mui/icons-material/DirectionsWalkRounded'
import DirectionsBusRoundedIcon from '@mui/icons-material/DirectionsBusRounded'
import TramRoundedIcon from '@mui/icons-material/TramRounded'
import SubwayRoundedIcon from '@mui/icons-material/SubwayRounded'
import TrainRoundedIcon from '@mui/icons-material/TrainRounded'
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Marker,
  Pane,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import type {
  ApiMetadata,
  GeoJsonFeatureCollection,
  LayerVisibility,
  RouteMode,
  RouteModeResult,
  RouteOrigin,
  RoutesResponse,
  SourcePoint,
  TransitSegment,
  TransitSegmentIcon,
} from './types'
import { sampleMetadata } from './sampleData'
import { isFeatureCollection } from './api'
import { HIGHLIGHT_POINTS } from './highlightPoints'
import L, { type LatLngBoundsExpression } from 'leaflet'

const WARSAW_CENTER: [number, number] = [52.2297, 21.0122]
const WARSAW_BOUNDS: LatLngBoundsExpression = [
  [52.16, 20.9],
  [52.32, 21.18],
]

const DESTINATION_COLORS: Record<string, string> = {
  verestro: '#cf4d28',
  buw: '#187a57',
  campus: '#1f6feb',
}

const DESTINATION_LABELS: Record<string, string> = {
  verestro: 'Verestro',
  buw: 'BUW',
  campus: 'Campus',
}

function highlightIcon(letter: string) {
  return L.divIcon({
    className: 'map-highlight-icon',
    html: `<span>${letter}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function originIcon() {
  return L.divIcon({
    className: 'map-origin-icon',
    html: '<span></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function modeIcon(mode: RouteMode) {
  return mode === 'walking' ? 'walk' : mode === 'bicycling' ? 'bike' : 'transit'
}

function renderModeIcon(mode: RouteMode) {
  const props = { className: 'route-mode-icon', fontSize: 'inherit' as const }

  if (mode === 'walking') {
    return <DirectionsWalkRoundedIcon {...props} />
  }

  if (mode === 'bicycling') {
    return <DirectionsBikeRoundedIcon {...props} />
  }

  return <SubwayRoundedIcon {...props} />
}

function renderTransitIcon(icon: TransitSegmentIcon) {
  const props = { className: 'transit-icon-svg', fontSize: 'inherit' as const }

  if (icon === 'bus') {
    return <DirectionsBusRoundedIcon {...props} />
  }

  if (icon === 'tram') {
    return <TramRoundedIcon {...props} />
  }

  if (icon === 'metro') {
    return <SubwayRoundedIcon {...props} />
  }

  return <TrainRoundedIcon {...props} />
}

function boundsFromPoints(points: SourcePoint[]): L.LatLngBounds | null {
  if (!points.length) {
    return null
  }

  const bounds = L.latLngBounds(
    points.map((point) => [point.position[1], point.position[0]] as [number, number]),
  )

  return bounds.isValid() ? bounds : null
}

function BoundsSync({
  featureCollection,
  metadata,
  highlightPoints,
}: {
  featureCollection: GeoJsonFeatureCollection | null
  metadata: ApiMetadata
  highlightPoints: SourcePoint[]
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
      const highlightBounds = boundsFromPoints(highlightPoints)
      const combinedBounds = highlightBounds ? bounds.extend(highlightBounds) : bounds

      if (combinedBounds.isValid()) {
        map.fitBounds(combinedBounds.pad(0.12), { padding: [32, 32], animate: true })
        hasFittedRef.current = true
        return
      }
    }

    const metadataBounds = metadata.bounds
      ? L.latLngBounds([
          [metadata.bounds[1], metadata.bounds[0]],
          [metadata.bounds[3], metadata.bounds[2]],
        ])
      : null
    const highlightBounds = boundsFromPoints(highlightPoints)
    const fallbackBounds = metadataBounds
      ? (highlightBounds ? metadataBounds.extend(highlightBounds) : metadataBounds)
      : highlightBounds

    if (fallbackBounds?.isValid()) {
      map.fitBounds(fallbackBounds.pad(0.08), { padding: [32, 32], animate: true })
      hasFittedRef.current = true
      return
    }

    map.setView(WARSAW_CENTER, 12, { animate: true })
    hasFittedRef.current = true
  }, [featureCollection, highlightPoints, map, metadata.bounds])

  return null
}

function MapClickHandler({
  onRouteOriginChange,
}: {
  onRouteOriginChange: (origin: RouteOrigin) => void
}) {
  useMapEvents({
    click(event) {
      onRouteOriginChange({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      })
    },
  })

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
  layerVisibility: LayerVisibility
  storeMinutes: number
  metroMinutes: number
  milkbarMinutes: number
  showMilkbars: boolean
  routeOrigin: RouteOrigin | null
  onRouteOriginChange: (origin: RouteOrigin) => void
  onRouteOriginClear: () => void
  routes: RoutesResponse | null
  isRoutesLoading: boolean
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

function unavailableMode(mode: RouteMode): RouteModeResult {
  return {
    mode,
    status: 'unavailable',
  }
}

function formatCompactDuration(value?: string) {
  if (!value) {
    return '—'
  }

  const normalized = value
    .replace(/\s*hours?\s*/gi, 'h')
    .replace(/\s*hour\s*/gi, 'h')
    .replace(/\s*mins?\s*/gi, 'm')
    .replace(/\s*min\s*/gi, 'm')
    .replace(/\s+/g, '')

  return normalized
}

function RouteCell({
  mode,
  durationText,
  transitSegments,
  isLoading,
}: {
  mode: RouteMode
  durationText?: string
  transitSegments?: TransitSegment[]
  isLoading: boolean
}) {
  return (
    <div className="route-mode-card">
      <span className={`route-mode-glyph route-mode-glyph-${modeIcon(mode)}`} aria-hidden="true">
        {renderModeIcon(mode)}
      </span>
      {isLoading ? (
        <span className="route-inline-spinner" aria-label="Loading" />
      ) : (
        <strong className="route-duration">{formatCompactDuration(durationText)}</strong>
      )}
      {!isLoading && mode === 'transit' && transitSegments?.length ? (
        <span className="transit-hover-card" role="tooltip">
          <span className="transit-badge-row">
            {transitSegments.map((segment, index) => (
              <span
                key={`${segment.icon}-${segment.lineLabel}-${index}`}
                className="transit-badge"
                title={segment.headsign ? `${segment.lineLabel} → ${segment.headsign}` : segment.lineLabel}
              >
                <i className={`transit-icon transit-icon-${segment.icon}`} aria-hidden="true">
                  {renderTransitIcon(segment.icon)}
                </i>
                <span>{segment.lineLabel}</span>
              </span>
            ))}
          </span>
        </span>
      ) : null}
    </div>
  )
}

export function MapView({
  featureCollection,
  metadata,
  isLoading,
  layerVisibility,
  storeMinutes,
  metroMinutes,
  milkbarMinutes,
  showMilkbars,
  routeOrigin,
  onRouteOriginChange,
  onRouteOriginClear,
  routes,
  isRoutesLoading,
}: MapViewProps) {
  const highlightPoints = useMemo(() => HIGHLIGHT_POINTS, [])
  const routeOriginMarkerRef = useRef<L.Marker | null>(null)
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
    () => showOverlayLayers && layerVisibility.store
      ? featuresByKind(overlayGeometry, 'store')
      : null,
    [layerVisibility.store, overlayGeometry, showOverlayLayers],
  )
  const metroGeometry = useMemo(
    () => showOverlayLayers && layerVisibility.metro
      ? featuresByKind(overlayGeometry, 'metro')
      : null,
    [layerVisibility.metro, overlayGeometry, showOverlayLayers],
  )
  const intersectionGeometry = useMemo(
    () => showOverlayLayers && layerVisibility.intersection ? featuresByKind(overlayGeometry, 'intersection') : null,
    [layerVisibility.intersection, overlayGeometry, showOverlayLayers],
  )
  const milkbarGeometry = useMemo(
    () => showOverlayLayers && layerVisibility.milkbar && showMilkbars
      ? featuresByKind(overlayGeometry, 'milkbar')
      : null,
    [layerVisibility.milkbar, overlayGeometry, showMilkbars, showOverlayLayers],
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
  const popupResults = routes?.results ?? highlightPoints.map((point) => ({
    placeId: point.id ?? point.name,
    placeName: point.name,
    modes: {
      walking: unavailableMode('walking'),
      bicycling: unavailableMode('bicycling'),
      transit: unavailableMode('transit'),
    },
  }))

  useEffect(() => {
    if (!routeOrigin) {
      return
    }

    routeOriginMarkerRef.current?.openPopup()
  }, [routeOrigin, routes, isRoutesLoading])

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
          <BoundsSync
            featureCollection={overlayGeometry}
            metadata={metadata}
            highlightPoints={highlightPoints}
          />
          <MapClickHandler onRouteOriginChange={onRouteOriginChange} />
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
          <Pane name="access-highlight-pane" style={{ zIndex: 455 }} />
          <Pane name="access-origin-pane" style={{ zIndex: 460 }} />

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

          {highlightPoints.map((point) => (
            <Marker
              key={point.id ?? `${point.name}-${point.position.join(',')}`}
              position={[point.position[1], point.position[0]]}
              pane="access-highlight-pane"
              icon={highlightIcon(point.letter ?? point.name.charAt(0))}
            >
              <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                <span>
                  {point.name}
                  {point.note ? ` · ${point.note}` : ''}
                </span>
              </Tooltip>
            </Marker>
          ))}

          {routeOrigin ? (
            <Marker
              position={[routeOrigin.lat, routeOrigin.lng]}
              pane="access-origin-pane"
              icon={originIcon()}
              ref={routeOriginMarkerRef}
            >
              <Popup
                className="route-popup"
                maxWidth={420}
                minWidth={360}
                closeButton={false}
                closeOnClick={false}
                autoClose={false}
                autoPan={false}
              >
                <div className="route-popup-shell">
                  <div className="route-popup-head">
                    <div>
                      <h3>Travel times to highlighted places</h3>
                    </div>
                    <button type="button" className="route-close-button" onClick={onRouteOriginClear}>
                      Close
                    </button>
                  </div>
                  <div className="route-popup-grid">
                    {popupResults.map((result) => (
                      <div key={result.placeId} className="route-popup-row">
                        <strong
                          className="route-place-chip"
                          style={{ '--place-color': DESTINATION_COLORS[result.placeId] ?? '#6b7280' } as CSSProperties}
                        >
                          {DESTINATION_LABELS[result.placeId] ?? result.placeName}
                        </strong>
                        <div className="route-mode-row">
                          {(['walking', 'bicycling', 'transit'] as RouteMode[]).map((mode) => {
                            const modeResult = result.modes[mode]
                            const routeId = `${result.placeId}:${mode}`
                            return (
                              <RouteCell
                                key={routeId}
                                mode={mode}
                                durationText={modeResult.durationText}
                                transitSegments={modeResult.transitSegments}
                                isLoading={isRoutesLoading}
                              />
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Popup>
            </Marker>
          ) : null}
        </MapContainer>

        <div className="map-hud">
          <div className="legend-card legend-card-compact">
            {isLoading ? (
              <div className="legend-row legend-row-inline" aria-live="polite">
                <span className="loading-dot" aria-hidden="true" />
                <span>Updating</span>
              </div>
            ) : null}
            <div className="legend-row legend-row-inline">
              <i className="swatch swatch-highlight" />
              <span>V / B / C</span>
            </div>
            <div className="legend-row legend-row-inline">
              <span>Click map for times</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
