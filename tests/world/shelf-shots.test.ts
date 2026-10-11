import { describe, expect, it } from "vitest";
import { ArenaCollision } from "../../src/world/ArenaCollision";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";

describe("Loaded shelving and shots", () => {
  const collision = new ArenaCollision();
  const unit = ARENA_LAYOUT.walls.find((w) => w.id === "fittings-maze-c1");

  it("a shelving unit is a framework for shots", () => {
    expect(unit?.kind === "box" && unit.frame?.length).toBeGreaterThan(20);
  });

  it("a shot passes between the shelves and the load, and is stopped by a board", () => {
    if (!unit || unit.kind !== "box") throw new Error("no unit");

    let clear = 0;
    let blocked = 0;

    for (let y = (unit.bottom ?? 0) + 0.1; y < unit.height; y += 0.04) {
      for (let x = unit.minX + 0.1; x < unit.maxX; x += 0.1) {
        const fraction = collision.segmentClearFraction(
          x,
          y,
          unit.minZ - 1,
          x,
          y,
          unit.maxZ - 0.02,
        );

        if (fraction === 1) clear++;
        else blocked++;
      }
    }

    expect(clear).toBeGreaterThan(0);
    expect(blocked).toBeGreaterThan(0);
  });

  it("a body still cannot walk through the unit", () => {
    if (!unit || unit.kind !== "box") throw new Error("no unit");

    const x = (unit.minX + unit.maxX) / 2;
    const z = (unit.minZ + unit.maxZ) / 2;

    expect(collision.isBlocked(x, z, unit.bottom ?? 0, 0.3)).toBe(true);
  });
});
