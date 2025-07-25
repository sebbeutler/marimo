/* Copyright 2024 Marimo. All rights reserved. */

import { asRemoteURL } from "@/core/runtime/config";
import { vegaLoadData } from "./loader";
import type {
  FacetedUnitSpec,
  Field,
  GenericFacetSpec,
  LayerSpec,
  UnitSpec,
  VegaLiteSpec,
} from "./types";

type AnySpec =
  | VegaLiteSpec
  | LayerSpec<Field>
  | UnitSpec<Field>
  | GenericFacetSpec<FacetedUnitSpec<Field>, LayerSpec<Field>, Field>;

/**
 * Given a VegaLite spec with URL data, resolve the data and return a new spec with the resolved data.
 *
 * This handles top-level URL data, as well as nested URL data in layers.
 */
export async function resolveVegaSpecData(
  spec: VegaLiteSpec,
): Promise<VegaLiteSpec> {
  if (!spec) {
    return spec;
  }

  const datasets = "datasets" in spec ? { ...spec.datasets } : {};

  const traverse = async <T extends AnySpec>(spec: T): Promise<T> => {
    if (!spec) {
      return spec;
    }

    if ("layer" in spec) {
      const layers = await Promise.all(spec.layer.map(traverse));
      spec = {
        ...spec,
        layer: layers,
      };
    }
    if ("hconcat" in spec) {
      const hconcat = await Promise.all(spec.hconcat.map(traverse));
      spec = {
        ...spec,
        hconcat,
      };
    }
    if ("vconcat" in spec) {
      const vconcat = await Promise.all(spec.vconcat.map(traverse));
      spec = {
        ...spec,
        vconcat,
      };
    }

    if ("spec" in spec) {
      spec = {
        ...spec,
        spec: await traverse(spec.spec),
      };
    }

    if (!spec.data) {
      return spec;
    }

    if (!("url" in spec.data)) {
      return spec;
    }

    // Parse URL
    let url: URL;
    try {
      url = asRemoteURL(spec.data.url);
    } catch {
      return spec;
    }
    const data = await vegaLoadData(url.href, spec.data.format);

    datasets[url.pathname] = data;

    return {
      ...spec,
      data: { name: url.pathname },
    };
  };

  const resolvedSpec = await traverse(spec);
  if (Object.keys(datasets).length === 0) {
    return resolvedSpec;
  }
  return {
    ...resolvedSpec,
    datasets,
  };
}
