import { describe, expect, it } from "vitest";

import { ArenaCollision } from "../../src/world/ArenaCollision";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";

describe("Generators in the map", () => {
  it("has the power-room generator and a smaller roof generator", () => {
    const ids = ARENA_LAYOUT.generators.map((g) => g.id).sort();

    expect(ids).toEqual(["generator-main", "generator-roof"]);
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

    // (Five: the low east-deck halogen and the single one by the power room are gone.)
    expect(masts.length).toBe(5);

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
