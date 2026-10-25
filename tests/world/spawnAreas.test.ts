import { describe, expect, it } from "vitest";

import { GRENADE_CONFIG } from "../../src/combat/GrenadeConfig";
import { MOLOTOV_CONFIG } from "../../src/combat/MolotovConfig";
import { SMOKE_CONFIG } from "../../src/combat/SmokeConfig";
import { PlayerUtilities } from "../../src/inventory/PlayerUtilities";
import { ArenaCollision } from "../../src/world/ArenaCollision";
import { nightLights } from "../../src/world/NightLights";
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

  it("has a lamp post in the north-west yard, with its own cable and a spotlight at the wall plan (the north-east room has none)", () => {
    expect(
      ARENA_LAYOUT.lights.some((l) => l.id === "light-lamp-spawn-ne"),
    ).toBe(false);

    for (const area of ["nw"]) {
      const lamp = nightLights(ARENA_LAYOUT).find(
        (l) => l.id === "halogen-wall-spawn",
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

  it("has a large site plan poster in the north-west yard at eye level, clear of props (none in the north-east room)", () => {
    expect(ARENA_LAYOUT.posters).toHaveLength(1);
    expect(ARENA_LAYOUT.posters[0].here).toBe("nw");

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

  it("is minimal: a worktable, a few crates and a locker as solid cover, no heaps of stored materials", () => {
    for (const id of [
      "console-spawn-nw",
      "crate-spawn-nw",
      "crates-spawn-nw",
      "locker-spawn-nw",
    ]) {
      expect(
        ARENA_LAYOUT.walls.some((w) => w.id === id),
        id,
      ).toBe(true);
    }

    for (const id of [
      "fittings-spawn-nw-logs",
      "fittings-spawn-nw-bricks-a",
      "fittings-spawn-nw-bricks-b",
      "fittings-spawn-nw-debris",
    ]) {
      expect(
        ARENA_LAYOUT.walls.some((w) => w.id === id) ||
          ARENA_LAYOUT.piles.some((p) => p.id === id),
        id,
      ).toBe(false);
    }

    // A warm practical light at the worktable.
    const lamp = ARENA_LAYOUT.lights.find(
      (l) => l.id === "light-spawn-worktable",
    )!;

    expect(lamp).toBeDefined();
    expect(lamp.y).toBeLessThan(2);
    expect(lamp.intensity).toBeLessThan(15);
    // Red pipes along the north wall.
    expect(
      ARENA_LAYOUT.piles.some((p) => p.id === "fittings-spawn-nw-conduit"),
    ).toBe(true);
  });

  it("leaves the middle of the floor open: nothing solid between the spawn spots and the stairs", () => {
    for (const spawn of ARENA_LAYOUT.spawnPoints) {
      for (let x = spawn.x; x <= -23; x += 0.5) {
        expect(world.isBlocked(x, spawn.z, 0, 0.45), `${x},${spawn.z}`).toBe(
          false,
        );
      }
    }
  });

  it("keeps each stair foot and the middle of each area clear", () => {
    for (const [x, z, floor] of [
      [-26, -19, 0],
      [-29.6, -15.8, 0],
      [26.5, -13.5, 4],
      [29.9, -14.3, 4],
    ]) {
      expect(world.isBlocked(x, z, floor, 0.45), `${x},${z}`).toBe(false);
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
