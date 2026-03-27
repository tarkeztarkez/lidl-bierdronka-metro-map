import { Hono } from "hono";
import { cors } from "hono/cors";

import { healthRoute } from "./routes/health";
import { metadataRoute } from "./routes/metadata";
import { overlayRoute } from "./routes/overlay";

export const app = new Hono();

app.use("*", cors());

app.route("/api/health", healthRoute);
app.route("/api/metadata", metadataRoute);
app.route("/api/overlay", overlayRoute);

app.get("/", (c) =>
  c.json({
    service: "lidl-bierdronka-metro-map",
    routes: ["/api/health", "/api/metadata", "/api/overlay"],
  }),
);
