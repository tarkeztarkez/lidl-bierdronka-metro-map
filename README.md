# Lidl Biedronka Metro Map

Warsaw-only Bun app that highlights places where both of these are true:

- walking time to the nearest Lidl or Biedronka is within `X` minutes
- walking time to the nearest metro station is within `Y` minutes

The frontend is a Vite + React map UI. The backend is a Bun + Hono API that serves cached GeoJSON overlays built from OSM data and Valhalla walking isochrones.

## Prerequisites

- `bun`
- `docker compose`

## Setup

```bash
bun install
cd frontend && bun install
```

## Run Valhalla

```bash
docker compose up -d valhalla
```

Valhalla is expected at `http://127.0.0.1:8002`.

## Refresh Data

This pulls Warsaw store and metro data from Overpass and rebuilds cached per-minute layers in `data/raw/` and `data/cache/`.

```bash
bun run refresh:data
```

Useful env vars:

- `REFRESH_CONCURRENCY=16` to control refresh parallelism
- `OVERPASS_URL` to force a single Overpass endpoint
- `OVERPASS_URLS=url1,url2,...` to provide a custom endpoint failover list

The refresh pipeline now:

- batches all minute contours for a POI into one Valhalla request
- uses worker-based union builds for the minute layers
- retries across multiple Overpass endpoints for live OSM fetches

If Overpass or Valhalla is unavailable, the backend falls back to bundled sample geometry so the UI still works, and the API marks that response as fallback data.

## Start The App

Run both backend and frontend from the repo root:

```bash
bun run dev
```

Or run them separately:

```bash
bun run dev:server
bun run dev:frontend
```

- frontend: `http://127.0.0.1:5173`
- backend: `http://127.0.0.1:3001`

## API

- `GET /api/health`
- `GET /api/metadata`
- `GET /api/overlay?storeMinutes=10&metroMinutes=8`

## Validation

These checks were used during implementation:

```bash
bun run build:server
cd frontend && bun run build
cd frontend && bun run lint
```
