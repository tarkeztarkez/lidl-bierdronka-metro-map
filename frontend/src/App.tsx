import { useEffect, useMemo, useRef, useState } from 'react'
import { Controls } from './features/map/Controls'
import {
  fetchMetadata,
  fetchOverlay,
  isFeatureCollection,
} from './features/map/api'
import { MapView } from './features/map/MapView'
import { sampleMetadata, sampleOverlay } from './features/map/sampleData'
import type {
  ApiMetadata,
  OverlayResponse,
} from './features/map/types'
import './App.css'

const DEFAULT_STORE_MINUTES = 12
const DEFAULT_METRO_MINUTES = 10

function App() {
  const [storeMinutes, setStoreMinutes] = useState(DEFAULT_STORE_MINUTES)
  const [metroMinutes, setMetroMinutes] = useState(DEFAULT_METRO_MINUTES)
  const [metadata, setMetadata] = useState<ApiMetadata | null>(null)
  const [overlay, setOverlay] = useState<OverlayResponse | null>(null)
  const [isMetadataLoading, setIsMetadataLoading] = useState(true)
  const [isOverlayLoading, setIsOverlayLoading] = useState(true)
  const [status, setStatus] = useState<'loading' | 'live' | 'demo' | 'error'>(
    'loading',
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [metadataMessage, setMetadataMessage] = useState<string | null>(null)
  const [overlayMessage, setOverlayMessage] = useState<string | null>(null)
  const latestMetadataRef = useRef<ApiMetadata | null>(null)

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

        setIsMetadataLoading(false)
      })

    return () => {
      ignore = true
      controller.abort()
    }
  }, [])

  const requestedMinutes = useMemo(
    () => ({ storeMinutes, metroMinutes }),
    [storeMinutes, metroMinutes],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const controller = new AbortController()
      setIsOverlayLoading(true)
      setErrorMessage(null)
      setOverlayMessage(null)
      setStatus('loading')

      fetchOverlay(
        requestedMinutes.storeMinutes,
        requestedMinutes.metroMinutes,
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
            setStatus(response.demo ? 'demo' : 'live')
            setOverlayMessage(response.message ?? null)
            return
          }

          setOverlay({
            featureCollection: sampleOverlay,
            metadata: sampleMetadata,
            demo: true,
            message: 'Backend returned no overlay yet. Using demo geometry.',
          })
          setStatus('demo')
          setOverlayMessage('Backend returned no overlay yet. Using demo geometry.')
        })
        .catch(() => {
          setOverlay({
            featureCollection: sampleOverlay,
            metadata: sampleMetadata,
            demo: true,
            message: 'Backend unavailable. Using demo geometry.',
          })
          setStatus('demo')
          setErrorMessage('Backend unavailable. Using demo geometry.')
          setOverlayMessage('Backend unavailable. Using demo geometry.')
        })
        .finally(() => {
          setIsOverlayLoading(false)
        })
    }, 240)

    return () => {
      window.clearTimeout(timer)
    }
  }, [requestedMinutes])

  const featureCollection =
    overlay?.featureCollection ?? overlay?.geojson ?? overlay?.overlay ?? sampleOverlay

  const activeMetadata = metadata ?? overlay?.metadata ?? sampleMetadata

  return (
    <div className="app-shell">
      <aside className="control-rail">
        <div className="brand-block">
          <p className="eyebrow">Warsaw access diagram</p>
          <h1>Lidl, Biedronka, Metro</h1>
          <p className="lede">
            Highlight the overlap between walking reach for grocery stops and metro
            stations. The backend can swap in real OSM and Valhalla data without
            changing the UI contract.
          </p>
        </div>

        <Controls
          storeMinutes={storeMinutes}
          metroMinutes={metroMinutes}
          onStoreMinutesChange={setStoreMinutes}
          onMetroMinutesChange={setMetroMinutes}
          metadata={activeMetadata}
          isMetadataLoading={isMetadataLoading}
          isOverlayLoading={isOverlayLoading}
          status={status}
          errorMessage={errorMessage}
          metadataMessage={metadataMessage}
          overlayMessage={overlayMessage}
        />

        <section className="status-card">
          <div className="status-grid">
            <div>
              <span className="status-label">Overlay state</span>
              <strong className="status-value">{status.toUpperCase()}</strong>
            </div>
            <div>
              <span className="status-label">Store minutes</span>
              <strong className="status-value">{storeMinutes} min</strong>
            </div>
            <div>
              <span className="status-label">Metro minutes</span>
              <strong className="status-value">{metroMinutes} min</strong>
            </div>
            <div>
              <span className="status-label">Sources</span>
              <strong className="status-value">
                {activeMetadata.storeCount ?? '—'} stores /{' '}
                {activeMetadata.metroCount ?? '—'} metro
              </strong>
            </div>
          </div>

          <div className="status-note">
            <span className="status-label">Refresh</span>
            <p>
              {activeMetadata.refreshedAt
                ? `Last rebuild ${new Date(activeMetadata.refreshedAt).toLocaleString()}`
                : 'Waiting for cached overlay metadata from the backend.'}
            </p>
          </div>
        </section>
      </aside>

      <main className="map-stage">
        <MapView
          featureCollection={featureCollection}
          metadata={activeMetadata}
          isLoading={isOverlayLoading}
          status={status}
        />
      </main>
    </div>
  )
}

export default App
