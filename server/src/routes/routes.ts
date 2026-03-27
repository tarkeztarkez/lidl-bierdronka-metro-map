import { Hono } from "hono";
import { z } from "zod";

import { computeRoutes } from "../services/google-routes";

const querySchema = z.object({
  originLat: z.coerce.number().min(-90).max(90),
  originLng: z.coerce.number().min(-180).max(180),
  departureTime: z.string().min(1),
});

export const routesRoute = new Hono().get("/", async (c) => {
  const parsed = querySchema.safeParse({
    originLat: c.req.query("originLat"),
    originLng: c.req.query("originLng"),
    departureTime: c.req.query("departureTime"),
  });

  if (!parsed.success) {
    return c.json(
      {
        error: "Invalid query parameters",
        issues: parsed.error.issues,
      },
      400,
    );
  }

  const departureDate = new Date(parsed.data.departureTime);
  if (Number.isNaN(departureDate.getTime())) {
    return c.json(
      {
        error: "Invalid departureTime",
      },
      400,
    );
  }

  const payload = await computeRoutes(
    {
      lat: parsed.data.originLat,
      lng: parsed.data.originLng,
    },
    parsed.data.departureTime,
  );

  return c.json(payload);
});
