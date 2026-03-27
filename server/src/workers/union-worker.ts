import { parentPort } from "node:worker_threads";
import type { Feature, MultiPolygon, Polygon } from "geojson";

import { makeFallbackLayer, mergePolygons } from "../lib/geo";
import type { PoiCategory } from "../lib/types";

type UnionTask = {
  taskId: number;
  category: PoiCategory;
  minutes: number;
  centers: Array<[number, number]>;
  isochrones: Array<Feature<Polygon | MultiPolygon>>;
};

if (!parentPort) {
  throw new Error("union-worker must be started from a worker thread");
}

parentPort.on("message", (task: UnionTask) => {
  try {
    const merged = mergePolygons(task.isochrones);
    const layer = merged ?? makeFallbackLayer(
      task.centers,
      task.minutes,
      () => ({
        category: task.category,
        minutes: task.minutes,
        source: "fallback",
      }),
    );

    parentPort?.postMessage({
      taskId: task.taskId,
      layer,
    });
  } catch (error) {
    const fallbackLayer = makeFallbackLayer(
      task.centers,
      task.minutes,
      () => ({
        category: task.category,
        minutes: task.minutes,
        source: "fallback",
      }),
    );

    parentPort?.postMessage({
      taskId: task.taskId,
      layer: fallbackLayer,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
