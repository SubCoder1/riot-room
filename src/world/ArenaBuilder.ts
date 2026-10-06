import * as THREE from "three";

import {
  ARENA_HALF,
  WALL_HEIGHT,
  WALL_THICKNESS,
  stairsToSteps,
  type ArenaLayout,
  type BoxSolid,
  type CylinderSolid,
  type RampSolid,
  type StairsDefinition,
} from "./ArenaLayout";

/**
 * Graybox mesh builders. Each one turns a piece of the layout into meshes using
 * the shared geometries and materials below, so the whole arena is a handful of
 * materials and two geometries plus the ramp wedges.
 */

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 20);

const materials = {
  floor: new THREE.MeshStandardMaterial({ color: 0x3b4452, roughness: 0.95 }),
  wall: new THREE.MeshStandardMaterial({
    color: 0x2d3a4c,
    roughness: 0.8,
    metalness: 0.25,
  }),
  platform: new THREE.MeshStandardMaterial({ color: 0x6b7385, roughness: 0.9 }),
  ramp: new THREE.MeshStandardMaterial({
    color: 0x7d8699,
    roughness: 0.9,
    side: THREE.DoubleSide,
  }),
  stairs: new THREE.MeshStandardMaterial({ color: 0x737c8f, roughness: 0.9 }),
  cover: new THREE.MeshStandardMaterial({ color: 0x8d95a3, roughness: 0.9 }),
  pillar: new THREE.MeshStandardMaterial({ color: 0x9aa2af, roughness: 0.85 }),
};

function blockMesh(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  height: number,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(unitBox, material);

  mesh.scale.set(maxX - minX, height, maxZ - minZ);
  mesh.position.set((minX + maxX) / 2, height / 2, (minZ + maxZ) / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

export function createArenaFloor(layout: ArenaLayout): THREE.Group {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(unitBox, materials.floor);

  floor.scale.set(layout.size, 0.4, layout.size);
  floor.position.y = -0.2;
  floor.receiveShadow = true;
  group.add(floor);

  // Faint 2 m grid: gives a sense of speed and distance on a plain floor.
  const grid = new THREE.GridHelper(
    layout.size,
    layout.size / 2,
    0x55627a,
    0x4a566b,
  );

  grid.position.y = 0.01;
  group.add(grid);

  return group;
}

export function createOuterWalls(layout: ArenaLayout): THREE.Group {
  const group = new THREE.Group();
  const span = layout.size + WALL_THICKNESS * 2;
  const offset = ARENA_HALF + WALL_THICKNESS / 2;

  const walls: Array<[number, number, number, number]> = [
    [0, -offset, span, WALL_THICKNESS], // north
    [0, offset, span, WALL_THICKNESS], // south
    [-offset, 0, WALL_THICKNESS, layout.size], // west
    [offset, 0, WALL_THICKNESS, layout.size], // east
  ];

  for (const [x, z, width, depth] of walls) {
    const wall = blockMesh(
      x - width / 2,
      x + width / 2,
      z - depth / 2,
      z + depth / 2,
      WALL_HEIGHT,
      materials.wall,
    );

    group.add(wall);
  }

  return group;
}

export function createPlatform(solid: BoxSolid): THREE.Mesh {
  return blockMesh(
    solid.minX,
    solid.maxX,
    solid.minZ,
    solid.maxZ,
    solid.height,
    materials.platform,
  );
}

/** A wedge: the low edge sits on the floor, the high edge is `height` up. */
export function createRamp(solid: RampSolid): THREE.Mesh {
  const alongX = solid.direction.endsWith("x");
  const rising = solid.direction.startsWith("+");
  const { minX, maxX, minZ, maxZ, height } = solid;

  // Four footprint corners as [x, z, y].
  const heightAt = (x: number, z: number): number => {
    const along = alongX ? x : z;
    const low = alongX ? (rising ? minX : maxX) : rising ? minZ : maxZ;
    const length = alongX ? maxX - minX : maxZ - minZ;

    return (Math.abs(along - low) / length) * height;
  };

  const corner = (x: number, z: number): [number, number, number] => [
    x,
    heightAt(x, z),
    z,
  ];
  const floorCorner = (x: number, z: number): [number, number, number] => [
    x,
    0,
    z,
  ];

  const a = corner(minX, minZ);
  const b = corner(maxX, minZ);
  const c = corner(maxX, maxZ);
  const d = corner(minX, maxZ);
  const fa = floorCorner(minX, minZ);
  const fb = floorCorner(maxX, minZ);
  const fc = floorCorner(maxX, maxZ);
  const fd = floorCorner(minX, maxZ);

  const triangles = [
    // sloped top
    a,
    d,
    c,
    a,
    c,
    b,
    // sides
    a,
    fa,
    fb,
    a,
    fb,
    b,
    d,
    fd,
    fc,
    d,
    fc,
    c,
    a,
    fa,
    fd,
    a,
    fd,
    d,
    b,
    fb,
    fc,
    b,
    fc,
    c,
  ];

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(triangles.flat(), 3),
  );
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, materials.ramp);

  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

export function createStairs(stairs: StairsDefinition): THREE.Group {
  const group = new THREE.Group();

  for (const step of stairsToSteps(stairs)) {
    group.add(
      blockMesh(
        step.minX,
        step.maxX,
        step.minZ,
        step.maxZ,
        step.height,
        materials.stairs,
      ),
    );
  }

  return group;
}

export function createCover(solid: BoxSolid): THREE.Mesh {
  return blockMesh(
    solid.minX,
    solid.maxX,
    solid.minZ,
    solid.maxZ,
    solid.height,
    materials.cover,
  );
}

export function createPillar(solid: CylinderSolid): THREE.Mesh {
  const mesh = new THREE.Mesh(unitCylinder, materials.pillar);

  mesh.scale.set(solid.radius, solid.height, solid.radius);
  mesh.position.set(solid.x, solid.height / 2, solid.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

/** The whole map as one group. */
export function buildArena(layout: ArenaLayout): THREE.Group {
  const arena = new THREE.Group();

  arena.name = "ArenaGeometry";
  arena.add(createArenaFloor(layout));
  arena.add(createOuterWalls(layout));

  for (const platform of layout.platforms) {
    arena.add(createPlatform(platform));
  }

  for (const ramp of layout.ramps) {
    arena.add(createRamp(ramp));
  }

  for (const stairs of layout.stairs) {
    arena.add(createStairs(stairs));
  }

  for (const cover of layout.covers) {
    arena.add(createCover(cover));
  }

  for (const pillar of layout.pillars) {
    arena.add(createPillar(pillar));
  }

  return arena;
}
