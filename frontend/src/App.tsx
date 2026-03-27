import { useEffect, useMemo, useRef, useState } from 'react'
import { Controls } from './features/map/Controls'
import {
  fetchMetadata,
  fetchOverlay,
  fetchRoutes,
  isFeatureCollection,
} from './features/map/api'
import { MapView } from './features/map/MapView'
import { HIGHLIGHT_POINTS } from './features/map/highlightPoints'
import { sampleMetadata, sampleOverlay } from './features/map/sampleData'
import type {
  ApiMetadata,
  LayerVisibility,
  OverlayResponse,
  RouteOrigin,
  RoutesResponse,
} from './features/map/types'
import './App.css'

const DEFAULT_STORE_MINUTES = 12
const DEFAULT_METRO_MINUTES = 10
const DEFAULT_MILKBAR_MINUTES = 10
const MIN_OVERLAY_LOADING_MS = 350
const DEFAULT_LAYER_VISIBILITY: LayerVisibility = {
  store: true,
  metro: true,
  intersection: true,
  milkbar: true,
}

function defaultRouteDateTime() {
  const value = new Date()
  value.setDate(value.getDate() + 1)
  value.setHours(12, 0, 0, 0)

  return {
    date: value.toISOString().slice(0, 10),
    time: '12:00',
  }
}

function combineLocalDateTime(date: string, time: string) {
  return `${date}T${time}`
}

