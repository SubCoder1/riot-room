import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { limitArmReach } from "../../src/character/ArmReach";
import { ArenaCollision } from "../../src/world/ArenaCollision";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";

const world = new ArenaCollision();
const v = (x: number, y: number, z: number): THREE.Vector3 =>
  new THREE.Vector3(x, y, z);

// A room wall on the upper floor; the lines run at chest height up there.
const block = ARENA_LAYOUT.walls.find((w) => w.id === "room-control-wall-s-2")!;
const chest = 5.2;
const x = (block.minX + block.maxX) / 2;

describe("segmentClearFraction", () => {
  it("is 1 over open floor", () => {
    expect(world.segmentClearFraction(-9, 1.3, -3, -3, 1.3, -3)).toBe(1);
  });

  it("stops just before a block's face", () => {
    // From 0.5 m before the block's near face, 3 m straight through it.
    const z0 = block.minZ - 0.5;
    const fraction = world.segmentClearFraction(x, chest, z0, x, chest, z0 + 3);
    const stopsAt = z0 + fraction * 3;

    expect(fraction).toBeLessThan(1);
    expect(stopsAt).toBeGreaterThan(block.minZ - 0.3);
    expect(stopsAt).toBeLessThanOrEqual(block.minZ);
  });

  it("is 0 when the line starts inside scenery", () => {
    const inside = (block.minZ + block.maxZ) / 2;

    expect(
      world.segmentClearFraction(x, chest, inside, x, chest, inside + 2),
    ).toBe(0);
  });

  it("agrees with segmentBlocked", () => {
    expect(
      world.segmentBlocked(
        x,
        chest,
        block.minZ - 0.5,
        x,
        chest,
        block.minZ + 2.5,
      ),
    ).toBe(true);
    expect(world.segmentBlocked(-9, 1.3, -3, -3, 1.3, -3)).toBe(false);
  });
});

describe("limitArmReach", () => {
  // A right arm reaching forward (+z): shoulder, elbow, wrist, ~0.3 m each.
  const shoulder = v(0, 1.4, 0);
  const elbow = v(0.05, 1.35, 0.3);
  const wrist = v(0, 1.4, 0.62);

  it("leaves an arm alone when nothing is in the way", () => {
    expect(limitArmReach(shoulder, elbow, wrist, () => 1)).toBeNull();
  });

  it("shortens the arm so the fist stops at a wall, without growing or stretching it", () => {
    // A wall 0.35 m in front of the shoulder.
    const wallAt = 0.35;
    const pose = limitArmReach(shoulder, elbow, wrist, (from, to) =>
      Math.min(1, wallAt / from.distanceTo(to)),
    )!;

    expect(pose).not.toBeNull();

    // The fist ends in front of the wall, not behind it.
    expect(pose.wrist.z).toBeLessThanOrEqual(wallAt);
    expect(pose.wrist.z).toBeGreaterThan(0);

    // Bone lengths are preserved (the elbow just bends more).
    expect(pose.elbow.distanceTo(shoulder)).toBeCloseTo(
      elbow.distanceTo(shoulder),
      5,
    );
    expect(pose.wrist.distanceTo(pose.elbow)).toBeCloseTo(
      wrist.distanceTo(elbow),
      5,
    );
  });

  it("the elbow keeps bending to the same side", () => {
    const pose = limitArmReach(shoulder, elbow, wrist, (from, to) =>
      Math.min(1, 0.35 / from.distanceTo(to)),
    )!;

    expect(Math.sign(pose.elbow.x)).toBe(Math.sign(elbow.x));
  });

  it("never folds the arm to nothing, even with a wall at the shoulder", () => {
    const pose = limitArmReach(shoulder, elbow, wrist, () => 0)!;

    expect(pose.wrist.distanceTo(shoulder)).toBeGreaterThan(0.15);
  });

  it("works with the real arena: a fist thrown at a block stops at its face", () => {
    // Player 0.4 m from the wall's near (north) face, arm straight at it.
    const face = block.minZ;
    const s = v(x, chest + 0.05, face - 0.4);
    const e = v(x + 0.05, chest, face - 0.1);
    const w = v(x, chest + 0.05, face + 0.22); // the fist is already inside the wall
    const pose = limitArmReach(s, e, w, (a, b) =>
      world.segmentClearFraction(a.x, a.y, a.z, b.x, b.y, b.z),
    )!;

    expect(pose).not.toBeNull();
    expect(pose.wrist.z).toBeLessThan(face);
  });
});
