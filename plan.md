# Build a Warsaw walking-access map for Lidl/Biedronka and Metro

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

## Purpose / Big Picture

Build a Bun-based web app for Warsaw that shows a map overlay of places where both of these conditions are true at the same time:

1. Walking time to the nearest `Lidl` or `Biedronka` is at most `X` minutes.
2. Walking time to the nearest Warsaw metro station is at most `Y` minutes.

The user experience for v1 is map-first. There is no apartment marker, polygon drawing, or district picker yet. The user opens the app, adjusts two walking-time controls, and sees the overlap area highlighted on the map.

Success is observable when:

- The app starts locally with Bun commands only.
- The map opens centered on Warsaw.
- The user can change two walking-time controls.
- The app redraws a shaded GeoJSON overlay showing the intersection of the two walking-access areas.
- A manual refresh command can re-fetch OSM data and rebuild the cached overlay data.

## Progress

- [x] (2026-03-27 13:41Z) Clarified v1 scope with the user: Warsaw-only, map-first UI, real walking-time logic, OSM-backed data, single Bun project, manual refresh flow.
- [x] (2026-03-27 13:48Z) Scaffolded the Bun project with a Vite React frontend, Bun/Hono backend, shared TypeScript config, and root dev/build scripts.
- [x] (2026-03-27 13:52Z) Implemented the refresh pipeline, OSM normalization, Valhalla client, and cached minute-layer generation under `server/` and `data/`.
- [x] (2026-03-27 13:54Z) Implemented metadata, health, and overlay API endpoints, including frontend-friendly metadata for bounds and source points.
- [x] (2026-03-27 13:56Z) Implemented the map-first frontend with sliders, legend, status cards, demo fallback behavior, and Leaflet overlay rendering.
- [x] (2026-03-27 13:57Z) Validated backend typecheck, frontend build/lint, live API smoke tests on port 3011, and documented setup/refresh/run steps in `README.md`.

## Surprises & Discoveries

- Observation: The repository is empty, so the plan must define the full initial project structure instead of fitting into an existing codebase.
  Evidence: `ls -la` in `/home/tarkeztarkez/Projects/lidl-bierdronka-metro-map` showed only `.` and `..`.
- Observation: The user explicitly dropped the original "show where my apartment could be" interaction from v1 and wants only the highlighted areas on the map.
  Evidence: User answer to the `Area Input` question said: `just show me a map with those areas highlighted. No need for apartment highlighting yet`.
- Observation: There was already another process bound to port `3001`, so validation of the current backend had to be done on port `3011`.
  Evidence: Starting `server/src/index.ts` on the default port returned `EADDRINUSE`, while `PORT=3011 bun run src/index.ts` started successfully and served the expected API responses.
- Observation: Root repo scripts could not rely on `bun --cwd ... run ...` inside `package.json`; changing them to `cd <dir> && bun run ...` made the contract work reliably.
  Evidence: Initial `bun run build:server` and related root scripts printed Bun CLI usage instead of running the intended package scripts.

## Decision Log

- Decision: Use a single Bun-managed repository with a React + TypeScript frontend and a Bun + Hono backend.
  Rationale: This keeps setup simple while still allowing a real server-side preprocessing and caching pipeline.
  Date/Author: 2026-03-27 / Codex
- Decision: Warsaw-only scope for v1, with OSM as the source of truth for stores and metro stations.
  Rationale: Geographic scope must stay narrow for the first iteration, and the user explicitly requested Warsaw only.
  Date/Author: 2026-03-27 / Codex
- Decision: Use a manual refresh pipeline that fetches live OSM data and rebuilds local cached artifacts.
  Rationale: This matches the user's preference for OSM-backed data without forcing live external queries on every UI change.
  Date/Author: 2026-03-27 / Codex
- Decision: Precompute per-minute reachable-area unions for stores and metro separately, then intersect those cached layers on demand.
  Rationale: Recomputing travel-time geometry for every slider change would be too slow; caching minute-indexed unions makes the UI responsive.
  Date/Author: 2026-03-27 / Codex
