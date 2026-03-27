import type {
  ApiMetadata,
  GeoJsonFeatureCollection,
  LiveResponse,
  OverlayResponse,
} from './types'
import { sampleMetadata } from './sampleData'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

export interface MetadataResponse {
  metadata: ApiMetadata
  message?: string
  demo?: boolean
}

async function requestJson<T>(path: string, signal?: AbortSignal) {
  const response = await fetch(`${API_BASE}${path}`, {
    signal,
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  return (await response.json()) as T
}

export async function fetchMetadata(signal?: AbortSignal) {
  const response = await requestJson<LiveResponse | ApiMetadata>('/metadata', signal)

  if (response && typeof response === 'object' && 'metadata' in response) {
    return {
      metadata: response.metadata ?? {},
      message: response.message,
      demo: response.demo,
    } satisfies MetadataResponse
  }

  return {
    metadata: response && typeof response === 'object' && 'storeCount' in response
      ? (response as ApiMetadata)
      : sampleMetadata,
    message: undefined,
    demo: undefined,
  } satisfies MetadataResponse
}

export async function fetchOverlay(
  storeMinutes: number,
  metroMinutes: number,
  milkbarMinutes: number,
  showMilkbars: boolean,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    storeMinutes: `${storeMinutes}`,
    metroMinutes: `${metroMinutes}`,
    milkbarMinutes: `${milkbarMinutes}`,
    showMilkbars: `${showMilkbars}`,
  })

  return requestJson<OverlayResponse>(`/overlay?${params.toString()}`, signal)
}

export function isFeatureCollection(
  value: unknown,
): value is GeoJsonFeatureCollection {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as GeoJsonFeatureCollection).type === 'FeatureCollection',
  )
}
