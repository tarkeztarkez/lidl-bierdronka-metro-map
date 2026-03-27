import { availableParallelism } from "node:os";

export function getRefreshConcurrency(): number {
  const raw = Number(Bun.env.REFRESH_CONCURRENCY ?? availableParallelism());

  if (!Number.isFinite(raw) || raw < 1) {
    return 1;
  }

  return Math.max(1, Math.floor(raw));
}

export function getValhallaConcurrency(): number {
  const raw = Number(Bun.env.VALHALLA_CONCURRENCY ?? 4);

  if (!Number.isFinite(raw) || raw < 1) {
    return 1;
  }

  return Math.max(1, Math.floor(raw));
}
