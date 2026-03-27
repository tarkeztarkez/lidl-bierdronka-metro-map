import { useEffect, useMemo } from 'react'
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Pane,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'
import type { ApiMetadata, GeoJsonFeatureCollection } from './types'
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

  useEffect(() => {
    const boundsFromMetadata = metadata.bounds
      ? ([
          [metadata.bounds[1], metadata.bounds[0]],
          [metadata.bounds[3], metadata.bounds[2]],
        ] as LatLngBoundsExpression)
      : null

    if (boundsFromMetadata) {
      map.fitBounds(boundsFromMetadata, { padding: [32, 32], animate: true })
      return
    }

    if (featureCollection?.features.length) {
      const bounds = L.geoJSON(featureCollection as never).getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.12), { padding: [32, 32], animate: true })
        return
      }
    }

    map.setView(WARSAW_CENTER, 12, { animate: true })
  }, [featureCollection, map, metadata.bounds])

  return null
}

function sourceStyle(kind: 'store' | 'metro') {
  return kind === 'store'
    ? { color: '#cf4d28', fillColor: '#f76b3f' }
    : { color: '#1f6feb', fillColor: '#6ba8ff' }
}

interface MapViewProps {
  featureCollection: GeoJsonFeatureCollection
  metadata: ApiMetadata
  isLoading: boolean
  status: 'loading' | 'live' | 'demo' | 'error'
}

export function MapView({
  featureCollection,
  metadata,
  isLoading,
  status,
}: MapViewProps) {
  const sourcePoints = useMemo(
    () => {
      if (metadata.source === 'demo') {
        return [
          ...(sampleMetadata.storePoints ?? []),
          ...(sampleMetadata.metroPoints ?? []),
        ]
      }

      return [
        ...(metadata.storePoints ?? []),
        ...(metadata.metroPoints ?? []),
      ]
    },
    [metadata.metroPoints, metadata.source, metadata.storePoints],
  )

  const overlayGeometry = useMemo(
    () => isFeatureCollection(featureCollection) ? featureCollection : null,
    [featureCollection],
  )

  return (
    <section className="map-shell" aria-label="Map visualization">
      <div className="map-meta">
        <div>
          <p className="eyebrow">Map stage</p>
          <h2>Overlap zone</h2>
        </div>
        <div className={`map-state map-state-${status}`}>
          {isLoading ? 'Recomputing route surface' : status === 'demo' ? 'Demo geometry' : 'Live overlay'}
        </div>
      </div>

      <div className="map-frame">
        <MapContainer
          className="leaflet-map"
          center={WARSAW_CENTER}
          zoom={12}
          scrollWheelZoom
          preferCanvas
          zoomControl={false}
          bounds={WARSAW_BOUNDS}
        >
          <BoundsSync featureCollection={overlayGeometry} metadata={metadata} />
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <Pane name="overlayPane" style={{ zIndex: 430 }} />
          <Pane name="sourcePane" style={{ zIndex: 440 }} />

          {overlayGeometry ? (
            <GeoJSON
              data={overlayGeometry as never}
              style={() => ({
                color: '#f1b64c',
                weight: 2,
                opacity: 0.95,
                fillColor: '#f1b64c',
                fillOpacity: 0.3,
              })}
            />
          ) : null}

          {sourcePoints.map((point) => (
            <CircleMarker
              key={point.id ?? `${point.kind}-${point.name}-${point.position.join(',')}`}
              center={[point.position[1], point.position[0]]}
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
          <div className="legend-card">
            <span className="legend-title">Legend</span>
            <div className="legend-row">
              <i className="swatch swatch-store" />
              <span>Store walking area</span>
            </div>
            <div className="legend-row">
              <i className="swatch swatch-metro" />
              <span>Metro walking area</span>
            </div>
            <div className="legend-row">
              <i className="swatch swatch-overlap" />
              <span>Intersection fill</span>
            </div>
          </div>

          <div className="legend-card legend-card-quiet">
            <span className="legend-title">View</span>
            <p>
              {metadata.note ??
                'Use the sliders to redraw the overlap between grocery access and metro access.'}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
