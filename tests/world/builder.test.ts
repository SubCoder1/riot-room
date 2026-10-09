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
      1 + // the structural steel, merged into one mesh
      ladderParts;

    expect(all).toHaveLength(expected);
  });

  it("is lightweight: meshes share one box and a handful of materials", () => {
    const geometries = new Set(all.map((m) => m.geometry));
    const materials = new Set(all.map((m) => m.material));

    // One box, one cylinder (the tanks), the merged steel, and a wedge per ramp.
    expect(geometries.size).toBe(3 + ARENA_LAYOUT.ramps.length);
    expect(materials.size).toBeLessThanOrEqual(24);
  });

  it("floors (and only floors) are concrete, from a few shared materials and textures", () => {
    const floorIds = new Set(
      ARENA_LAYOUT.platforms
        .filter((p) => (p.role ?? "floor") === "floor")
        .map((p) => `${p.minX},${p.maxX},${p.minZ},${p.maxZ}`),
    );
    const concrete = all.filter((m) =>
      /^FloorConcrete/.test((m.material as THREE.Material).name),
    );
    const variants = new Set(concrete.map((m) => m.material));
    const maps = new Set(
      concrete.map((m) => (m.material as THREE.MeshStandardMaterial).map),
    );

    // The ground slab plus every floor section; nothing else is concrete.
    expect(concrete).toHaveLength(1 + floorIds.size);
    expect(variants.size).toBeLessThanOrEqual(3);
    expect(maps.size).toBe(1);

    for (const mesh of concrete) {
      const material = mesh.material as THREE.MeshStandardMaterial;

      expect(material.roughness).toBeGreaterThanOrEqual(0.8);
      expect(material.roughness).toBeLessThanOrEqual(0.95);
      expect(material.metalness).toBe(0);
      expect(material.emissive.getHex()).toBe(0);
      expect(material.color.getHex()).not.toBe(0);
    }

    // Roofs keep their own look.
    const roof = ARENA_LAYOUT.platforms.find((p) => p.role === "roof")!;
    const roofMesh = all.find(
      (m) =>
        Math.abs(m.position.x - (roof.minX + roof.maxX) / 2) < 1e-6 &&
        Math.abs(m.position.z - (roof.minZ + roof.maxZ) / 2) < 1e-6 &&
        !/^FloorConcrete/.test((m.material as THREE.Material).name),
    );

    expect(roofMesh).toBeDefined();
  });

  it("brick is an accent: a few old rooms, 2 shared materials, one texture set, concrete floors untouched", () => {
    const bricks = all.filter((m) =>
      /^Brick/.test((m.material as THREE.Material).name),
    );
    const materials = new Set(bricks.map((m) => m.material));
    const maps = new Set(
      bricks.map((m) => (m.material as THREE.MeshStandardMaterial).map),
    );

    expect(bricks.length).toBeGreaterThan(20);
    expect(bricks.length).toBeLessThan(all.length * 0.2);
    expect(materials.size).toBeLessThanOrEqual(2);
    expect(maps.size).toBe(1);

    for (const mesh of bricks) {
      const material = mesh.material as THREE.MeshStandardMaterial;

      expect(material.metalness).toBe(0);
      expect(material.roughness).toBeLessThanOrEqual(1);
      expect(material.emissive.getHex()).toBe(0);
      expect(material.map?.image.width).toBeLessThanOrEqual(1024);
    }

    // The control room keeps its own wall, and the floors stay concrete.
    const control = ARENA_LAYOUT.walls.filter((w) =>
      w.id.startsWith("room-control-wall"),
    );

    expect(control.length).toBeGreaterThan(0);
    expect(
      all.filter((m) =>
        /^FloorConcrete/.test((m.material as THREE.Material).name),
      ).length,
    ).toBeGreaterThan(10);
  });

  it("every wall is brick (the accent) or painted concrete: 3 shared materials, one texture set, matte", () => {
    const painted = all.filter((m) =>
      /^PaintedConcrete/.test((m.material as THREE.Material).name),
    );
    const bricks = all.filter((m) =>
      /^Brick/.test((m.material as THREE.Material).name),
    );
    const materials = new Set(painted.map((m) => m.material));
    const maps = new Set(
      painted.map((m) => (m.material as THREE.MeshStandardMaterial).map),
    );
    const wallCount = ARENA_LAYOUT.walls.filter(
      (w) => (w.role ?? "floor") === "wall",
    ).length;

    // Every wall piece (the wall over each door included) and the four outer walls.
    expect(painted.length + bricks.length).toBe(wallCount + 4);
    expect(painted.length).toBeGreaterThan(bricks.length);
    expect(materials.size).toBeLessThanOrEqual(3);
    expect(maps.size).toBe(1);

    for (const mesh of painted) {
      const material = mesh.material as THREE.MeshStandardMaterial;

      expect(material.metalness).toBe(0);
      expect(material.emissive.getHex()).toBe(0);
      expect(material.roughnessMap).not.toBeNull();
      expect(material.map?.image.width).toBeLessThanOrEqual(1024);
    }
  });

  it("structural steel is one mesh, one matte-metal material, with every member kept by id", () => {
    const steel = all.filter((m) => m.name === "SteelStructure");

    expect(steel).toHaveLength(1);

    const material = steel[0].material as THREE.MeshStandardMaterial;

    expect(material.roughness).toBeGreaterThanOrEqual(0.65);
    expect(material.roughness).toBeLessThanOrEqual(0.85);
    expect(material.metalness).toBeGreaterThanOrEqual(0.35);
    expect(material.metalness).toBeLessThanOrEqual(0.65);
    expect(material.emissive.getHex()).toBe(0);
    expect(steel[0].userData.members).toHaveLength(ARENA_LAYOUT.steel.length);
    expect(ARENA_LAYOUT.steel.length).toBeGreaterThan(40);
    expect(ARENA_LAYOUT.steel.length).toBeLessThan(120);

    // Only the floor columns are solid.
    const solid = ARENA_LAYOUT.steel.filter((m) => m.solid);

    expect(solid.length).toBeGreaterThan(0);
    expect(solid.every((m) => m.kind === "column")).toBe(true);
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