- Decision: Use a local Valhalla service in Docker for walking isochrones during refresh.
  Rationale: Real walking-time coverage is required, and public routing APIs are a poor fit for repeated bulk recomputation and rate-limit-free local development.
  Date/Author: 2026-03-27 / Codex
- Decision: Support walking-time controls from 1 to 30 minutes in 1-minute increments for v1.
  Rationale: This gives a useful, intuitive UI while keeping the cached minute layers bounded.
  Date/Author: 2026-03-27 / Codex

## Outcomes & Retrospective

The repo now contains a working Warsaw accessibility map app with a Bun/Hono backend, a Vite/React/Leaflet frontend, OSM-backed refresh logic, and cached overlay generation. The strongest part of the implementation is the runtime contract: the browser stays simple, and the backend owns normalization, caching, and intersection generation.

What was cut: no apartment search interaction, no district picker, no automatic background refresh, and no deduplication or station-grouping sophistication beyond the current normalization path. The metro/stores lists can therefore be denser than ideal when raw OSM data contains many entrances.

What still feels fragile: full refreshes can take time because the isochrone build fans out across many minute thresholds, and development environments may already have something bound to port `3001`. The UI is resilient because it supports demo fallback data, but production-hardening would need stricter POI deduplication and better operational handling around refresh jobs.

## Context and Orientation

This repository starts empty. The implementation should create a straightforward single-repo structure:

- `package.json`: root Bun scripts and workspace-style command entrypoints.
- `tsconfig.json`: shared TypeScript settings.
- `frontend/`: React application responsible for the map and user controls.
- `frontend/src/main.tsx`: browser entrypoint.
- `frontend/src/App.tsx`: top-level app shell.
- `frontend/src/features/map/`: map widget, overlay layer, and UI controls.
- `server/`: Bun/Hono API and refresh pipeline.
- `server/src/index.ts`: HTTP server entrypoint.
- `server/src/routes/`: HTTP routes for config, status, and overlay GeoJSON.
- `server/src/services/osm.ts`: OSM/Overpass fetch and normalization logic.
- `server/src/services/valhalla.ts`: Valhalla client for walking isochrone generation.
- `server/src/services/overlay-cache.ts`: union/intersection cache logic and artifact persistence.
- `server/src/lib/geo.ts`: Turf-based geometry utilities.
- `data/raw/`: downloaded source data used during refresh.
- `data/cache/`: generated GeoJSON artifacts indexed by minute thresholds.
- `docker-compose.yml`: local Valhalla service.
- `README.md`: setup, refresh, and run instructions.

The frontend should not compute routing geometry itself. The backend owns all expensive GIS work and serves already-prepared GeoJSON overlays. This keeps the browser responsive and the logic testable.

Key domain terms:

- `POI`: a point of interest, here meaning Lidl, Biedronka, or a Warsaw metro station.
- `Isochrone`: a polygon representing all places reachable on foot within a time limit from a given POI.
- `Union layer`: one merged polygon or multipolygon that combines all reachable areas for one category at one minute threshold.
- `Intersection layer`: the overlap between the store union layer and the metro union layer for the chosen thresholds.

## Plan of Work

Milestone 1 creates the application skeleton and the local development contract. Use Bun at the repo root. The frontend should be a React + TypeScript app, ideally Vite-powered because it works cleanly with Bun. The backend should be a small Hono server running on Bun. Start both via Bun scripts so the user has a small command surface.

Milestone 2 builds the data-refresh pipeline. The backend should expose or reuse a CLI command such as `bun run refresh:data`. This command should:

1. Fetch Warsaw Lidl and Biedronka locations from Overpass.
2. Fetch Warsaw metro station locations from Overpass.
3. Normalize those results into internal GeoJSON files in `data/raw/`.
4. For each POI and each minute from `1..30`, ask Valhalla for a walking isochrone.
5. Union all store isochrones by minute and persist them.
6. Union all metro isochrones by minute and persist them.
7. Record metadata such as refresh timestamp, POI counts, bbox, and supported minute range.

