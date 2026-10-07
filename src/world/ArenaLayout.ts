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

/**
 * A spot that could later hold a rock pile or other pickup. It is data only
 * (nothing spawns there yet). Sites are meant to be valuable but exposed: open
 * floor with several ways in, never a protected corner.
 */
export interface ResourceSite {
  id: string;
  label: string;
  x: number;
  z: number;
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

function pillar(
  id: string,
  x: number,
  z: number,
  radius = 0.6,
  height = 2.2,
): CylinderSolid {
  return { kind: "cylinder", id, x, z, radius, height };
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
  resourceSites: ResourceSite[];
}

/** Camera yaw at (x, z) that looks toward (lookX, lookZ). */
function yawToward(x: number, z: number, lookX: number, lookZ: number): number {
  return Math.atan2(-(lookX - x), -(lookZ - z));
}

function spawn(
  index: number,
  x: number,
  z: number,
  lookX: number,
  lookZ: number,
): SpawnPoint {
  return {
    id: `spawn-${index}`,
    label: `S${index}`,
    x,
    y: 0,
    z,
    yaw: yawToward(x, z, lookX, lookZ),
  };
}

function site(index: number, x: number, z: number): ResourceSite {
  return { id: `resource-${index}`, label: `R${index}`, x, z };
}

/**
 * COMBAT-FIRST FREE-FOR-ALL LAYOUT (north is -z).
 *
 * Every strong position is paired with a weakness:
 *
 *  - There is no central platform. The middle is open floor around a 2 m
 *    monolith and a pinwheel of hoppable low walls: a place fights happen, and
 *    that can be fought around, through and over, not a hill to sit on.
 *  - Four big corner columns seal the corners, so there are no two-wall pockets
 *    to camp in and no unbroken ring to run round the perimeter forever.
 *  - Three high positions, each different:
 *      NORTH WALKWAY (2.0 m): long and narrow, so it is exposed along its whole
 *        length and a hit can knock you off. Ramp at one end, stairs at the
 *        other.
 *      EAST TOWER (2.6 m): small, one long open staircase up, or a jump up from
 *        the step beside it. Open to attack from three sides.
 *      WEST TERRACE (1.2 m): low, with a ramp, stairs and an open drop, and a
 *        lane behind it that lets you come at it from the rear.
 *  - Mid level: 0.8 m walls (hop over) and 2 m blocks (go around), set so that
 *    one side of a piece is always open for a flanker.
 *
 * Cover heights follow the ~0.93 m jump: 0.8 m can be hopped, 1.2 m can be
 * jumped onto, anything taller must be walked around.
 */
export const ARENA_LAYOUT: ArenaLayout = {
  size: ARENA_SIZE,

  platforms: [
    box("north-walkway", 0, -9.5, 14, 3.5, 2.0),
    box("east-tower", 13, 5, 6, 6, 2.6),
    box("east-step", 8, 5, 4, 4, 1.3),
    box("west-terrace", -14, 4, 6, 8, 1.5),
  ],

  ramps: [
    ramp("walkway-ramp-west", -13.5, -7, -10.75, -8.25, 2.0, "+x"),
    ramp("step-ramp", 1.5, 6, 4.5, 7, 1.3, "+x"),
    ramp("terrace-ramp-south", -16, -12.5, 8, 12.5, 1.5, "-z"),
  ],

  stairs: [
    {
      id: "walkway-stairs-east",
      start: 11.9,
      direction: "-x",
      crossMin: -10.75,
      crossMax: -8.25,
      steps: 7,
      rise: 2 / 7,
      tread: 0.7,
    },
    {
      id: "tower-stairs-south",
      start: 14.3,
      direction: "-z",
      crossMin: 11,
      crossMax: 14,
      steps: 9,
      rise: 2.6 / 9,
      tread: 0.7,
    },
    {
      id: "terrace-stairs-east",
      start: -7.5,
      direction: "-x",
      crossMin: 1,
      crossMax: 4,
      steps: 5,
      rise: 0.3,
      tread: 0.7,
    },
  ],

  covers: [
    // Centre: a monolith and a pinwheel of low walls around it.
    box("monolith", 0, 0, 2, 2, 2.0),
    box("cover-low-1", 3.5, -3.5, 4, 1, 0.8),
    box("cover-low-2", 3.5, 1.75, 1, 2.5, 0.8),
    box("cover-low-3", -3.5, 3.5, 4, 1, 0.8),
    box("cover-low-4", -3.5, -3.5, 1, 4, 0.8),
    // North-east brickyard: two blocks that overlap in sight but not in path.
    box("cover-block-5", 12.5, -6.2, 1.2, 3, 2.0),
    box("cover-block-6", 14, -13, 1.2, 4, 2.0),
    // North-west.
    box("cover-block-7", -13, -5, 1.2, 4, 2.0),
    box("cover-block-13", -14, -13.5, 1.2, 3, 2.0),
    // South-west alley: two blocks with a 2.8 m lane between them.
    box("cover-block-3", -9, 10, 6, 1.2, 2.0),
    box("cover-block-8", -9, 14, 6, 1.2, 2.0),
    // South: low hurdles to break up the sprint lane.
    box("cover-block-9", -3, 14.4, 3, 1.2, 2.0),
    box("cover-low-10", 4, 12, 3, 1, 0.8),
    // South-east block.
    box("cover-block-11", 7.5, 16.8, 2, 2, 2.0),
  ],

  pillars: [
    // Corner columns: seal the corners.
    pillar("column-nw", -17.8, -17.8, 2.2, 2.4),
    pillar("column-ne", 17.8, -17.8, 2.2, 2.4),
    pillar("column-sw", -17.8, 17.8, 2.2, 2.4),
    pillar("column-se", 17.8, 17.8, 2.2, 2.4),
    // Single sight-breakers.
    pillar("pillar-1", -9.5, -5),
    pillar("pillar-2", 6.5, -17.3),
    pillar("pillar-3", 8.5, 12.5),
    pillar("pillar-4", -2, 6.5),
    pillar("pillar-5", -2.5, 17.2),
    pillar("pillar-6", 17.6, -3.7),
  ],

  // Eleven individual points on open floor. Nobody owns one: the spawn system
  // hands them out at random each round. They face a mix of directions (along
  // lanes, across gaps, toward cover), not all toward the middle.
  spawnPoints: [
    spawn(1, -11, -17.5, -16, -11),
    spawn(2, 1, -17.5, 14, -17.5),
    spawn(3, 12, -17.5, 16, -12),
    spawn(4, -17.5, -9, -17.5, -17),
    spawn(5, 18, -8, 18, -15),
    spawn(6, -8, 17.5, -16, 17.5),
    spawn(7, 2, 17.5, 2, 12),
    spawn(8, 12, 17.5, 12, 11),
    spawn(9, -9.5, -1.5, -12, -4),
    spawn(10, 7, -5.5, 0, 0),
    spawn(11, -4.5, 8, 2, 6),
  ],

  // Contested, never protected: open floor with several ways in and sightlines
  // from more than one high position.
  resourceSites: [site(1, 6.5, 10), site(2, 8, 1), site(3, -6, -6)],
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
