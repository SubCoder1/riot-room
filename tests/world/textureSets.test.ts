import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { IndustrialMaterialLibrary } from "../../src/world/materials/IndustrialMaterialLibrary";

describe("Complementary concrete texture sets", () => {
  const library = new IndustrialMaterialLibrary();

  it("the three floor looks use three different textures with different tile sizes", () => {
    const maps = (["dark", "medium", "worn"] as const).map(
      (v) => library.floor(v).map as THREE.Texture,
    );

    expect(new Set(maps).size).toBe(3);

    const tiles = [0, 1, 2].map((i) => library.concrete(i).tileMetres);

    expect(new Set(tiles).size).toBe(3);
  });

  it("the three wall looks use three different painted textures", () => {
    const maps = (["dark", "standard", "worn"] as const).map(
      (v) => library.paintedConcrete(v).map as THREE.Texture,
    );

    expect(new Set(maps).size).toBe(3);
  });

  it("there are three barrier concretes, each a different material and look", () => {
    const barriers = [0, 1, 2].map((i) => library.barrier(i));

    expect(new Set(barriers).size).toBe(3);
    expect(new Set(barriers.map((b) => b.color.getHex())).size).toBe(3);
    // Barriers do not use the same texture as the walls beside them.
    expect(barriers[0].map).not.toBe(library.paintedConcrete("dark").map);
  });

  it("variants are spread across ids, the same every run", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `rail-${i}`);
    const picks = ids.map((id) => library.barrierVariantFor(id));

    expect(new Set(picks).size).toBe(3);
    expect(ids.map((id) => library.barrierVariantFor(id))).toEqual(picks);
  });

  it("the sets are small enough to stay cheap (at most 1024 px each)", () => {
    for (const i of [0, 1, 2]) {
      expect(library.concrete(i).color.image.width).toBeLessThanOrEqual(1024);
      expect(library.paintedMaps(i).color.image.width).toBeLessThanOrEqual(
        1024,
      );
    }
  });
});
