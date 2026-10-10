import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { buildArena, createLadder } from "../../src/world/ArenaBuilder";
import { PERIMETER_WALL_HEIGHT, ROOF_HIGH } from "../../src/world/ArenaLayout";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";
import { ventBlocks } from "../../src/world/Vents";

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
  // The piles are four merged meshes at most: bags, bricks, planks and chunks.
  const pileMeshes = new Set(
    ARENA_LAYOUT.piles.flatMap((p) => p.elements.map((e) => e.shape)),
  ).size;

  it("builds the floor, the perimeter walls, every solid, every roof and lintel, and every ladder", () => {
    const steps = ARENA_LAYOUT.stairs.reduce((n, s) => n + s.steps, 0);
    const ladderParts = ARENA_LAYOUT.ladders.reduce(
      (n, ladder) => n + meshes(createLadder(ladder)).length,
      0,
    );
    const expected =
      1 + // the arena floor (one merged mesh with a hole under each grate)
      4 +
      ARENA_LAYOUT.platforms.length +
      ARENA_LAYOUT.walls.filter((w) => !w.hidden).length +
      pileMeshes +
      (ARENA_LAYOUT.decals.length > 0 ? 1 : 0) + // every floor mark, merged
      ARENA_LAYOUT.ramps.length +
      steps +
      ARENA_LAYOUT.pillars.length +
      ARENA_LAYOUT.overheads.length +
      1 + // the structural steel, merged into one mesh
      3 + // the vents: floor and walls of the ground network, floor of the upper
      ventBlocks(ARENA_LAYOUT.vents).length + // ...then a block of grating each
      ventBlocks(ARENA_LAYOUT.upperVents).length +
      ladderParts;

    expect(all).toHaveLength(expected);
  });

  it("is lightweight: meshes share one box and a handful of materials", () => {
    const geometries = new Set(all.map((m) => m.geometry));
    const materials = new Set(all.map((m) => m.material));

    // One box, one cylinder (the tanks), the merged steel, the merged floor, the
    // vent floor and walls, a merged grate each, and a wedge per ramp.
    expect(geometries.size).toBe(
      6 +
        ventBlocks(ARENA_LAYOUT.vents).length +
        ventBlocks(ARENA_LAYOUT.upperVents).length +
        1 + // the upper network's floor (its walls are the cut floor)
        2 + // the north and south wings, cut round the upper grating
        pileMeshes + // bags, bricks, planks, chunks: one merged mesh each
        (ARENA_LAYOUT.decals.length > 0 ? 1 : 0) + // the floor marks
        ARENA_LAYOUT.ramps.length,
    );
    // ...plus the two piece materials and the one for the floor marks.
    expect(materials.size).toBeLessThanOrEqual(34);
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
    // Three complementary texture sets, so neighbours never show the same marks.
    expect(maps.size).toBeLessThanOrEqual(3);

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

    // Every wall piece (the wall over each door included) and the four perimeter walls.
    expect(painted.length + bricks.length).toBe(wallCount + 4);
    expect(painted.length).toBeGreaterThan(bricks.length);
    expect(materials.size).toBeLessThanOrEqual(3);
    expect(maps.size).toBeLessThanOrEqual(3);

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
    expect(ARENA_LAYOUT.steel.length).toBeLessThan(400);

    const solid = ARENA_LAYOUT.steel.filter((m) => m.solid);

    expect(solid.length).toBeGreaterThan(0);
    // Only the columns are solid.
    expect(solid.every((m) => m.kind === "column")).toBe(true);
  });

  it("floating slabs in the open stand on posts that meet their undersides, and the service corridor is roofed end to end", () => {
    const posts = (prefix: string) =>
      ARENA_LAYOUT.steel.filter((m) => m.id.startsWith(prefix) && m.solid);
    const slab = (id: string) =>
      ARENA_LAYOUT.platforms.find((p) => p.id === id)!;

    for (const [prefix, id] of [
      ["steel-post-south", "balcony-south"],
      ["steel-post-maintenance", "platform-maintenance"],
      ["steel-post-nw", "balcony-nw"],
    ] as const) {
      const found = posts(prefix);
      const platform = slab(id);

      expect(found.length, prefix).toBeGreaterThanOrEqual(2);

      for (const post of found) {
        // From the ground to the slab's underside, under the slab.
        expect(post.from[1]).toBe(0);
        expect(post.to[1]).toBeCloseTo(platform.bottom!);
        expect(post.to[0]).toBeGreaterThan(platform.minX);
        expect(post.to[0]).toBeLessThan(platform.maxX);
        expect(post.to[2]).toBeGreaterThan(platform.minZ);
        expect(post.to[2]).toBeLessThan(platform.maxZ);
      }
    }

    const corridor = ARENA_LAYOUT.platforms.filter((p) =>
      p.id.startsWith("roof-corridor-nw"),
    );

    // One unbroken slab: the ladder that opened it is gone.
    expect(corridor).toHaveLength(1);
    expect(ARENA_LAYOUT.ladders.some((l) => l.id === "secret-corridor")).toBe(
      false,
    );
  });

  it("the big north overlook slab stands on a few posts, not on none", () => {
    const slab = ARENA_LAYOUT.platforms.find((p) => p.id === "balcony-north")!;
    const posts = ARENA_LAYOUT.steel.filter(
      (m) => m.id.startsWith("steel-post-north") && m.solid,
    );

    expect(posts.length).toBeGreaterThanOrEqual(3);

    for (const post of posts) {
      expect(post.from[1]).toBe(0);
      expect(post.to[1]).toBeCloseTo(slab.bottom!);
      expect(post.to[0]).toBeGreaterThan(slab.minX);
      expect(post.to[0]).toBeLessThan(slab.maxX);
      expect(post.to[2]).toBeGreaterThan(slab.minZ);
      expect(post.to[2]).toBeLessThan(slab.maxZ);
    }

    // Posts along the open edge are no more than ~5.5 m apart.
    const front = posts
      .filter((m) => m.to[2] > -9)
      .map((m) => m.to[0])
      .sort((a, b) => a - b);

    for (let i = 1; i < front.length; i++) {
      expect(front[i] - front[i - 1]).toBeLessThan(5.5);
    }
  });

  it("the whole 64 x 48 m map is ringed by the perimeter wall and open to the sky", () => {
    arena.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(arena);

    expect(box.max.y).toBeGreaterThanOrEqual(PERIMETER_WALL_HEIGHT);
    expect(box.max.y).toBeLessThanOrEqual(16);
    expect(box.max.x).toBeGreaterThanOrEqual(32);
    expect(box.min.x).toBeLessThanOrEqual(-32);
    expect(box.max.z).toBeGreaterThanOrEqual(24);
    expect(box.min.z).toBeLessThanOrEqual(-24);
  });

  it("the perimeter wall is much taller than the highest roof you can stand on", () => {
    expect(PERIMETER_WALL_HEIGHT).toBeGreaterThanOrEqual(ROOF_HIGH + 2);
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