Milestone 3 builds the runtime API. The main endpoint should accept `storeMinutes` and `metroMinutes`, load the corresponding cached layers from `data/cache/`, intersect them with Turf, and return a GeoJSON feature collection plus metadata. This keeps runtime fast and deterministic.

Milestone 4 builds the frontend. The app should center on Warsaw, render an OSM-based map, expose two minute sliders, show counts and current thresholds, request the overlay GeoJSON when values change, and render the result as a semi-transparent filled polygon. Show store markers and metro markers behind a simple toggle or leave them always visible if performance stays acceptable.

Milestone 5 covers validation and documentation. Confirm that the overlay changes when thresholds change, that refresh artifacts can be regenerated safely, and that the README is enough for a new contributor to bring the project up from zero.

## Concrete Steps

1. Scaffold the repo.

   Working directory: `/home/tarkeztarkez/Projects/lidl-bierdronka-metro-map`

   Commands:

       bun init
       bun create vite frontend --template react-ts
       bun add hono zod @turf/turf
       bun add -d concurrently typescript @types/bun

   Expected result: root `package.json`, TypeScript config, and `frontend/` app exist.

2. Create backend source files and Bun scripts.

   Commands:

       mkdir -p server/src/routes server/src/services server/src/lib data/raw data/cache

   Expected result: API source tree exists and root scripts include at least `dev`, `dev:frontend`, `dev:server`, `refresh:data`, and `build`.

3. Add local Valhalla service definition.

   Files to create or edit:

   - `docker-compose.yml`
   - `.env.example`
   - `server/src/services/valhalla.ts`

   Expected result: `docker compose up valhalla` starts a local routing service reachable from the backend.

4. Implement OSM fetch and normalization.

   Files:

   - `server/src/services/osm.ts`
   - `server/src/services/refresh.ts`

   Behavior:

   - Query Overpass for Warsaw-admin-area Lidl/Biedronka POIs.
   - Query Overpass for Warsaw metro entrances or stations and normalize to station points.
   - Persist normalized GeoJSON artifacts to `data/raw/stores.geojson` and `data/raw/metro.geojson`.

5. Implement cached minute layers.

   Files:

   - `server/src/services/overlay-cache.ts`
   - `server/src/lib/geo.ts`

   Behavior:

   - For each minute `1..30`, generate a unioned store multipolygon.
   - For each minute `1..30`, generate a unioned metro multipolygon.
   - Persist to predictable files such as `data/cache/store-05.geojson`, `data/cache/metro-12.geojson`, and `data/cache/metadata.json`.

6. Implement runtime API.

   Files:

   - `server/src/index.ts`
   - `server/src/routes/overlay.ts`
   - `server/src/routes/health.ts`

   Endpoints:

   - `GET /api/health`
   - `GET /api/metadata`
   - `GET /api/overlay?storeMinutes=10&metroMinutes=8`

   Expected result: the overlay endpoint returns valid GeoJSON and a small metadata block.

7. Implement frontend UI and map rendering.

   Files:

   - `frontend/src/App.tsx`
   - `frontend/src/features/map/MapView.tsx`
   - `frontend/src/features/map/Controls.tsx`
   - `frontend/src/features/map/api.ts`

   Behavior:

   - Show a map centered on Warsaw.
   - Show two sliders with live labels.
   - Debounce network calls when sliders move.
   - Render returned intersection GeoJSON with visible fill and border styling.
   - Surface loading and empty-result states clearly.

8. Document setup and refresh workflow.

   Files:

   - `README.md`

   Include:

   - prerequisites (`bun`, `docker compose`)
   - first-time setup
   - how to run Valhalla
   - how to rebuild data
   - how to start frontend and backend

## Validation and Acceptance

Validation must prove behavior, not just file creation.

Backend validation:

- `bun run refresh:data` completes without throwing and writes:
  - `data/raw/stores.geojson`
  - `data/raw/metro.geojson`
  - minute-indexed files in `data/cache/`
  - `data/cache/metadata.json`
- `GET /api/metadata` returns Warsaw bbox, last refresh timestamp, POI counts, and supported minute range.
- `GET /api/overlay?storeMinutes=10&metroMinutes=10` returns valid GeoJSON, even if empty.
- Invalid inputs such as `0`, `31`, or non-numeric values return HTTP `400`.

