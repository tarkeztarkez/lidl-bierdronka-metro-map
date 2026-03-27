import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { repoRoot, serverRoot } from "../lib/paths";

type RouteMode = "walking" | "bicycling" | "transit";
type TransitIcon = "bus" | "tram" | "metro" | "train";

export interface FixedRoutePlace {
  id: "verestro" | "buw" | "campus";
  name: string;
  letter: "V" | "B" | "C";
  kind: "store" | "milkbar" | "metro";
  position: [number, number];
  note: string;
}

export interface TransitAgency {
  name: string;
  url?: string;
}

export interface TransitSegment {
  icon: TransitIcon;
  lineLabel: string;
  headsign?: string;
  agency?: TransitAgency;
}

export interface RouteModeResult {
  mode: RouteMode;
  status: "ok" | "unavailable";
  durationText?: string;
  durationSeconds?: number;
  routePolyline?: string;
  transitSegments?: TransitSegment[];
  agencies?: TransitAgency[];
  warnings?: string[];
  errorMessage?: string;
}

export interface RoutePlaceResult {
  placeId: FixedRoutePlace["id"];
  placeName: string;
  modes: Record<RouteMode, RouteModeResult>;
}

export interface RoutesPayload {
  origin: {
    lat: number;
    lng: number;
  };
  departureTime: string;
  places: FixedRoutePlace[];
  results: RoutePlaceResult[];
}

interface GoogleDirectionsResponse {
  status?: string;
  error_message?: string;
  routes?: Array<{
    warnings?: string[];
    overview_polyline?: {
      points?: string;
    };
    legs?: Array<{
      duration?: {
        text?: string;
        value?: number;
      };
      steps?: Array<{
        travel_mode?: string;
        transit_details?: {
          headsign?: string;
          line?: {
            name?: string;
            short_name?: string;
            agencies?: Array<{
              name?: string;
              url?: string;
            }>;
            vehicle?: {
              type?: string;
            };
          };
        };
      }>;
    }>;
  }>;
}

type GoogleDirectionsRoute = NonNullable<GoogleDirectionsResponse["routes"]>[number];
type GoogleDirectionsLeg = NonNullable<GoogleDirectionsRoute["legs"]>[number];
type GoogleDirectionsStep = NonNullable<GoogleDirectionsLeg["steps"]>[number];

const GOOGLE_DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";
const ROUTE_CACHE_TTL_MS = 60_000;
let cachedGoogleMapsKey: string | null | undefined;

export const FIXED_ROUTE_PLACES: FixedRoutePlace[] = [
  {
    id: "verestro",
    name: "Verestro",
    letter: "V",
    kind: "store",
    position: [21.0683828, 52.2764119],
    note: "Promienna 10",
  },
  {
    id: "buw",
    name: "BUW",
    letter: "B",
    kind: "milkbar",
    position: [21.0250683, 52.2426428],
    note: "Dobra 56/66",
  },
  {
    id: "campus",
    name: "Campus",
    letter: "C",
    kind: "metro",
    position: [21.0202847, 52.2406626],
    note: "Krakowskie Przedmieście 26/28",
  },
];

const cache = new Map<string, { expiresAt: number; value: RouteModeResult }>();

function readEnvFileValue(filePath: string, key: string) {
  if (!existsSync(filePath)) {
    return null;
  }

  const contents = readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const currentKey = line.slice(0, separatorIndex).trim();
    if (currentKey !== key) {
      continue;
    }

    return line.slice(separatorIndex + 1).trim();
  }

  return null;
}

function getGoogleMapsKey() {
  if (cachedGoogleMapsKey !== undefined) {
    return cachedGoogleMapsKey;
  }

  cachedGoogleMapsKey = Bun.env.GOOGLE_MAPS_KEY
    ?? readEnvFileValue(join(serverRoot, ".env"), "GOOGLE_MAPS_KEY")
    ?? readEnvFileValue(join(repoRoot, ".env"), "GOOGLE_MAPS_KEY")
    ?? null;

  return cachedGoogleMapsKey;
}

function buildCacheKey(
  origin: { lat: number; lng: number },
  destination: FixedRoutePlace,
  mode: RouteMode,
  departureTime: string,
) {
  const timeBucket = mode === "transit" ? departureTime.slice(0, 16) : "static";
  return [
    origin.lat.toFixed(5),
    origin.lng.toFixed(5),
    destination.id,
    mode,
    timeBucket,
  ].join(":");
}

