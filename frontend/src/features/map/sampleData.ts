import type { ApiMetadata, GeoJsonFeatureCollection } from './types'

export const sampleOverlay: GeoJsonFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'demo-intersection',
      properties: {
        label: 'Demo overlap',
        kind: 'intersection',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [21.001, 52.228],
            [21.033, 52.2285],
            [21.038, 52.242],
            [21.012, 52.2485],
            [20.999, 52.238],
            [21.001, 52.228],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'demo-core',
      properties: {
        label: 'Inner corridor',
        kind: 'intersection',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [20.992, 52.232],
            [21.02, 52.2315],
            [21.025, 52.241],
            [21.0, 52.243],
            [20.992, 52.232],
          ],
        ],
      },
    },
  ],
}

export const sampleMetadata: ApiMetadata = {
  refreshedAt: new Date().toISOString(),
  storeCount: 28,
  metroCount: 25,
  storeMinutesRange: [1, 30],
  metroMinutesRange: [1, 30],
  bounds: [20.95, 52.2, 21.07, 52.28],
  source: 'demo',
  note: 'Front-end demo geometry used until the backend starts returning cached OSM layers.',
  storePoints: [
    {
      id: 'lidl-demo-1',
      name: 'Lidl demo',
      kind: 'store',
      position: [21.0095, 52.2304],
    },
    {
      id: 'biedronka-demo-1',
      name: 'Biedronka demo',
      kind: 'store',
      position: [21.0212, 52.2371],
    },
  ],
  metroPoints: [
    {
      id: 'metro-demo-1',
      name: 'Metro demo',
      kind: 'metro',
      position: [21.012, 52.2318],
    },
    {
      id: 'metro-demo-2',
      name: 'Metro demo',
      kind: 'metro',
      position: [21.0315, 52.2416],
    },
  ],
}
