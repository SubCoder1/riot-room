import { describe, expect, it } from "vitest";

import { ArenaCollision, PLAYER_RADIUS } from "../../src/world/ArenaCollision";
import { ARENA_LAYOUT } from "../../src/world/ArenaLayout";

const world = new ArenaCollision();
// The camera clearance Game.ts uses: a 0.15 m radius, blocked by anything not below the camera.
const keepOut = (x: number, y: number, z: number) =>
  world.pushOut(x, z, 0, 0.15, y - 0.05);

describe("Camera stays out of scenery", () => {
  const platform = ARENA_LAYOUT.platforms.find(
    (p) => p.id === "center-platform",
  )!; // 1.8 m
  const block = ARENA_LAYOUT.covers.find((c) => c.id === "cover-block-3")!; // 2 m, z 12.5..13.5

  it("a camera poking into a platform face is pushed back out", () => {
    // 5 cm inside the west face (x = -5), at eye height 1.7 (below the 1.8 m top).
    const out = keepOut(platform.minX + 0.05, 1.7, 0);

    expect(out.x).toBeLessThanOrEqual(platform.minX - 0.15 + 1e-6);
  });

  it("a camera poking into a 2 m block is pushed out", () => {
    const x = (block.minX + block.maxX) / 2;
    const out = keepOut(x, 1.7, block.maxZ - 0.05);

    expect(out.z).toBeGreaterThanOrEqual(block.maxZ + 0.15 - 1e-6);
  });

  it("a camera well clear of scenery is untouched", () => {
    expect(keepOut(-9, 1.7, 9)).toEqual({ x: -9, z: 9 });
  });

  it("a camera above a platform (player standing on it) is left alone", () => {
    const eye = platform.height + 1.7;

    expect(keepOut(0, eye, 0)).toEqual({ x: 0, z: 0 });
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
