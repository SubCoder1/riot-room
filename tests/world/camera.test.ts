import { describe, expect, it } from "vitest";

import { ArenaCollision, PLAYER_RADIUS } from "../../src/world/ArenaCollision";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";

const world = new ArenaCollision();
// The camera clearance Game.ts uses: a 0.15 m radius, blocked by what is at the
// camera's height (not below it, and not a roof or a balcony overhead).
const keepOut = (x: number, y: number, z: number) =>
  world.pushOut(x, z, 0, 0.15, y - 0.05, y + 0.1);

describe("Camera stays out of scenery", () => {
  const tower = ARENA_LAYOUT.platforms.find((p) => p.id === "east-wing")!; // 4 m, solid to the ground
  const block = ARENA_LAYOUT.walls.find(
    (w) => w.id === "room-control-wall-s-2",
  )!; // 7.2 m, stands on the upper floor

  it("a camera poking into a tall platform's face is pushed back out", () => {
    // 5 cm inside the east wing's west face, at eye height 1.7 (below its top).
    const out = keepOut(tower.minX + 0.05, 1.7, 9);

    expect(out.x).toBeLessThanOrEqual(tower.minX - 0.15 + 1e-6);
  });

  it("a camera poking into a room wall is pushed out", () => {
    // The hall's south wall; stand on the upper floor, eye below the wall top.
    const x = (block.minX + block.maxX) / 2;
    const out = keepOut(x, 5.7, block.maxZ - 0.05);

    expect(out.z).toBeGreaterThanOrEqual(block.maxZ + 0.15 - 1e-6);
  });

  it("a camera well clear of scenery is untouched", () => {
    expect(keepOut(-9, 1.7, 3)).toEqual({ x: -9, z: 3 });
    expect(keepOut(-8, 5.7, -14)).toEqual({ x: -8, z: -14 });
  });

  it("a camera above a platform (player standing on it) is left alone", () => {
    const eye = tower.height + 1.7;
    const x = (tower.minX + tower.maxX) / 2;
    const z = (tower.minZ + tower.maxZ) / 2;

    expect(keepOut(x, eye, z)).toEqual({ x, z });
  });

  it("a camera above a railing is left alone", () => {
    const rail = ARENA_LAYOUT.walls.find((w) => w.id === "rail-bn-front-1")!;
    const x = (rail.minX + rail.maxX) / 2;
    const z = (rail.minZ + rail.maxZ) / 2;

    expect(keepOut(x, rail.height + 0.6, z)).toEqual({ x, z });
  });

  it("the body's standoff covers the camera and fist reach (about 0.4 and 0.46 m)", () => {
    expect(PLAYER_RADIUS).toBeGreaterThanOrEqual(0.5);
  });
});
