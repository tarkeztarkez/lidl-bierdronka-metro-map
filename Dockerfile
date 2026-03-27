FROM oven/bun:1 AS frontend-deps
WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile

FROM frontend-deps AS frontend-builder
WORKDIR /app/frontend
COPY frontend/ ./
RUN bun run build

FROM oven/bun:1 AS backend-deps
WORKDIR /app/server
COPY server/package.json server/bun.lock ./
RUN bun install --frozen-lockfile

FROM backend-deps AS backend-runtime
WORKDIR /app
COPY server ./server
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
COPY data ./data
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["bun", "run", "server/src/index.ts"]