function getCachedValue(key: string) {
  const item = cache.get(key);

  if (!item) {
    return null;
  }

  if (item.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return item.value;
}

function setCachedValue(key: string, value: RouteModeResult) {
  cache.set(key, {
    expiresAt: Date.now() + ROUTE_CACHE_TTL_MS,
    value,
  });
}

function mapVehicleType(type?: string): TransitIcon {
  switch (type) {
    case "SUBWAY":
    case "METRO_RAIL":
      return "metro";
    case "TRAM":
      return "tram";
    case "BUS":
    case "INTERCITY_BUS":
    case "TROLLEYBUS":
    case "SHARE_TAXI":
      return "bus";
    default:
      return "train";
  }
}

function uniqueAgencies(agencies: TransitAgency[]) {
  const seen = new Set<string>();
  return agencies.filter((agency) => {
    const key = `${agency.name}:${agency.url ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeTransitSegments(
  steps?: GoogleDirectionsStep[],
) {
  const segments: TransitSegment[] = [];
  const agencies: TransitAgency[] = [];

  for (const step of steps ?? []) {
    const details = step.transit_details;
    if (!details?.line) {
      continue;
    }

    const agency = details.line.agencies?.[0]?.name
      ? {
          name: details.line.agencies[0].name,
          url: details.line.agencies[0].url,
        }
      : undefined;

    if (agency) {
      agencies.push(agency);
    }

    segments.push({
      icon: mapVehicleType(details.line.vehicle?.type),
      lineLabel: details.line.short_name || details.line.name || "?",
      headsign: details.headsign,
      agency,
    });
  }

  return {
    segments,
    agencies: uniqueAgencies(agencies),
  };
}

function unavailableResult(mode: RouteMode, errorMessage: string): RouteModeResult {
  return {
    mode,
    status: "unavailable",
    errorMessage,
  };
}

async function requestDirections(
  origin: { lat: number; lng: number },
  destination: FixedRoutePlace,
  mode: RouteMode,
  departureTime: string,
): Promise<RouteModeResult> {
  const apiKey = getGoogleMapsKey();

  if (!apiKey) {
    return unavailableResult(mode, "Google Maps key is not configured.");
  }

  const cacheKey = buildCacheKey(origin, destination, mode, departureTime);
  const cached = getCachedValue(cacheKey);
  if (cached) {
    return cached;
  }

  const params = new URLSearchParams({
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.position[1]},${destination.position[0]}`,
    mode,
    key: apiKey,
  });

  if (mode === "transit") {
    const departureDate = new Date(departureTime);
    params.set("departure_time", `${Math.floor(departureDate.getTime() / 1000)}`);
  }

  const response = await fetch(`${GOOGLE_DIRECTIONS_URL}?${params.toString()}`);
  if (!response.ok) {
    return unavailableResult(mode, `Google request failed with status ${response.status}.`);
  }

  const data = await response.json() as GoogleDirectionsResponse;
  if (data.status !== "OK" || !data.routes?.length) {
    return unavailableResult(mode, data.error_message || data.status || "No route available.");
  }

  const route = data.routes[0];
  if (!route) {
    return unavailableResult(mode, "No route available.");
  }

  const leg = route.legs?.[0];
  const base: RouteModeResult = {
    mode,
    status: "ok",
    durationText: leg?.duration?.text,
    durationSeconds: leg?.duration?.value,
    routePolyline: route.overview_polyline?.points,
    warnings: route.warnings?.filter(Boolean),
  };

  const normalized = mode === "transit"
    ? {
        ...base,
        ...normalizeTransitSegments(leg?.steps),
      }
    : base;

  setCachedValue(cacheKey, normalized);
  return normalized;
}

export async function computeRoutes(
  origin: { lat: number; lng: number },
  departureTime: string,
): Promise<RoutesPayload> {
  const results = await Promise.all(
    FIXED_ROUTE_PLACES.map(async (place) => {
      const [walking, bicycling, transit] = await Promise.all([
        requestDirections(origin, place, "walking", departureTime),
        requestDirections(origin, place, "bicycling", departureTime),
        requestDirections(origin, place, "transit", departureTime),
      ]);

      return {
        placeId: place.id,
        placeName: place.name,
        modes: {
          walking,
          bicycling,
          transit,
        },
      } satisfies RoutePlaceResult;
    }),
  );

  return {
    origin,
    departureTime,
    places: FIXED_ROUTE_PLACES,
    results,
  };
}
