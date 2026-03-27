import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { Hono } from "hono";
import { cors } from "hono/cors";

import { repoRoot } from "./lib/paths";
import { healthRoute } from "./routes/health";
import { metadataRoute } from "./routes/metadata";
import { overlayRoute } from "./routes/overlay";

export const app = new Hono();
const frontendDistDir = resolve(repoRoot, "frontend", "dist");
const frontendIndexPath = resolve(frontendDistDir, "index.html");

app.use("*", cors());

app.route("/api/health", healthRoute);
app.route("/api/metadata", metadataRoute);
app.route("/api/overlay", overlayRoute);

app.get("/healthz", (c) =>
  c.json({
    ok: true,
  }),
);

app.get("*", async (c) => {
  if (!existsSync(frontendIndexPath)) {
    return c.json({
      service: "lidl-bierdronka-metro-map",
      routes: ["/api/health", "/api/metadata", "/api/overlay"],
    });
  }

  const url = new URL(c.req.url);
  const requestedPath = url.pathname === "/"
    ? frontendIndexPath
    : resolve(frontendDistDir, `.${url.pathname}`);

  if (requestedPath.startsWith(frontendDistDir) && existsSync(requestedPath)) {
    const file = Bun.file(requestedPath);
    return new Response(file, {
      headers: file.type ? { "content-type": file.type } : undefined,
    });
  }

  const indexFile = Bun.file(frontendIndexPath);
  return new Response(indexFile, {
    headers: indexFile.type ? { "content-type": indexFile.type } : undefined,
  });
});
