/**
 * The graybox arena as plain data: no Three.js, no rendering. The mesh builder,
 * the collision module, the spawn system and the tests all read this one
 * description, so the map is defined in exactly one place.
 *
 * Coordinates: the arena is centred on (0, 0). North is -z. Heights are metres
 * above the main floor (y = 0).
 */

export type RiseDirection = "+x" | "-x" | "+z" | "-z";

/** A flat-topped block standing on the floor (platform, cover, stair step). */
export interface BoxSolid {
  kind: "box";
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

/** An inclined surface that rises from the floor to `height` along `direction`. */
export interface RampSolid {
  kind: "ramp";
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  direction: RiseDirection;
}

export interface CylinderSolid {
  kind: "cylinder";
  id: string;
  x: number;
  z: number;
  radius: number;
  height: number;
}

export type Solid = BoxSolid | RampSolid | CylinderSolid;

/** A flight of steps. It expands into one BoxSolid per step. */
export interface StairsDefinition {
  id: string;
  /** Low edge of the first step, along the rise axis. */
  start: number;
  direction: RiseDirection;
  /** Across-the-stairs extent. */
  crossMin: number;
  crossMax: number;
  steps: number;
  rise: number;
  tread: number;
}

export interface SpawnPoint {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  /** Camera yaw that looks at the arena centre. */
  yaw: number;
}

export const ARENA_SIZE = 40;
export const ARENA_HALF = ARENA_SIZE / 2;
export const WALL_HEIGHT = 4;
export const WALL_THICKNESS = 0.45;

function box(
  id: string,
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
  height: number,
): BoxSolid {
  return {
    kind: "box",
    id,
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    minZ: centerZ - depth / 2,
    maxZ: centerZ + depth / 2,
    height,
  };
}

function ramp(
  id: string,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  height: number,
  direction: RiseDirection,
): RampSolid {
  return { kind: "ramp", id, minX, maxX, minZ, maxZ, height, direction };
}

function pillar(id: string, x: number, z: number): CylinderSolid {
  return { kind: "cylinder", id, x, z, radius: 0.6, height: 2.2 };
}

/** Expands a flight of stairs into its individual steps. */
export function stairsToSteps(stairs: StairsDefinition): BoxSolid[] {
  const steps: BoxSolid[] = [];
  const sign = stairs.direction.startsWith("+") ? 1 : -1;
  const alongX = stairs.direction.endsWith("x");

  for (let i = 0; i < stairs.steps; i++) {
    // Each step spans [a, b] along the rise axis.
    const a = stairs.start + sign * stairs.tread * i;
    const b = a + sign * stairs.tread;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);

    steps.push({
      kind: "box",
      id: `${stairs.id}-step${i + 1}`,
      minX: alongX ? lo : stairs.crossMin,
      maxX: alongX ? hi : stairs.crossMax,
      minZ: alongX ? stairs.crossMin : lo,
      maxZ: alongX ? stairs.crossMax : hi,
      height: stairs.rise * (i + 1),
    });
  }

  return steps;
}

export interface ArenaLayout {
  size: number;
  platforms: BoxSolid[];
  ramps: RampSolid[];
  stairs: StairsDefinition[];
  covers: BoxSolid[];
  pillars: CylinderSolid[];
  spawnPoints: SpawnPoint[];
}

/** Camera yaw at (x, z) that looks at the arena centre. */
function yawToCentre(x: number, z: number): number {
  return Math.atan2(x, z);
}

function spawn(index: number, x: number, z: number): SpawnPoint {
  return {
    id: `spawn-${index}`,
    label: `S${index}`,
    x,
    y: 0,
    z,
    yaw: yawToCentre(x, z),
  };
}

/**
 * Open floor in the middle, a 10 x 10 central platform, two smaller side
 * platforms (different heights, not mirrored), ramps and stairs onto each, and
 * scattered cover. Cover heights are chosen against the player's ~0.93 m jump:
 * 0.8 m can be hopped, 2 m blocks and pillars must be walked around.
 */
export const ARENA_LAYOUT: ArenaLayout = {
  size: ARENA_SIZE,

  platforms: [
    box("center-platform", 0, 0, 10, 10, 1.8),
    box("west-platform", -14, 3, 8, 8, 1.2),
    box("east-platform", 14, -5, 8, 8, 1.5),
  ],

  ramps: [
    ramp("center-ramp-south", -2, 2, 5, 11.5, 1.8, "-z"),
    ramp("west-ramp-north", -16, -12.5, -5.5, -1, 1.2, "+z"),
    ramp("east-ramp-south", 12, 15.5, -1, 4.6, 1.5, "-z"),
  ],

  stairs: [
    {
      id: "center-stairs-north",
      start: -9.2,
      direction: "+z",
      crossMin: -2,
      crossMax: 2,
      steps: 6,
      rise: 0.3,
      tread: 0.7,
    },
    {
      id: "west-stairs-south",
      start: 9.8,
      direction: "-z",
      crossMin: -16,
      crossMax: -12,
      steps: 4,
      rise: 0.3,
      tread: 0.7,
    },
    {
      id: "east-stairs-west",
      start: 6.5,
      direction: "+x",
      crossMin: -6,
      crossMax: -3,
      steps: 5,
      rise: 0.3,
      tread: 0.7,
    },
  ],

  covers: [
    box("cover-low-1", -9, -9, 4, 1, 0.8),
    box("cover-low-2", 6, 11, 1, 4, 0.8),
    box("cover-block-3", -6, 13, 3, 1, 2.0),
    box("cover-block-4", 7, -13, 3, 1, 2.0),
    box("cover-block-5", -12, -14, 1, 3, 2.0),
    box("cover-block-6", 13, 12, 2, 2, 2.0),
  ],

  pillars: [
    pillar("pillar-1", -8, -4),
    pillar("pillar-2", 9, 3),
    pillar("pillar-3", 0, -14),
    pillar("pillar-4", 0, 14),
    pillar("pillar-5", 17, 7),
  ],

  // Ten individual points on the floor, spread around the arena, each with
  // open space around it. They are not owned by anyone: the spawn system hands
  // them out at random every round.
  spawnPoints: [
    spawn(1, -16, -16),
    spawn(2, -3, -17),
    spawn(3, 10, -17),
    spawn(4, -17, -8),
    spawn(5, 18, -13),
    spawn(6, -17, 15),
    spawn(7, 16, 17),
    spawn(8, -1, 17),
    spawn(9, -7, 7),
    spawn(10, 10, 7),
  ],
};

/** Every collidable solid in the layout, stair steps included. */
export function allSolids(layout: ArenaLayout = ARENA_LAYOUT): Solid[] {
  return [
    ...layout.platforms,
    ...layout.ramps,
    ...layout.stairs.flatMap(stairsToSteps),
    ...layout.covers,
    ...layout.pillars,
  ];
}