Frontend validation:

- Opening the app shows a Warsaw map and visible controls.
- Moving the `storeMinutes` slider changes the request and overlay.
- Moving the `metroMinutes` slider changes the request and overlay.
- When no overlap exists, the UI shows a clear empty-result message instead of failing silently.
- Reloading the page preserves sane defaults even if no cached browser state exists.

Acceptance demo:

1. Start Valhalla.
2. Run the refresh command once.
3. Start the app.
4. Set `storeMinutes=10`, `metroMinutes=10`.
5. Observe a non-empty or empty-but-valid overlay on Warsaw.
6. Change one slider to a larger value and confirm the highlighted area grows or stays the same, never shrinking unexpectedly for a larger threshold in the same category.

## Idempotence and Recovery

- `bun run refresh:data` must be safe to re-run. It should overwrite generated cache files atomically: write to temp files first, then rename into place.
- If Overpass fails, keep the previous successful cache in `data/cache/` and return a non-zero exit code without deleting working artifacts.
- If Valhalla is unavailable, fail fast with a clear message describing how to start `docker compose up valhalla`.
- If union/intersection geometry fails on a malformed shape, log the offending POI identifier and continue the run if possible; otherwise preserve the previous cache and fail cleanly.
- Runtime API handlers must never mutate cached source files.
- If the frontend receives an API error, it should keep the last good overlay visible and show an error notice.

## Artifacts and Notes

Expected generated artifacts:

- `data/raw/stores.geojson`
- `data/raw/metro.geojson`
- `data/cache/store-01.geojson` through `data/cache/store-30.geojson`
- `data/cache/metro-01.geojson` through `data/cache/metro-30.geojson`
- `data/cache/metadata.json`

Useful implementation notes:

- Use Overpass queries limited to the administrative boundary of Warsaw to avoid nearby municipalities leaking into results.
- Normalize chain names so the store set is exactly `Lidl` plus `Biedronka`, regardless of OSM tag variations.
- Metro data should be deduplicated to station-level points where possible; if only entrances are available, cluster them into a single representative point per station before generating isochrones.
- Use Turf operations carefully. `union` across many polygons can be slow and brittle, so union in batches and persist intermediate results when needed.
- Runtime intersection should use already-unioned layers, not raw per-POI shapes.

## Interfaces and Dependencies

Core dependencies:

- `bun`: package/runtime manager and backend runtime.
- `react` and `react-dom`: frontend UI.
- `vite`: frontend dev/build tooling.
- `hono`: Bun HTTP server.
- `zod`: query validation for API inputs.
- `@turf/turf`: union, intersection, bbox, dissolve, and GeoJSON helpers.
- A React map library. Prefer `maplibre-gl` with `react-map-gl/maplibre` if setup stays clean; fall back to `leaflet` + `react-leaflet` if polygon rendering proves simpler.
- `docker compose`: local Valhalla lifecycle.

Stable interfaces to define:

- `OverlayQuery = { storeMinutes: number; metroMinutes: number }`
- `OverlayResponse = { featureCollection: GeoJSON.FeatureCollection; metadata: { storeMinutes: number; metroMinutes: number; generatedAt: string; sourceRefreshAt: string } }`
- `RefreshMetadata = { city: "Warsaw"; storeCount: number; metroCount: number; generatedAt: string; supportedMinutes: { min: 1; max: 30 } }`
- `refreshData(): Promise<RefreshMetadata>`
- `buildMinuteLayers(input: RefreshSourceData): Promise<void>`
- `loadOverlay(query: OverlayQuery): Promise<OverlayResponse>`

Operational dependency contract:

- The backend assumes Valhalla is reachable at a configurable URL such as `http://localhost:8002`.
- The frontend assumes the backend serves `/api/*` from the same origin in production and a configured proxy in development.

## Change Log Note

Initial plan created after requirements grilling. It resolves the open architectural decisions by choosing a Bun + React + Hono stack, a manual OSM refresh pipeline, and local Valhalla-backed walking isochrones for Warsaw-only v1.
