import { makePointFeature } from "../lib/geo";
import type { PoiFeature } from "../lib/types";

const storeSamples: Array<[number, number, string, string]> = [
  [21.0122, 52.2297, "Lidl Śródmieście", "Lidl"],
  [21.0225, 52.235, "Biedronka Powiśle", "Biedronka"],
  [21.035, 52.241, "Lidl Wola", "Lidl"],
  [20.99, 52.24, "Biedronka Ochota", "Biedronka"],
  [21.06, 52.215, "Lidl Praga", "Lidl"],
  [21.085, 52.23, "Biedronka Targówek", "Biedronka"],
];

const metroSamples: Array<[number, number, string]> = [
  [21.009, 52.229, "Centrum"],
  [21.018, 52.236, "Nowy Świat-Uniwersytet"],
  [21.015, 52.247, "Ratusz Arsenał"],
  [20.993, 52.223, "Politechnika"],
  [21.048, 52.229, "Dworzec Wileński"],
  [21.067, 52.245, "Szwedzka"],
];

const milkbarSamples: Array<[number, number, string]> = [
  [21.0114, 52.2311, "Bar Mleczny Śródmieście"],
  [21.0206, 52.2378, "Bar Mleczny Powiśle"],
  [21.0012, 52.2254, "Bar Mleczny Mokotowska"],
];

export function sampleStores(): PoiFeature[] {
  return storeSamples.map(([longitude, latitude, name, brand], index) =>
    makePointFeature(longitude, latitude, {
      id: `sample-store-${index + 1}`,
      name,
      category: "store",
      subtype: "supermarket",
      source: "sample",
      brand,
    }) as PoiFeature,
  );
}

export function sampleMetros(): PoiFeature[] {
  return metroSamples.map(([longitude, latitude, name], index) =>
    makePointFeature(longitude, latitude, {
      id: `sample-metro-${index + 1}`,
      name,
      category: "metro",
      subtype: "station",
      source: "sample",
    }) as PoiFeature,
  );
}

export function sampleMilkbars(): PoiFeature[] {
  return milkbarSamples.map(([longitude, latitude, name], index) =>
    makePointFeature(longitude, latitude, {
      id: `sample-milkbar-${index + 1}`,
      name,
      category: "milkbar",
      subtype: "restaurant",
      source: "sample",
    }) as PoiFeature,
  );
}
