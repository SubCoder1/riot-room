import { describe, expect, it } from "vitest";

import { ArenaCollision, PLAYER_RADIUS } from "../../src/world/ArenaCollision";
import { ARENA_LAYOUT } from "../../src/world/ArenaLayout";

const world = new ArenaCollision();
// The camera clearance Game.ts uses: a 0.15 m radius, blocked by anything not below the camera.
const keepOut = (x: number, y: number, z: number) =>
  world.pushOut(x, z, 0, 0.15, y - 0.05);

describe("Camera stays out of scenery", () => {
  const tower = ARENA_LAYOUT.platforms.find((p) => p.id === "east-tower")!; // 2.6 m
  const block = ARENA_LAYOUT.covers.find((c) => c.id === "cover-block-3")!; // 2 m

  it("a camera poking into a tall platform's face is pushed back out", () => {
    // 5 cm inside the tower's west face, at eye height 1.7 (below its top).
    const out = keepOut(tower.minX + 0.05, 1.7, (tower.minZ + tower.maxZ) / 2);

    expect(out.x).toBeLessThanOrEqual(tower.minX - 0.15 + 1e-6);
  });

  it("a camera poking into a 2 m block is pushed out", () => {
    const x = (block.minX + block.maxX) / 2;
    const out = keepOut(x, 1.7, block.maxZ - 0.05);

    expect(out.z).toBeGreaterThanOrEqual(block.maxZ + 0.15 - 1e-6);
  });

  it("a camera well clear of scenery is untouched", () => {
    expect(keepOut(-9, 1.7, 3)).toEqual({ x: -9, z: 3 });
  });

  it("a camera above a platform (player standing on it) is left alone", () => {
    const eye = tower.height + 1.7;
    const x = (tower.minX + tower.maxX) / 2;
    const z = (tower.minZ + tower.maxZ) / 2;

    expect(keepOut(x, eye, z)).toEqual({ x, z });
  });

  it("a camera above a low wall is left alone", () => {
    const low = ARENA_LAYOUT.covers.find((c) => c.id === "cover-low-1")!;
    const x = (low.minX + low.maxX) / 2;
    const z = (low.minZ + low.maxZ) / 2;

    expect(keepOut(x, 1.7, z)).toEqual({ x, z });
  });

  it("the body's standoff covers the camera and fist reach (about 0.4 and 0.46 m)", () => {
    expect(PLAYER_RADIUS).toBeGreaterThanOrEqual(0.5);
  });
});
