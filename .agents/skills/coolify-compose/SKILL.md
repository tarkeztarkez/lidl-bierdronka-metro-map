---
name: coolify-compose
description: Create or update Docker Compose files for Coolify deployments. Use when a project needs a Coolify-ready compose setup, Coolify magic environment variables such as SERVICE_URL_<IDENTIFIER>_<PORT>, service exposure rules, or guidance on simplifying compose files for Coolify-managed routing.
---

# Coolify Compose

Write Docker Compose files for Coolify using Coolify's built-in compose conventions, not generic reverse-proxy boilerplate.

## Default approach

1. Prefer the smallest possible service graph.
2. Avoid adding nginx, Traefik labels, or extra proxy containers unless the app genuinely needs them.
3. If one runtime can serve both API and frontend, prefer a single service.
4. Treat Coolify as the public entrypoint. Let Coolify expose the app instead of publishing host ports unless the user explicitly wants direct host binding.

## Exposure rules

- For standard Coolify Docker Compose apps, prefer magic environment variables like:
  - `SERVICE_URL_APP_3001`
  - `SERVICE_URL_API_8080=/api`
- The suffix port must match the container's internal listening port.
- Use a simple identifier such as `APP`, `WEB`, or `API`.
- If the identifier needs multiple words, prefer hyphens over underscores when combined with port-based variables.
- Do not add manual Traefik labels when the normal `SERVICE_URL_*` variables are sufficient.

## Compose patterns

### Single-service app

Use this when one container serves everything:

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      - PORT=3001
      - SERVICE_URL_APP_3001
```

### Multi-service app

Use this when services are intentionally separate:

```yaml
services:
  api:
    environment:
      - PORT=8080
      - SERVICE_URL_API_8080=/api

  web:
    environment:
      - PORT=3000
      - SERVICE_URL_WEB_3000
```

## Authoring checklist

- Confirm which port each service actually listens on inside the container.
- Make the Coolify `SERVICE_URL_*` variable match that internal port.
- Remove unnecessary `ports:` blocks unless direct host exposure is required.
- Remove custom proxy labels unless the deployment specifically needs raw Traefik behavior.
- Keep volumes, restart policy, and env vars minimal and app-specific.
- If the repo contains prebuilt cache/data required at runtime, ensure the Docker image copies it and does not depend on startup refresh jobs unless requested.

## Validation

After editing a Coolify compose file:

1. Run `docker compose -f <file> config`.
2. Check that every `SERVICE_URL_*_<PORT>` port matches the container's actual listening port.
3. Check the runtime image/command path still serves the app correctly.
4. If the app serves static assets itself, verify the container includes the built frontend output.

## Common mistakes

- Using `SERVICE_FQDN_*_<PORT>` for standard compose exposure instead of `SERVICE_URL_*_<PORT>`.
- Adding nginx only to serve static assets when the app runtime can serve them directly.
- Publishing host ports even though Coolify will route traffic itself.
- Mixing manual Traefik labels with Coolify magic env vars without a concrete need.
- Pointing Coolify to port `80` when the app actually listens on another internal port.
