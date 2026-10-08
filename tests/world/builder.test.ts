import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { buildArena, createLadder } from "../../src/world/ArenaBuilder";
import { OUTER_WALL_HEIGHT } from "../../src/world/ArenaLayout";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];

  root.traverse((child) => {
    if (child instanceof THREE.Mesh) found.push(child);
  });

  return found;
}

describe("Arena meshes", () => {
  const arena = buildArena(ARENA_LAYOUT);
  const all = meshes(arena);

  it("builds the floor, the outer walls, every solid, every roof and lintel, and every ladder", () => {
    const steps = ARENA_LAYOUT.stairs.reduce((n, s) => n + s.steps, 0);
    const ladderParts = ARENA_LAYOUT.ladders.reduce(
      (n, ladder) => n + meshes(createLadder(ladder)).length,
      0,
    );
    const expected =
      1 +
      4 +
      ARENA_LAYOUT.platforms.length +
      ARENA_LAYOUT.walls.length +
      ARENA_LAYOUT.ramps.length +
      steps +
      ARENA_LAYOUT.pillars.length +
      ARENA_LAYOUT.overheads.length +
      ladderParts;

    expect(all).toHaveLength(expected);
  });

  it("is lightweight: meshes share one box and a handful of materials", () => {
    const geometries = new Set(all.map((m) => m.geometry));
    const materials = new Set(all.map((m) => m.material));

    // One box, one cylinder (the tanks), and a wedge per ramp.
    expect(geometries.size).toBe(2 + ARENA_LAYOUT.ramps.length);
    expect(materials.size).toBeLessThanOrEqual(24);
  });

  it("the outer walls enclose the whole 64 x 48 m map", () => {
    arena.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(arena);

    expect(box.max.y).toBeCloseTo(OUTER_WALL_HEIGHT);
    expect(box.max.x).toBeGreaterThan(32);
    expect(box.min.x).toBeLessThan(-32);
    expect(box.max.z).toBeGreaterThan(24);
    expect(box.min.z).toBeLessThan(-24);
  });

  it("a wall on a floor is drawn from the floor up, not from the ground", () => {
    const wall = ARENA_LAYOUT.walls.find(
      (w) => w.id === "room-control-wall-s-2",
    )!;
    const mesh = all.find(
      (m) =>
        Math.abs(m.position.x - (wall.minX + wall.maxX) / 2) < 1e-6 &&
        Math.abs(m.position.z - (wall.minZ + wall.maxZ) / 2) < 1e-6 &&
        Math.abs(m.position.y - ((wall.base ?? 0) + wall.height) / 2) < 1e-6,
    )!;

    expect(mesh).toBeDefined();
    expect(mesh.scale.y).toBeCloseTo(wall.height - (wall.base ?? 0));
  });

  it("a ladder is drawn from the ground to a metre above its top", () => {
    for (const ladder of ARENA_LAYOUT.ladders) {
      const box = new THREE.Box3().setFromObject(createLadder(ladder));

      expect(box.min.y).toBeLessThanOrEqual(ladder.bottomY + 0.05);
      expect(box.max.y).toBeGreaterThanOrEqual(ladder.topY + 0.9);
    }
  });
});
