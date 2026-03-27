import { Worker } from "node:worker_threads";
import type { Feature, MultiPolygon, Polygon } from "geojson";

import { getRefreshConcurrency } from "../lib/refresh-config";
import { mapLimit } from "../lib/parallel";
import type { PoiCategory } from "../lib/types";

type UnionTaskInput = {
  category: PoiCategory;
  minutes: number;
  centers: Array<[number, number]>;
  isochrones: Array<Feature<Polygon | MultiPolygon>>;
};

type UnionTaskResult = {
  taskId: number;
  layer: Feature<Polygon | MultiPolygon> | null;
  error?: string;
};

const workerUrl = new URL("../workers/union-worker.ts", import.meta.url);

export async function runUnionWorkerPool(
  tasks: UnionTaskInput[],
): Promise<Array<Feature<Polygon | MultiPolygon> | null>> {
  if (tasks.length === 0) {
    return [];
  }

  const concurrency = Math.min(getRefreshConcurrency(), tasks.length);
  const queuedTasks = tasks.map((task, taskId) => ({ ...task, taskId }));

  return await mapLimit(
    queuedTasks,
    concurrency,
    async (task) =>
      await new Promise<Feature<Polygon | MultiPolygon> | null>((resolve, reject) => {
        const worker = new Worker(workerUrl);

        const finalize = async () => {
          worker.removeAllListeners();
          await worker.terminate();
        };

        worker.once("message", async (message: UnionTaskResult) => {
          if (message.error) {
            console.warn(`Union worker fallback for task ${message.taskId}: ${message.error}`);
          }

          await finalize();
          resolve(message.layer);
        });

        worker.once("error", async (error) => {
          await finalize();
          reject(error);
        });

        worker.postMessage(task);
      }),
  );
}
