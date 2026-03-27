import { Hono } from "hono";

import { readRuntimeMetadata } from "../services/overlay-cache";

export const healthRoute = new Hono().get("/", async (c) => {
  const metadata = await readRuntimeMetadata();
  return c.json({
    ok: true,
    service: "lidl-bierdronka-metro-map",
    now: new Date().toISOString(),
    cacheReady: metadata.cacheReady,
  });
});
