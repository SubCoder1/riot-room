import { describe, expect, it } from "vitest";

import { ArenaCollision } from "../../src/world/ArenaCollision";
import {
  FUEL_CAPACITY,
  FUEL_PER_BOTTLE,
  GeneratorFuel,
} from "../../src/world/GeneratorFuel";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";

describe("Generator fuel", () => {
  it("adds one bottle's worth when the player has one", () => {
    const tank = new GeneratorFuel(100, 20);
    const result = tank.fill(1);

    expect(result).toEqual({
      ok: true,
      added: FUEL_PER_BOTTLE,
      level: 20 + FUEL_PER_BOTTLE,
    });
    expect(tank.level).toBe(20 + FUEL_PER_BOTTLE);
  });

  it("adds nothing and spends nothing without a bottle", () => {
    const tank = new GeneratorFuel(100, 20);
    const result = tank.fill(0);

    expect(result).toEqual({ ok: false, reason: "none", level: 20 });
    expect(tank.level).toBe(20);
  });

  it("never goes past its capacity, and a full tank refuses", () => {
    const tank = new GeneratorFuel(100, 90);
    const first = tank.fill(3);

    // Only the 10 that fit are added.
    expect(first).toEqual({ ok: true, added: 10, level: 100 });
    expect(tank.isFull).toBe(true);

    const second = tank.fill(3);

    expect(second).toEqual({ ok: false, reason: "full", level: 100 });
    expect(tank.level).toBe(100);
  });

  it("starts within 0 and its capacity", () => {
    expect(new GeneratorFuel(100, 500).level).toBe(100);
    expect(new GeneratorFuel(100, -5).level).toBe(0);
  });
});

describe("Generators in the map", () => {
  const world = new ArenaCollision();

  it("has the power-room generator and a smaller roof generator", () => {
    const ids = ARENA_LAYOUT.generators.map((g) => g.id).sort();

    expect(ids).toEqual(["generator-main", "generator-roof"]);

    const main = ARENA_LAYOUT.generators.find(
      (g) => g.id === "generator-main",
    )!;
    const roof = ARENA_LAYOUT.generators.find(
      (g) => g.id === "generator-roof",
    )!;

    expect(main.capacity).toBe(FUEL_CAPACITY);
    expect(roof.capacity).toBeLessThan(main.capacity);
    expect(main.startFuel).toBeLessThan(main.capacity);
  });

  it("each filler cap can be reached: a free spot to stand within reach of it", () => {
    for (const g of ARENA_LAYOUT.generators) {
      // The floor under it: the cap stands 1.1 m over the generator's base.
      const feet = g.y - 1.1;
      let free = 0;

      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const x = g.x + Math.cos(a) * 1.2;
        const z = g.z + Math.sin(a) * 1.2;

        if (!world.isBlocked(x, z, feet, 0.5)) {
          free++;
        }
      }

      expect(free, g.id).toBeGreaterThan(0);
    }
  });

  it("the power-room generator is in the Switch room, against the east wall", () => {
    const main = ARENA_LAYOUT.generators.find(
      (g) => g.id === "generator-main",
    )!;
    const room = ARENA_LAYOUT.rooms.find((r) => r.id === "room-switch")!;

    expect(main.x).toBeGreaterThan(room.minX);
    expect(main.x).toBeLessThan(room.maxX);
    expect(main.z).toBeGreaterThan(room.minZ);
    expect(main.z).toBeLessThan(room.maxZ);
  });

  it("every floodlight support has its own cable, from its foot, drawn in a fitting of the grid", () => {
    // The supports' own cables are in the grid fittings; each mast has a
    // junction box (its foot) and the grid has one fitting per network.
    const masts = ARENA_LAYOUT.walls.filter((w) =>
      /^support-[a-z]+-\d-1$/.test(w.id),
    );

    // (Seven, until the low work halogen on the east deck was taken down.)
    expect(masts.length).toBe(6);

    const grid = ARENA_LAYOUT.piles.filter((pile) =>
      pile.id.startsWith("fittings-grid-"),
    );

    expect(grid.map((g) => g.id).sort()).toEqual([
      "fittings-grid-dock",
      "fittings-grid-north",
      "fittings-grid-south",
    ]);
  });
});

describe("Floodlight supports and shots", () => {
  const world = new ArenaCollision();

  it("a shot at a lamp head, or at the crossbar, is stopped (they are solid, not just the mast's foot)", () => {
    const heads = ARENA_LAYOUT.walls.filter((w) =>
      /^support-[a-z]+-\d-[2-9]$/.test(w.id),
    );

    // Every support has at least its head as a hanging solid.
    expect(heads.length).toBeGreaterThanOrEqual(6);

    for (const h of heads) {
      const cx = (h.minX + h.maxX) / 2;
      const cz = (h.minZ + h.maxZ) / 2;
      const cy = ((h.bottom ?? 0) + h.height) / 2;

      // From 3 m away along z, level with it, straight at its centre.
      const fraction = world.segmentClearFraction(
        cx,
        cy,
        cz - 3,
        cx,
        cy,
        cz + 3,
      );

      expect(fraction, h.id).toBeLessThan(1);
    }
  });
});