function App() {
  const initialRouteDateTime = useMemo(() => defaultRouteDateTime(), [])
  const [storeMinutes, setStoreMinutes] = useState(DEFAULT_STORE_MINUTES)
  const [metroMinutes, setMetroMinutes] = useState(DEFAULT_METRO_MINUTES)
  const [milkbarMinutes, setMilkbarMinutes] = useState(DEFAULT_MILKBAR_MINUTES)
  const [showMilkbars, setShowMilkbars] = useState(false)
  const [metadata, setMetadata] = useState<ApiMetadata | null>(null)
  const [overlay, setOverlay] = useState<OverlayResponse | null>(null)
  const [isOverlayLoading, setIsOverlayLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [metadataMessage, setMetadataMessage] = useState<string | null>(null)
  const [overlayMessage, setOverlayMessage] = useState<string | null>(null)
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>(DEFAULT_LAYER_VISIBILITY)
  const [routeOrigin, setRouteOrigin] = useState<RouteOrigin | null>(null)
  const [routeDate, setRouteDate] = useState(initialRouteDateTime.date)
  const [routeTime, setRouteTime] = useState(initialRouteDateTime.time)
  const [routes, setRoutes] = useState<RoutesResponse | null>(null)
  const [isRoutesLoading, setIsRoutesLoading] = useState(false)
  const [routeMessage, setRouteMessage] = useState<string | null>(null)
  const latestMetadataRef = useRef<ApiMetadata | null>(null)

  function beginOverlayRefresh() {
    setIsOverlayLoading(true)
    setErrorMessage(null)
    setOverlayMessage(null)
  }

  useEffect(() => {
    latestMetadataRef.current = metadata
  }, [metadata])

  useEffect(() => {
    const controller = new AbortController()
    let ignore = false

    fetchMetadata(controller.signal)
      .then((response) => {
        if (ignore) {
          return
        }

        setMetadata(response.metadata)
        setMetadataMessage(response.message ?? null)
      })
      .catch(() => {
        if (ignore) {
          return
        }

        setMetadata(sampleMetadata)
        setMetadataMessage('Backend metadata unavailable. Showing demo state.')
      })
      .finally(() => {
        if (ignore) {
          return
        }

      })

    return () => {
      ignore = true
      controller.abort()
    }
  }, [])

  const requestedMinutes = useMemo(
    () => ({ storeMinutes, metroMinutes, milkbarMinutes, showMilkbars }),
    [showMilkbars, storeMinutes, metroMinutes, milkbarMinutes],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const controller = new AbortController()
      const startedAt = window.performance.now()

      fetchOverlay(
        requestedMinutes.storeMinutes,
        requestedMinutes.metroMinutes,
        requestedMinutes.milkbarMinutes,
        requestedMinutes.showMilkbars,
        controller.signal,
      )
        .then((response) => {
          const featureCollection = isFeatureCollection(response)
            ? response
            : response.featureCollection ??
              response.geojson ??
              response.overlay ??
              null

          if (featureCollection) {
            setOverlay({
              featureCollection,
              metadata: response.metadata ?? latestMetadataRef.current ?? sampleMetadata,
              demo: response.demo ?? false,
              message: response.message ?? undefined,
            })
            setOverlayMessage(response.message ?? null)
            return
          }

          setOverlay({
            featureCollection: sampleOverlay,
            metadata: sampleMetadata,
            demo: true,
            message: 'Backend returned no overlay yet. Using demo geometry.',
          })
          setOverlayMessage('Backend returned no overlay yet. Using demo geometry.')
        })
        .catch(() => {
          setOverlay({
            featureCollection: sampleOverlay,
            metadata: sampleMetadata,
            demo: true,
            message: 'Backend unavailable. Using demo geometry.',
          })
          setErrorMessage('Backend unavailable. Using demo geometry.')
          setOverlayMessage('Backend unavailable. Using demo geometry.')
        })
        .finally(async () => {
          const elapsed = window.performance.now() - startedAt
          const remaining = Math.max(0, MIN_OVERLAY_LOADING_MS - elapsed)

          if (remaining > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, remaining))
          }

          setIsOverlayLoading(false)
        })
    }, 240)

    return () => {
      window.clearTimeout(timer)
    }
  }, [requestedMinutes])

  const selectedDepartureTime = useMemo(
    () => combineLocalDateTime(routeDate, routeTime),
    [routeDate, routeTime],
  )

  useEffect(() => {
    if (!routeOrigin) {
      setRoutes(null)
      setIsRoutesLoading(false)
      return
    }

    const controller = new AbortController()
    let ignore = false

    setIsRoutesLoading(true)
    setRouteMessage(null)

    fetchRoutes(routeOrigin, selectedDepartureTime, controller.signal)
      .then((response) => {
        if (ignore) {
          return
        }

        setRoutes(response)
        setRouteMessage(null)
      })
      .catch(() => {
        if (ignore) {
          return
        }

        setRoutes({
          origin: routeOrigin,
          departureTime: selectedDepartureTime,
          places: HIGHLIGHT_POINTS,
          results: HIGHLIGHT_POINTS.map((place) => ({
            placeId: place.id ?? place.name,
            placeName: place.name,
            modes: {
              walking: {
                mode: 'walking',
                status: 'unavailable',
                errorMessage: 'Route lookup failed.',
              },
              bicycling: {
                mode: 'bicycling',
                status: 'unavailable',
                errorMessage: 'Route lookup failed.',
              },
              transit: {
                mode: 'transit',
                status: 'unavailable',
                errorMessage: 'Route lookup failed.',
              },
            },
          })),
        })
        setRouteMessage('Route lookup unavailable. Check the backend and GOOGLE_MAPS_KEY.')
      })
      .finally(() => {
        if (ignore) {
          return
        }

        setIsRoutesLoading(false)
      })

    return () => {
      ignore = true
      controller.abort()
    }
  }, [routeOrigin, selectedDepartureTime])

  const featureCollection =
    overlay?.featureCollection ?? overlay?.geojson ?? overlay?.overlay ?? sampleOverlay

  const activeMetadata = metadata ?? overlay?.metadata ?? sampleMetadata

  function clearRouteSelection() {
    setRouteOrigin(null)
    setRoutes(null)
    setRouteMessage(null)
    setIsRoutesLoading(false)
  }

  return (
    <div className="app-shell">
      <aside className="control-rail">
        <div className="brand-block brand-block-compact">
          <h1>Warsaw Access Map</h1>
        </div>

        <Controls
          storeMinutes={storeMinutes}
          metroMinutes={metroMinutes}
          milkbarMinutes={milkbarMinutes}
          showMilkbars={showMilkbars}
          onStoreMinutesChange={(value) => {
            beginOverlayRefresh()
            setStoreMinutes(value)
          }}
          onMetroMinutesChange={(value) => {
            beginOverlayRefresh()
            setMetroMinutes(value)
          }}
          onMilkbarMinutesChange={(value) => {
            beginOverlayRefresh()
            setMilkbarMinutes(value)
          }}
          onShowMilkbarsChange={(value) => {
            beginOverlayRefresh()
            setShowMilkbars(value)
          }}
          layerVisibility={layerVisibility}
          onLayerVisibilityChange={setLayerVisibility}
          errorMessage={errorMessage}
          metadataMessage={metadataMessage}
          overlayMessage={overlayMessage}
          routeDate={routeDate}
          routeTime={routeTime}
          onRouteDateChange={setRouteDate}
          onRouteTimeChange={setRouteTime}
          isRoutesLoading={isRoutesLoading}
          routeMessage={routeMessage}
        />
      </aside>

      <main className="map-stage">
        <MapView
          featureCollection={featureCollection}
          metadata={activeMetadata}
          isLoading={isOverlayLoading}
          layerVisibility={layerVisibility}
          storeMinutes={storeMinutes}
          metroMinutes={metroMinutes}
          milkbarMinutes={milkbarMinutes}
          showMilkbars={showMilkbars}
          routeOrigin={routeOrigin}
          onRouteOriginChange={setRouteOrigin}
          onRouteOriginClear={clearRouteSelection}
          routes={routes}
          isRoutesLoading={isRoutesLoading}
        />
      </main>
    </div>
  )
}

export default App
