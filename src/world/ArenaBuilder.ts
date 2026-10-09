import * as THREE from "three";

import {
  OUTER_WALL_HEIGHT,
  OUTER_WALL_THICKNESS,
  ROOF_MID,
  stairsToSteps,
  type ArenaLayout,
  type BoxSolid,
  type CylinderSolid,
  type LadderDefinition,
  type Overhead,
  type PartRole,
  type RampSolid,
  type StairsDefinition,
} from "./ArenaLayout";
import { createSteelStructure } from "./SteelStructure";
import { isBrickOuterWall, isBrickWall } from "./materials/WallSurfaces";
import { industrialMaterials } from "./materials/IndustrialMaterialLibrary";

/**
 * Graybox mesh builders. Each one turns a piece of the layout into meshes using
 * the shared geometries and materials below, so the whole arena is a handful of
 * materials and two geometries plus the ramp wedges.
 */

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 20);

const materials = {
  ramp: new THREE.MeshStandardMaterial({
    color: 0x7d8699,
    roughness: 0.9,
    side: THREE.DoubleSide,
  }),
  stairs: new THREE.MeshStandardMaterial({ color: 0x737c8f, roughness: 0.9 }),
  railing: new THREE.MeshStandardMaterial({ color: 0x9aa7bd, roughness: 0.8 }),
  // Climbable ledges stand out so they are easy to find.
  ledge: new THREE.MeshStandardMaterial({ color: 0xb0865a, roughness: 0.9 }),
  roofTop: new THREE.MeshStandardMaterial({
    color: 0x3c4658,
    roughness: 0.95,
  }),
  steel: new THREE.MeshStandardMaterial({
    color: 0x5a6272,
    roughness: 0.55,
    metalness: 0.5,
  }),
  prop: new THREE.MeshStandardMaterial({ color: 0x8c7c66, roughness: 0.9 }),
  machinery: new THREE.MeshStandardMaterial({
    color: 0x62707f,
    roughness: 0.6,
    metalness: 0.2,
  }),
  pipe: new THREE.MeshStandardMaterial({
    color: 0x7c6a55,
    roughness: 0.5,
    metalness: 0.45,
  }),
  // A roof hatch: amber, so it can be found in the dark.
  hatch: new THREE.MeshStandardMaterial({
    color: 0xb88a2a,
    roughness: 0.6,
    metalness: 0.4,
    emissive: 0x2a1c04,
  }),
  // The amber landing pad at a ladder's opening.
  hazard: new THREE.MeshStandardMaterial({
    color: 0xd9a21b,
    roughness: 0.7,
    emissive: 0x3a2a04,
  }),
  duct: new THREE.MeshStandardMaterial({ color: 0x4f5c6b, roughness: 0.7 }),
  glass: new THREE.MeshStandardMaterial({
    color: 0x6fa8c7,
    roughness: 0.2,
    transparent: true,
    opacity: 0.35,
    emissive: 0x16303f,
  }),
  roof: new THREE.MeshStandardMaterial({
    color: 0x4a566b,
    roughness: 0.95,
    emissive: 0x1a2130,
  }),
  ladder: new THREE.MeshStandardMaterial({
    color: 0xf0c04a,
    roughness: 0.6,
    metalness: 0.1,
    // A faint glow so a ladder reads in the dark, from above as well as below.
    emissive: 0x5a4208,
  }),
  pillar: new THREE.MeshStandardMaterial({ color: 0x9aa2af, roughness: 0.85 }),
};

/** Floors and walls are not here: their concrete and brick come from the material library. */
const roleMaterials: Record<
  Exclude<PartRole, "floor" | "wall">,
  THREE.Material
> = {
  railing: materials.railing,
  ledge: materials.ledge,
  roof: materials.roofTop,
  catwalk: materials.steel,
  prop: materials.prop,
  machinery: materials.machinery,
  hatch: materials.hatch,
};

