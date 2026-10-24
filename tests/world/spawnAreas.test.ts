import { describe, expect, it } from "vitest";

import { GRENADE_CONFIG } from "../../src/combat/GrenadeConfig";
import { MOLOTOV_CONFIG } from "../../src/combat/MolotovConfig";
import { SMOKE_CONFIG } from "../../src/combat/SmokeConfig";
import { PlayerUtilities } from "../../src/inventory/PlayerUtilities";
import { ArenaCollision } from "../../src/world/ArenaCollision";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";

const world = new ArenaCollision();

describe("Starting equipment", () => {
  it("every thug starts with exactly one grenade, one smoke grenade and one Molotov", () => {
    const utilities = new PlayerUtilities();

    expect(utilities.quantityOf("GRENADE")).toBe(1);
    expect(utilities.quantityOf("SMOKE")).toBe(1);
    expect(utilities.quantityOf("MOLOTOV")).toBe(1);
  });

  it("the one source of truth is each utility's configured start quantity", () => {
    expect(GRENADE_CONFIG.GRENADE_START_QUANTITY).toBe(1);
    expect(SMOKE_CONFIG.SMOKE_START_QUANTITY).toBe(1);
    expect(MOLOTOV_CONFIG.MOLOTOV_START_QUANTITY).toBe(1);
  });

  it("each player has their own inventory: one thug's throw leaves another's loadout alone", () => {
    const a = new PlayerUtilities();
    const b = new PlayerUtilities();

    a.remove("GRENADE", 1);
    expect(a.quantityOf("GRENADE")).toBe(0);
    expect(b.quantityOf("GRENADE")).toBe(1);
  });
});

describe("Spawn areas: entry and staging, not a shop", () => {
  it("has no workbench and no pickups in either spawn area", () => {
    expect(
      ARENA_LAYOUT.pickups.filter((pickup) => !pickup.id.startsWith("armory-")),
    ).toHaveLength(0);
    expect(ARENA_LAYOUT.walls.some((w) => /bench-spawn/.test(w.id))).toBe(
      false,
    );
    expect(ARENA_LAYOUT.lights.some((l) => /bench-spawn/.test(l.id))).toBe(
      false,
    );
  });

  it("has a lamp post in each, with its own cable and a spotlight at the wall plan", () => {
    for (const area of ["nw", "ne"]) {
      const lamp = ARENA_LAYOUT.lights.find(
        (l) => l.id === `light-lamp-spawn-${area}`,
      );
      const poster = ARENA_LAYOUT.posters.find((p) => p.here === area)!;

      expect(lamp, area).toBeDefined();
      expect(lamp!.target, area).toBeDefined();
      // Aimed at the poster's side of the room.
      expect(Math.abs(lamp!.target!.x - poster.x), area).toBeLessThan(1.5);
      expect(
        ARENA_LAYOUT.piles.some((p) => p.id === `lamp-spawn-${area}-feed`),
        area,
      ).toBe(true);
    }
  });

  it("has a large site plan poster in each area at eye level, clear of props", () => {
    expect(ARENA_LAYOUT.posters).toHaveLength(2);

    for (const poster of ARENA_LAYOUT.posters) {
      expect(poster.width).toBeGreaterThanOrEqual(2);
      expect(poster.height).toBeGreaterThanOrEqual(1.5);
      expect(poster.y).toBeGreaterThan(1.4);
      expect(poster.y).toBeLessThan(2.4);

      // Nothing solid stands in front of it above the bottom edge.
      const bottom = poster.y - poster.height / 2;

      for (const solid of ARENA_LAYOUT.walls) {
        const high = solid.height > bottom;
        const inX =
          solid.maxX > poster.x - poster.width / 2 &&
          solid.minX < poster.x + poster.width / 2;
        const front = solid.minZ < poster.z + 2 && solid.maxZ > poster.z + 0.1;

        expect(
          high && inX && front && (solid.bottom ?? 0) < poster.y,
          `${solid.id} in front of ${poster.id}`,
        ).toBe(false);
      }
    }
  });

  it("has logs, brick stacks and other stored materials as solid cover", () => {
    for (const id of [
      "fittings-spawn-nw-logs",
      "fittings-spawn-nw-bricks-a",
      "fittings-spawn-ne-logs",
      "fittings-spawn-ne-bricks",
      "fittings-spawn-ne-pallet",
      "fittings-spawn-ne-cabinet",
    ]) {
      expect(
        ARENA_LAYOUT.walls.some((w) => w.id === id),
        id,
      ).toBe(true);
    }
  });

  it("keeps each stair foot and the middle of each area clear", () => {
    for (const [x, z] of [
      [-26, -19],
      [-29.6, -15.8],
      [26.5, -19],
      [29.9, -14.3],
    ]) {
      expect(world.isBlocked(x, z, 0, 0.45), `${x},${z}`).toBe(false);
    }
  });
});

describe("The sealed door", () => {
  const door = ARENA_LAYOUT.walls.find((w) => w.id === "fittings-gate-closed")!;

  it("is solid over its whole width and height, flush to the wall", () => {
    expect(door).toBeDefined();
    expect(door.maxZ - door.minZ).toBeGreaterThanOrEqual(3.9);
    expect(door.height).toBeGreaterThanOrEqual(3.1);
    expect(door.minX).toBeCloseTo(-31.7, 1);

    for (let z = door.minZ + 0.1; z < door.maxZ; z += 0.3) {
      expect(world.isBlocked(door.minX + 0.17, z, 0, 0.3), `z ${z}`).toBe(true);
    }
  });

  it("is opaque: no bars, so no see-through gaps in its drawing", () => {
    const pile = ARENA_LAYOUT.piles.find(
      (p) => p.id === "fittings-gate-closed",
    )!;
    // No thin vertical bar elements spaced across it: every tall element is
    // wide (a leaf or a stiffener, never a slim bar).
    const bars = pile.elements.filter(
      (e) => e.sy > 1.5 && e.sx <= 0.05 && e.sz <= 0.05,
    );

    expect(bars).toHaveLength(0);
  });

  it("cannot be opened: it is no hatch, ladder or door in the layout", () => {
    expect(ARENA_LAYOUT.hatches.some((h) => /gate|door/.test(h.id))).toBe(
      false,
    );
    expect(ARENA_LAYOUT.ladders.some((l) => /gate|door/.test(l.id))).toBe(
      false,
    );
  });
});
