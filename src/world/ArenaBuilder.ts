import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  OUTER_WALL_THICKNESS,
  PERIMETER_WALL_HEIGHT,
  ROOF_MID,
  stairsToSteps,
  type ArenaLayout,
  type VentNetwork,
  type BoxSolid,
  type CylinderSolid,
  type LadderDefinition,
  type Overhead,
  type PartRole,
  type RampSolid,
  type StairsDefinition,
} from "./ArenaLayout";
import { createSteelStructure } from "./SteelStructure";
import { VENT_CELL, ventBlocks, ventCeilingY, ventFloorY } from "./Vents";
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
  // The observation perches: dark blue-grey plate, matte, with a little glow so
  // the underside and the edges read as steel and not as black.
  perch: new THREE.MeshStandardMaterial({
    color: 0x5a667c,
    roughness: 0.85,
    metalness: 0.05,
    emissive: 0x1d2635,
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

/** Merges boxes (centre x, y, z and size x, y, z) into one mesh. */
function mergedBoxes(
  boxes: Array<[number, number, number, number, number, number]>,
  material: THREE.Material,
  shadows = true,
): THREE.Mesh | null {
  if (boxes.length === 0) {
    return null;
  }

  const parts = boxes.map(([x, y, z, sx, sy, sz]) => {
    const geometry = new THREE.BoxGeometry(sx, sy, sz);

    geometry.translate(x, y, z);

    return geometry;
  });
  const merged = mergeGeometries(parts, false);

  for (const part of parts) {
    part.dispose();
  }

  const mesh = new THREE.Mesh(merged, material);

  mesh.castShadow = shadows;
  mesh.receiveShadow = true;

  return mesh;
}

const ventInterior = new THREE.MeshStandardMaterial({
  name: "VentInterior",
  color: 0x28303c,
  roughness: 0.85,
  metalness: 0.2,
  emissive: 0x0a0f16,
});

const ventBars = new THREE.MeshStandardMaterial({
  name: "VentGrate",
  color: 0x6b7587,
  roughness: 0.55,
  metalness: 0.6,
  emissive: 0x10151c,
});

/**
 * The arena floor, in pieces round the grates: a real hole under each grate
 * (so you see the vent and the dark tunnel through the bars), the rest slab.
 */
export function createArenaFloor(layout: ArenaLayout): THREE.Group {
  const group = new THREE.Group();
  const halfX = layout.width / 2;
  const halfZ = layout.depth / 2;
  const holes = ventBlocks(layout.vents);
  const xs = new Set<number>([-halfX, halfX]);
  const zs = new Set<number>([-halfZ, halfZ]);

  for (const g of holes) {
    xs.add(g.minX);
    xs.add(g.maxX);
    zs.add(g.minZ);
    zs.add(g.maxZ);
  }

  const xList = [...xs].sort((a, b) => a - b);
  const zList = [...zs].sort((a, b) => a - b);
  const cells: Array<[number, number, number, number, number, number]> = [];

  for (let i = 0; i + 1 < xList.length; i++) {
    for (let j = 0; j + 1 < zList.length; j++) {
      const cx = (xList[i] + xList[i + 1]) / 2;
      const cz = (zList[j] + zList[j + 1]) / 2;

      if (
        holes.some(
          (b) => cx > b.minX && cx < b.maxX && cz > b.minZ && cz < b.maxZ,
        )
      ) {
        continue;
      }

      cells.push([
        cx,
        -0.2,
        cz,
        xList[i + 1] - xList[i],
        0.4,
        zList[j + 1] - zList[j],
      ]);
    }
  }

  const floor = mergedBoxes(cells, industrialMaterials.floor("worn"), false);

  if (floor) {
    group.add(floor);
  }

  return group;
}

/**
 * The ventilation system: the dark tunnel floor and walls under the arena floor
 * (built on the 0.6 m grid, closed on every side but where tunnels join, with
 * the underside of the floor slab as the ceiling) and, in the floor, a thin
 * metal grating over the whole path: a frame, narrow bars along its length
 * with small gaps between. The grating is cut into 1.2 m blocks, each its own
 * panel object `ventblock:<id>`, hinged on one edge (so only the block being
 * climbed through swings open).
 */
function createVentNetwork(group: THREE.Group, network: VentNetwork): void {
  const { tunnels } = network;
  const floorY = ventFloorY(network);
  const ceilingY = ventCeilingY(network);

  if (tunnels.length === 0) {
    return;
  }

  const cell = VENT_CELL;
  const open = new Set<string>();
  const key = (i: number, j: number): string => `${i},${j}`;

  for (const t of tunnels) {
    const i0 = Math.round(t.minX / cell);
    const i1 = Math.round(t.maxX / cell);
    const j0 = Math.round(t.minZ / cell);
    const j1 = Math.round(t.maxZ / cell);

    for (let i = i0; i < i1; i++) {
      for (let j = j0; j < j1; j++) {
        open.add(key(i, j));
      }
    }
  }

  const floors: Array<[number, number, number, number, number, number]> = [];
  const walls: Array<[number, number, number, number, number, number]> = [];
  const height = ceilingY - floorY;
  const wallY = floorY + height / 2;
  const thick = 0.15;

  for (const cellKey of open) {
    const [i, j] = cellKey.split(",").map(Number);
    const cx = (i + 0.5) * cell;
    const cz = (j + 0.5) * cell;

    floors.push([cx, floorY - 0.05, cz, cell, 0.1, cell]);

    if (!open.has(key(i - 1, j))) {
      walls.push([cx - cell / 2 + thick / 2, wallY, cz, thick, height, cell]);
    }

    if (!open.has(key(i + 1, j))) {
      walls.push([cx + cell / 2 - thick / 2, wallY, cz, thick, height, cell]);
    }

    if (!open.has(key(i, j - 1))) {
      walls.push([cx, wallY, cz - cell / 2 + thick / 2, cell, height, thick]);
    }

    if (!open.has(key(i, j + 1))) {
      walls.push([cx, wallY, cz + cell / 2 - thick / 2, cell, height, thick]);
    }
  }

  for (const part of [
    mergedBoxes(floors, ventInterior, false),
    // The upper network's tunnel is cut into the solid upper floor, whose cut
    // faces are its walls: no separate wall panels there.
    network.surfaceY > 0 ? null : mergedBoxes(walls, ventInterior, false),
  ]) {
    if (part) {
      group.add(part);
    }
  }

  for (const block of ventBlocks(network)) {
    const bars: Array<[number, number, number, number, number, number]> = [];
    const cx = (block.minX + block.maxX) / 2;
    const cz = (block.minZ + block.maxZ) / 2;
    const w = block.maxX - block.minX;
    const d = block.maxZ - block.minZ;
    const rim = 0.05;
    const barH = 0.06;

    // The block's own frame: it reads as a panel set into the floor.
    bars.push([cx, 0, block.minZ + rim / 2, w, barH, rim]);
    bars.push([cx, 0, block.maxZ - rim / 2, w, barH, rim]);
    bars.push([block.minX + rim / 2, 0, cz, rim, barH, d - rim * 2]);
    bars.push([block.maxX - rim / 2, 0, cz, rim, barH, d - rim * 2]);

    // Narrow bars (3 cm) along the way the tunnel runs, 9 cm gaps between.
    const pitch = 0.12;

    if (block.alongX) {
      for (
        let z = block.minZ + rim + pitch / 2;
        z < block.maxZ - rim;
        z += pitch
      ) {
        bars.push([cx, 0, z, w - rim * 2, barH, 0.03]);
      }

      bars.push([cx, -0.04, cz, 0.04, 0.04, d - rim * 2]);
    } else {
      for (
        let x = block.minX + rim + pitch / 2;
        x < block.maxX - rim;
        x += pitch
      ) {
        bars.push([x, 0, cz, 0.03, barH, d - rim * 2]);
      }

      bars.push([cx, -0.04, cz, w - rim * 2, 0.04, 0.04]);
    }

    const mesh = mergedBoxes(bars, ventBars, false);

    if (mesh) {
      const holder = new THREE.Group();

      // The block hinges on its minX edge: the holder sits on the hinge and the
      // bars (built in world coordinates) are offset back, so rotating the
      // holder about z swings the panel up and open.
      const hingeX = block.minX;
      const hingeZ = (block.minZ + block.maxZ) / 2;

      holder.name = `ventblock:${block.id}`;
      holder.userData.block = block;
      holder.position.set(hingeX, block.y, hingeZ);
      mesh.position.set(-hingeX, 0, -hingeZ);
      holder.add(mesh);
      group.add(holder);
    }
  }
}

/** The ventilation systems: the arena floor's and the upper floor's. */
export function createVents(layout: ArenaLayout): THREE.Group {
  const group = new THREE.Group();

  group.name = "Vents";
  createVentNetwork(group, layout.vents);
  createVentNetwork(group, layout.upperVents);

  return group;
}

/** A wall all round the edge of the map, up to the first floor's roofs (the frame above it is open). */
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
        PERIMETER_WALL_HEIGHT,
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
export function createPlatform(
  solid: BoxSolid,
  holes: ReadonlyArray<{
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    bottom?: number;
  }> = [],
  voids: ReadonlyArray<{
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    bottom: number;
    top: number;
  }> = [],
): THREE.Object3D {
  const mesh = blockMesh(
    solid.minX,
    solid.maxX,
    solid.minZ,
    solid.maxZ,
    solid.height,
    solid.glass
      ? industrialMaterials.glass()
      : solid.id.startsWith("hang-perch-") && solid.id.endsWith("-deck")
        ? materials.perch
        : solid.role === "wall" && isBrickWall(solid.id)
          ? industrialMaterials.brick(
              industrialMaterials.brickVariantFor(solid.id),
            )
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

  // Glass is seen through: it casts no shadow and is drawn after what is behind it.
  if (solid.glass) {
    mesh.castShadow = false;
    mesh.renderOrder = 2;
  }

  // A hatch is a panel a touch smaller than its hole, so it never fights the roof.
  if (solid.role === "hatch") {
    return createHatchPanel(solid, mesh);
  }

  // Low roofs (over rooms) let the light through so a room is readable inside.
  if (solid.role === "roof" && solid.height < ROOF_MID - 0.01) {
    mesh.castShadow = false;
  }

  // A floor with vent openings in it is cut into pieces (one merged mesh, the
  // same material): the grating blocks are open right through, and the whole
  // tunnel (`voids`) is hollow between its floor and its ceiling, so the tunnel
  // shows its cut faces even under the plain floor left at a ladder or a wall.
  if (holes.length > 0 || voids.length > 0) {
    const base = solid.base ?? solid.bottom ?? 0;
    const xs = [
      solid.minX,
      solid.maxX,
      ...holes.flatMap((h) => [h.minX, h.maxX]),
      ...voids.flatMap((h) => [h.minX, h.maxX]),
    ]
      .filter((v) => v >= solid.minX && v <= solid.maxX)
      .sort((a, c) => a - c);
    const zs = [
      solid.minZ,
      solid.maxZ,
      ...holes.flatMap((h) => [h.minZ, h.maxZ]),
      ...voids.flatMap((h) => [h.minZ, h.maxZ]),
    ]
      .filter((v) => v >= solid.minZ && v <= solid.maxZ)
      .sort((a, c) => a - c);
    const cells: Array<[number, number, number, number, number, number]> = [];
    const inside = (
      r: { minX: number; maxX: number; minZ: number; maxZ: number },
      x: number,
      z: number,
    ): boolean => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
    const add = (
      cx: number,
      cz: number,
      w: number,
      d: number,
      y0: number,
      y1: number,
    ): void => {
      if (y1 - y0 > 1e-6) {
        cells.push([cx, (y0 + y1) / 2, cz, w, y1 - y0, d]);
      }
    };

    for (let i = 0; i + 1 < xs.length; i++) {
      for (let j = 0; j + 1 < zs.length; j++) {
        const w = xs[i + 1] - xs[i];
        const d = zs[j + 1] - zs[j];

        if (w < 1e-6 || d < 1e-6) continue;

        const cx = (xs[i] + xs[i + 1]) / 2;
        const cz = (zs[j] + zs[j + 1]) / 2;
        const hole = holes.find((h) => inside(h, cx, cz));
        const hollow = voids.find((v) => inside(v, cx, cz));

        if (hole) {
          // Open right through, down to the tunnel's floor.
          add(cx, cz, w, d, base, hole.bottom ?? base);
        } else if (hollow) {
          // Solid below the tunnel's floor and above its ceiling only.
          add(cx, cz, w, d, base, hollow.bottom);
          add(cx, cz, w, d, hollow.top, solid.height);
        } else {
          add(cx, cz, w, d, base, solid.height);
        }
      }
    }

    const cut = mergedBoxes(cells, mesh.material as THREE.Material, true);

    if (cut) {
      return cut;
    }
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
  arena.add(createVents(layout));
  arena.add(createOuterWalls(layout));

  const upperBlocks = ventBlocks(layout.upperVents).map((v) => ({
    ...v,
    bottom: ventFloorY(layout.upperVents),
  }));

  for (const platform of layout.platforms) {
    // The vent openings set into this floor (same height, inside its bounds).
    const holes =
      platform.role === "floor"
        ? upperBlocks.filter(
            (v) =>
              Math.abs(v.y - platform.height) < 0.05 &&
              v.minX >= platform.minX - 1e-6 &&
              v.maxX <= platform.maxX + 1e-6 &&
              v.minZ >= platform.minZ - 1e-6 &&
              v.maxZ <= platform.maxZ + 1e-6,
          )
        : [];

    // The tunnel itself, hollow under the floor (also under any plain floor).
    const voids =
      platform.role === "floor" &&
      Math.abs(layout.upperVents.surfaceY - platform.height) < 0.05
        ? layout.upperVents.tunnels
            .filter(
              (t) =>
                t.minX >= platform.minX - 1e-6 &&
                t.maxX <= platform.maxX + 1e-6 &&
                t.minZ >= platform.minZ - 1e-6 &&
                t.maxZ <= platform.maxZ + 1e-6,
            )
            .map((t) => ({
              ...t,
              bottom: ventFloorY(layout.upperVents),
              top: ventCeilingY(layout.upperVents),
            }))
        : [];

    arena.add(createPlatform(platform, holes, voids));
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