function blockMesh(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  height: number,
  material: THREE.Material,
  base = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(unitBox, material);

  mesh.scale.set(maxX - minX, height - base, maxZ - minZ);
  mesh.position.set((minX + maxX) / 2, (height + base) / 2, (minZ + maxZ) / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

export function createArenaFloor(layout: ArenaLayout): THREE.Group {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(unitBox, industrialMaterials.floor("worn"));

  floor.scale.set(layout.width, 0.4, layout.depth);
  floor.position.y = -0.2;
  floor.receiveShadow = true;
  group.add(floor);

  // Faint 2 m grid: gives a sense of speed and distance on a plain floor.
  const points: number[] = [];
  const halfX = layout.width / 2;
  const halfZ = layout.depth / 2;

  for (let x = -halfX; x <= halfX + 1e-6; x += 2) {
    points.push(x, 0.01, -halfZ, x, 0.01, halfZ);
  }

  for (let z = -halfZ; z <= halfZ + 1e-6; z += 2) {
    points.push(-halfX, 0.01, z, halfX, 0.01, z);
  }

  const gridGeometry = new THREE.BufferGeometry();

  gridGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  group.add(
    new THREE.LineSegments(
      gridGeometry,
      new THREE.LineBasicMaterial({ color: 0x4a566b }),
    ),
  );

  return group;
}

export function createOuterWalls(layout: ArenaLayout): THREE.Group {
  const group = new THREE.Group();
  const halfX = layout.width / 2;
  const halfZ = layout.depth / 2;
  const t = OUTER_WALL_THICKNESS;

  const walls: Array<[string, number, number, number, number]> = [
    ["north", 0, -halfZ - t / 2, layout.width + t * 2, t],
    ["south", 0, halfZ + t / 2, layout.width + t * 2, t],
    ["west", -halfX - t / 2, 0, t, layout.depth],
    ["east", halfX + t / 2, 0, t, layout.depth],
  ];

  for (const [side, x, z, width, depth] of walls) {
    group.add(
      blockMesh(
        x - width / 2,
        x + width / 2,
        z - depth / 2,
        z + depth / 2,
        OUTER_WALL_HEIGHT,
        isBrickOuterWall(side)
          ? industrialMaterials.brick("worn")
          : industrialMaterials.paintedConcrete(
              industrialMaterials.paintedVariantFor(`outer-${side}`),
            ),
      ),
    );
  }

  return group;
}

/** A floor slab, wall, railing or ledge: coloured by its role. */
export function createPlatform(solid: BoxSolid): THREE.Object3D {
  const mesh = blockMesh(
    solid.minX,
    solid.maxX,
    solid.minZ,
    solid.maxZ,
    solid.height,
    solid.role === "wall" && isBrickWall(solid.id)
      ? industrialMaterials.brick(industrialMaterials.brickVariantFor(solid.id))
      : solid.role === "wall"
        ? industrialMaterials.paintedConcrete(
            industrialMaterials.paintedVariantFor(solid.id),
          )
        : solid.role && solid.role !== "floor"
          ? roleMaterials[solid.role]
          : industrialMaterials.floor(
              industrialMaterials.floorVariantFor(solid.id),
            ),
    solid.base ?? solid.bottom ?? 0,
  );

  // A hatch is a panel a touch smaller than its hole, so it never fights the roof.
  if (solid.role === "hatch") {
    return createHatchPanel(solid, mesh);
  }

  // Low roofs (over rooms) let the light through so a room is readable inside.
  if (solid.role === "roof" && solid.height < ROOF_MID - 0.01) {
    mesh.castShadow = false;
  }

  return mesh;
}

/**
 * The hatch panel on a hinge along its west edge. Shut it lies in the roof; open
 * (rotation.z about +1.75 rad, set by the game) it stands up at the hinge,
 * leaning back over the roof beyond the hole and still in view. It is solid
 * while open (see hatchLid). Named `hatch:<id>`.
 */
function createHatchPanel(solid: BoxSolid, mesh: THREE.Mesh): THREE.Group {
  const pivot = new THREE.Group();
  const width = (solid.maxX - solid.minX) * 0.96;

  pivot.name = `hatch:${solid.id}`;
  pivot.position.set(
    solid.minX + 0.02,
    solid.height + 0.01,
    (solid.minZ + solid.maxZ) / 2,
  );

  // The panel hangs off the hinge: it extends east, its top at the pivot.
  mesh.scale.x = width;
  mesh.scale.z = (solid.maxZ - solid.minZ) * 0.96;
  mesh.position.set(width / 2, -mesh.scale.y / 2, 0);
  pivot.add(mesh);

  return pivot;
}

/** A roof or a beam: drawn, never solid. */
export function createOverhead(overhead: Overhead): THREE.Mesh {
  const mesh = blockMesh(
    overhead.minX,
    overhead.maxX,
    overhead.minZ,
    overhead.maxZ,
    overhead.top,
    materials[overhead.material ?? "roof"],
    overhead.bottom,
  );

  // Room roofs let the light through so a room is readable inside (graybox).
  // Steel beams, pipes and ducts cast shadows; glass does not.
  const solid =
    overhead.material !== undefined && overhead.material !== "glass";

  mesh.castShadow = solid;
  mesh.receiveShadow = true;

  return mesh;
}

/** Two rails and a rung every 30 cm, from the foot to a metre above the top. */
export function createLadder(ladder: LadderDefinition): THREE.Group {
  const group = new THREE.Group();
  const height = ladder.topY - ladder.bottomY + 1;
  const half = ladder.width / 2;

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(unitBox, materials.ladder);

    rail.scale.set(0.07, height, 0.07);
    rail.position.set(side * half, ladder.bottomY + height / 2, 0);
    group.add(rail);
  }

  // The rungs are one instanced mesh, however tall the ladder is.
  const rungs: number[] = [];

  for (let y = ladder.bottomY + 0.3; y < ladder.bottomY + height; y += 0.3) {
    rungs.push(y);
  }

  const rungMesh = new THREE.InstancedMesh(
    unitBox,
    materials.ladder,
    rungs.length,
  );
  const matrix = new THREE.Matrix4();

  rungs.forEach((y, index) => {
    matrix.compose(
      new THREE.Vector3(0, y, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(ladder.width, 0.05, 0.05),
    );
    rungMesh.setMatrixAt(index, matrix);
  });
  rungMesh.frustumCulled = false;
  group.add(rungMesh);

  // The ladder's local x runs across the face.
  const alongX = ladder.normal.endsWith("z");

  group.position.set(ladder.x, 0, ladder.z);
  group.rotation.y = alongX ? 0 : Math.PI / 2;

  return group;
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

export function createPillar(solid: CylinderSolid): THREE.Mesh {
  const mesh = new THREE.Mesh(unitCylinder, materials.pillar);

  const base = solid.bottom ?? 0;

  mesh.scale.set(solid.radius, solid.height - base, solid.radius);
  mesh.position.set(solid.x, (solid.height + base) / 2, solid.z);
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

  for (const wall of layout.walls) {
    arena.add(createPlatform(wall));
  }

  for (const overhead of layout.overheads) {
    arena.add(createOverhead(overhead));
  }

  for (const ladder of layout.ladders) {
    arena.add(createLadder(ladder));
  }

  const steel = createSteelStructure(layout.steel);

  if (steel) {
    arena.add(steel);
  }

  for (const pillar of layout.pillars) {
    arena.add(createPillar(pillar));
  }

  return arena;
}
