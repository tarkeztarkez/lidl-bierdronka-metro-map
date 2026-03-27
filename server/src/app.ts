import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";

import { Hono } from "hono";
import { cors } from "hono/cors";

import { repoRoot } from "./lib/paths";
import { healthRoute } from "./routes/health";
import { metadataRoute } from "./routes/metadata";
import { overlayRoute } from "./routes/overlay";

export const app = new Hono();
const frontendDistDir = resolve(repoRoot, "frontend", "dist");
const frontendIndexPath = resolve(frontendDistDir, "index.html");
const contentTypesByExtension: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function fileHeaders(filePath: string, detectedType?: string): Record<string, string> | undefined {
  const contentType = detectedType || contentTypesByExtension[extname(filePath)];
  return contentType ? { "content-type": contentType } : undefined;
}

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
      headers: fileHeaders(requestedPath, file.type),
    });
  }

  const indexFile = Bun.file(frontendIndexPath);
  return new Response(indexFile, {
    headers: fileHeaders(frontendIndexPath, indexFile.type),
  });
});
