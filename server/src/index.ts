import { app } from "./app";
import { DEFAULT_PORT } from "./lib/constants";

const port = Number(Bun.env.PORT ?? DEFAULT_PORT);

Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`Server running on http://localhost:${port}`);
