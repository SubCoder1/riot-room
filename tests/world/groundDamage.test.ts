import { describe, expect, it } from "vitest";
import type { BoxSolid } from "../../src/world/ArenaLayout";
import { SLAB_EDGES, WALL_SPALLS } from "../../src/world/GroundDamage";
import { meshExtent } from "../../src/world/PileMeshes";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";

const layout = ARENA_LAYOUT;
const debris = layout.piles.find(
  (p) => p.id === "fittings-ground-damage-debris",
);
const dress = layout.piles.find((p) => p.id === "fittings-ground-damage-dress");

describe("ground-floor damage", () => {
  it("builds both fittings", () => {
    expect(debris?.elements.length).toBeGreaterThan(40);
    expect(dress?.elements.length).toBeGreaterThan(80);
  });

  it("puts every spall on a real wall face and every slab edge on a real slab", () => {
    const boxes = layout.walls.filter((w): w is BoxSolid => w.kind === "box");
    const solids = [...boxes, ...layout.platforms];

    for (const s of WALL_SPALLS) {
      const alongX = s.face === "W" || s.face === "E";
      const hit = solids.some((b) =>
        alongX
          ? Math.abs((s.face === "W" ? b.maxX : b.minX) - s.plane) < 0.35 &&
            s.u > b.minZ &&
            s.u < b.maxZ
          : Math.abs((s.face === "N" ? b.maxZ : b.minZ) - s.plane) < 0.35 &&
            s.u > b.minX &&
            s.u < b.maxX,
      );

      expect(hit, s.id).toBe(true);
    }

    for (const e of SLAB_EDGES) {
      const hit = layout.platforms.some(
        (p) =>
          Math.abs(p.bottom - e.under) < 0.01 &&
          e.u > p.minX &&
          e.u < p.maxX &&
          Math.abs((e.face === "N" ? p.maxZ : p.minZ) - e.plane) < 0.01,
      );

      expect(hit, e.id).toBe(true);
    }
  });

  it("lays rubble on the floor: nothing floats or sinks through it", () => {
    for (const e of debris?.elements ?? []) {
      const extent = meshExtent(e);
      const low = e.y + (extent ? extent.low : -e.sy / 2);

      expect(
        low,
        `${e.shape} at ${e.x.toFixed(1)},${e.z.toFixed(1)}`,
      ).toBeGreaterThan(-0.06);
      if (low >= 0.06) {
        // Resting on another piece of the heap, not in the air.
        const under = (debris?.elements ?? []).some(
          (o) =>
            o !== e &&
            Math.hypot(o.x - e.x, o.z - e.z) < 0.4 &&
            o.y + o.sy / 2 > low - 0.05,
        );

        expect(
          under,
          `floating ${e.shape} at ${e.x.toFixed(1)},${e.z.toFixed(1)}`,
        ).toBe(true);
        expect(low).toBeLessThan(0.3);
      }
    }
  });

  it("keeps the courtyard's middle clear and its collision small", () => {
    for (const e of debris?.elements ?? []) {
      expect(Math.abs(e.x) < 12 && Math.abs(e.z) < 6).toBe(false);
    }

    for (const id of debris?.solids ?? []) {
      const b = layout.walls.find((w) => w.id === id) as BoxSolid;

      expect(b.maxX - b.minX).toBeLessThan(0.8);
      expect(b.maxZ - b.minZ).toBeLessThan(0.8);
      expect(b.height).toBeLessThan(0.35);
    }
  });

  it("leaves rubble off every other solid", () => {
    const boxes = layout.walls.filter(
      (w): w is BoxSolid =>
        w.kind === "box" &&
        !w.id.startsWith("fittings-ground-damage") &&
        (w.bottom ?? 0) < 0.6,
    );

    for (const e of debris?.elements ?? []) {
      const inside = boxes.find(
        (b) => e.x > b.minX && e.x < b.maxX && e.z > b.minZ && e.z < b.maxZ,
      );

      expect(
        inside?.id,
        `${e.shape} at ${e.x.toFixed(1)},${e.z.toFixed(1)}`,
      ).toBeUndefined();
    }
  });
});
