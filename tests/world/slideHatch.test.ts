import { describe, expect, it } from "vitest";

import { ArenaCollision } from "../../src/world/ArenaCollision";
import {
  ROOF_HIGH,
  allSolids,
  hatchLid,
  type BoxSolid,
} from "../../src/world/ArenaLayout";
import {
  ARMORY_VENT_HATCHES,
  ARMORY_VENT_TOP,
} from "../../src/world/ArmoryVent";
import { isSlideHatch, slideDistance } from "../../src/world/SlideHatch";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";

const hatches = ARENA_LAYOUT.hatches.filter((h) => isSlideHatch(h.id));
const [, , left, right] = [...hatches].sort((a, b) => a.minX - b.minX);

const centre = (h: {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}) => [(h.minX + h.maxX) / 2, (h.minZ + h.maxZ) / 2] as const;

const overlaps = (
  a: { minX: number; maxX: number; minZ: number; maxZ: number },
  b: { minX: number; maxX: number; minZ: number; maxZ: number },
): boolean =>
  a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

describe("The Armory roof's sliding vent covers", () => {
  it("are every vent of the Armory's roof row", () => {
    expect(hatches).toHaveLength(ARMORY_VENT_HATCHES.length);
    expect(hatches.length).toBe(5);

    for (const h of hatches) {
      expect(ARMORY_VENT_HATCHES.some((v) => v.id === h.id)).toBe(true);
    }

    // Side by side along the row, west to east.
    const row = [...hatches].sort((a, b) => a.minX - b.minX);

    for (let k = 1; k < row.length; k++) {
      expect(row[k].minX).toBeGreaterThanOrEqual(row[k - 1].maxX - 1e-6);
    }
  });

  it("rest flat on the roof beside their openings, not on them or on each other", () => {
    for (const h of hatches) {
      const lid = hatchLid(h);

      expect(lid.bottom).toBe(ROOF_HIGH);
      expect(lid.height - ROOF_HIGH).toBeLessThan(0.1);
      // Clear of both openings (so an open cover never blocks one) ...
      expect(overlaps(lid, left)).toBe(false);
      expect(overlaps(lid, right)).toBe(false);
      // ... one cover's depth plus a gap away, toward the open roof.
      expect(lid.maxZ).toBeLessThan(h.minZ - 0.15);
      const depth = h.maxZ - h.minZ;

      expect(lid.maxZ - lid.minZ).toBeCloseTo(depth * 0.96, 6);
      expect((lid.minZ + lid.maxZ) / 2).toBeCloseTo(
        (h.minZ + h.maxZ) / 2 - slideDistance(depth),
        6,
      );
    }

    // No two resting covers lie on each other.
    for (const a of hatches) {
      for (const b of hatches) {
        if (a !== b) {
          expect(overlaps(hatchLid(a), hatchLid(b))).toBe(false);
        }
      }
    }
  });

  it("rest where nothing else stands on the roof", () => {
    const solids = allSolids(ARENA_LAYOUT).filter(
      (s): s is BoxSolid =>
        s.kind === "box" &&
        !s.id.endsWith("-lid") &&
        !s.id.startsWith("hatch-armory-vent") &&
        // Whatever stands above the roof surface, there or beside it.
        s.height > ROOF_HIGH + 0.06 &&
        (s.bottom ?? 0) < ROOF_HIGH + 1,
    );

    for (const h of hatches) {
      const lid = hatchLid(h);

      for (const solid of solids) {
        expect(overlaps(lid, solid), `${h.id} lid on ${solid.id}`).toBe(false);
      }
    }
  });

  it("still lie on the Armory's roof (z 5 to 12), within the room's footprint", () => {
    for (const h of hatches) {
      const lid = hatchLid(h);

      expect(lid.minZ).toBeGreaterThan(5);
      expect(lid.minX).toBeGreaterThan(-32);
      expect(lid.maxX).toBeLessThan(-20.2);
    }
  });

  it("block their opening when shut and clear it when open, independently", () => {
    const world = new ArenaCollision(ARENA_LAYOUT);
    const [lx, lz] = centre(left);
    const [rx, rz] = centre(right);
    const down = (x: number, z: number): number =>
      world.groundHeight(x, z, ROOF_HIGH + 1);

    // Both start shut: you can stand on each (just under the roof's top).
    expect(down(lx, lz)).toBeCloseTo(ARMORY_VENT_TOP, 2);
    expect(down(rx, rz)).toBeCloseTo(ARMORY_VENT_TOP, 2);

    // Open the left one: it drops to the floor below; the right one is still shut.
    world.setOpen(left.id, true);
    expect(down(lx, lz)).toBeLessThan(ARMORY_VENT_TOP - 3);
    expect(down(rx, rz)).toBeCloseTo(ARMORY_VENT_TOP, 2);

    // Open the right one too, then shut the left one again.
    world.setOpen(right.id, true);
    expect(down(rx, rz)).toBeLessThan(ARMORY_VENT_TOP - 3);
    world.setOpen(left.id, false);
    expect(down(lx, lz)).toBeCloseTo(ARMORY_VENT_TOP, 2);
    expect(down(rx, rz)).toBeLessThan(ARMORY_VENT_TOP - 3);
  });

  it("give the cover a low solid beside the opening while open, and none while shut", () => {
    const world = new ArenaCollision(ARENA_LAYOUT);

    for (const h of hatches) {
      const lid = hatchLid(h);
      const x = (lid.minX + lid.maxX) / 2;
      const z = (lid.minZ + lid.maxZ) / 2;
      const roofOnly = world.groundHeight(x, z, ROOF_HIGH + 1);

      expect(roofOnly).toBeCloseTo(ROOF_HIGH, 2);
      world.setOpen(h.id, true);
      expect(world.groundHeight(x, z, ROOF_HIGH + 1)).toBeCloseTo(
        lid.height,
        2,
      );
      world.setOpen(h.id, false);
      expect(world.groundHeight(x, z, ROOF_HIGH + 1)).toBeCloseTo(ROOF_HIGH, 2);
    }
  });

  it("have a lid solid in the map for each cover (only active while open)", () => {
    const solids = allSolids(ARENA_LAYOUT);

    for (const h of hatches) {
      const lid = solids.find((s) => s.id === `${h.id}-lid`) as BoxSolid;

      expect(lid).toBeDefined();
      expect(lid.role).toBe("hatch");
    }
  });
});
