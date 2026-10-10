/**
 * The graybox map as plain data: no Three.js, no rendering. The mesh builder,
 * the collision module, the spawn system and the tests all read this one
 * description, so the map is defined in exactly one place. The pieces
 * themselves are made by MapParts and placed in UpperFloorMap.
 *
 * Coordinates: the map is centred on (0, 0). North is -z, east is +x. Heights
 * are metres above the main floor (y = 0).
 *
 * Collision is a height field over (x, z): every solid is a column from the
 * floor up to its top, so nothing can be walked under. Roofs are drawn but do
 * not collide.
 */

export type RiseDirection = "+x" | "-x" | "+z" | "-z";

/** What a box is, so the builder can colour it and the tests can find it. */
export type PartRole =
  | "floor"
  | "wall"
  | "railing"
  | "ledge"
  | "roof"
  | "catwalk"
  | "hatch"
  | "prop"
  | "machinery";

/** A flat-topped block standing on the floor (floor slab, wall, railing, ledge, stair step). */
export interface BoxSolid {
  kind: "box";
  id: string;
  role?: PartRole;
  /**
   * Where the drawn block starts (default: `bottom`). Collision counts the
   * block as solid from `bottom` (the ground by default) up to `height`; `base`
   * only stops a wall standing on a floor from being drawn through it.
   */
  base?: number;
  /**
   * Underside for collision (default 0, a column from the ground). Anything
   * hanging over open space, such as a balcony, a roof or a catwalk, sets it so
   * a character can walk underneath.
   */
  bottom?: number;
  /**
   * How high the solid stops a walking or jumping body, if more than it is
   * drawn: a railing looks hip-high but cannot be vaulted. Shots, rocks and
   * sight lines only count its drawn height.
   */
  blockTop?: number;
  /**
   * Drawn as tinted glass instead of its role's material. Collision is by role
   * as usual (a glass barrier stops a body like a railing, a glass roof panel
   * holds you up like a roof).
   */
  glass?: boolean;
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
  /** Underside, like BoxSolid.bottom (a tank on a roof does not block the room below). */
  bottom?: number;
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
  /** Camera yaw that looks at the point the spawn faces. */
  yaw: number;
}

export type Side = "n" | "s" | "e" | "w";

export interface DoorDefinition {
  side: Side;
  /** Centre of the opening along the wall (x for n / s walls, z for e / w). */
  at: number;
  width: number;
}

/** Something you can stand in or on, kept as data for the tests, the debug view and later game modes. */
export type ZoneKind =
  "room" | "balcony" | "walkway" | "deck" | "landing" | "corridor";

export interface Zone {
  id: string;
  name: string;
  kind: ZoneKind;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Height of the floor you stand on. */
  floorY: number;
}

export interface RoomDefinition extends Zone {
  kind: "room";
  doors: DoorDefinition[];
}

/** A ladder against a vertical face. Climbing itself is not built yet; this is where it will go. */
export interface LadderDefinition {
  id: string;
  /** Centre of the ladder, a hand's width off the face. */
  x: number;
  z: number;
  /** Which way the face looks (out into the open space the ladder is reached from). */
  normal: RiseDirection;
  width: number;
  bottomY: number;
  topY: number;
  /** Where a player stands to start climbing (on the floor at the foot). */
  approach: { x: number; z: number };
  /** Where a player ends up standing at the top. */
  exit: { x: number; z: number };
  /** Hard to see from the main routes (still usable by everyone). */
  secret?: boolean;
  /**
   * A roof hatch above the ladder that must be opened (E) before the climb can
   * pass. `stopY` is the highest foot height with the head still under it.
   */
  hatch?: { id: string; stopY: number };
}

/** A hatch in a roof: shut it is part of the roof, opened it leaves a hole. */
export interface HatchDefinition {
  id: string;
  ladderId: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Underside and top of the roof it sits in. */
  bottom: number;
  top: number;
}

/** A low step a player can climb onto (jump now, a proper climb later). */
export interface LedgeDefinition {
  id: string;
  /** Floor you climb up from. */
  fromY: number;
  /** Height of the top. */
  topY: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Drawn but not solid: roofs over rooms and the lintels above doors. Collision
 * is a height field, so anything overhead would otherwise act as a wall.
 */
export type OverheadMaterial =
  "roof" | "steel" | "pipe" | "duct" | "glass" | "hazard";

export interface Overhead {
  id: string;
  /** How it is drawn (default "roof"). */
  material?: OverheadMaterial;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  bottom: number;
  top: number;
}

export const ARENA_WIDTH = 64;
export const ARENA_DEPTH = 48;
export const ARENA_HALF_X = ARENA_WIDTH / 2;
export const ARENA_HALF_Z = ARENA_DEPTH / 2;

export const OUTER_WALL_THICKNESS = 0.45;

/** Height of the upper floor above the ground. */
export const UPPER_FLOOR_Y = 4;

/**
 * The three roof layers (tops). Each is a jump or a short climb above the last:
 * room roofs, a medium roof over the decks and walkways, and a raised high roof.
 */
export const ROOF_LOW = 8.1;

export const ROOF_MID = 9.3;
export const ROOF_HIGH = 10.8;

/**
 * The wall round the whole edge of the map: well above the highest roof you
 * can stand on, so from any roof it reads as the edge of the world and not
 * something to jump over.
 */
export const PERIMETER_WALL_HEIGHT = ROOF_HIGH + 2.4;

/** Room walls above their floor, and the height of a doorway. */
export const ROOM_WALL_HEIGHT = 3.8;
export const DOOR_HEIGHT = 2.6;
export const DOOR_WIDTH = 2;
export const WALL_THICKNESS = 0.3;

/**
 * A railing is drawn hip-high and can be shot over, but it stops a body like a
 * wall (see RAILING_BLOCK_HEIGHT): nobody walks, runs or jumps over it. The way
 * off an edge is a gap, a stair or a ladder.
 */
export const RAILING_HEIGHT = 1.1;

/** What a railing stops a body at: above the highest jump and step (about 1.4 m). */
export const RAILING_BLOCK_HEIGHT = 1.6;
export const RAILING_THICKNESS = 0.2;
export const ROOF_THICKNESS = 0.3;

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

/**
 * A strong overhead anchor (a steel beam or truss, a rail) that a later
 * hanging or swinging system can use. Data only: nothing hangs from it yet.
 */
export interface HangZone {
  id: string;
  name: string;
  x: number;
  z: number;
  /** Height of the underside of the beam. */
  y: number;
  /** Which way the beam runs and how long it is (metres). */
  axis: "x" | "z";
  length: number;
  /** The floor under the hang point (the arena ground, a deck, a warehouse floor). */
  floorY: number;
}

/** How far below the beam's underside a hanging character's feet hang. */
export const HANG_DROP = 1.7;

/** A metal grate in the arena floor: a way into the vents, for the vigilante only. */
export interface VentGrate {
  id: string;
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
}

/**
 * The ventilation system under the arena floor: grates in the floor and the
 * tunnels joining them (axis-aligned rectangles on a 0.6 m grid). It is
 * entered and left only by the vigilante, through a grate, by an interaction:
 * the floor itself stays solid for everyone.
 */
export interface VentNetwork {
  id: string;
  /** Height of the floor the grating is set in (0 the arena floor, 4 the upper floor). */
  surfaceY: number;
  grates: VentGrate[];
  /**
   * The tunnels. A tunnel with `grated: false` is a plain connector under the
   * floor: no grating over it and no way in or out of it from above.
   */
  tunnels: Array<{
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    grated?: boolean;
  }>;
  /**
   * Spots over the tunnels left as plain solid floor (no grating, no way in or
   * out): where a ladder starts, so its foot is not a vent.
   */
  closed: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
}

export interface ArenaLayout {
  width: number;
  depth: number;
  /** Floor slabs, piers, ledges (anything you stand on). */
  platforms: BoxSolid[];
  /** Room walls and railings. */
  walls: BoxSolid[];
  ramps: RampSolid[];
  stairs: StairsDefinition[];
  pillars: CylinderSolid[];
  ladders: LadderDefinition[];
  ledges: LedgeDefinition[];
  overheads: Overhead[];
  /** Exposed structural steel: drawn as one merged mesh; only columns are solid. */
  steel: SteelMember[];
  hangZones: HangZone[];
  hatches: HatchDefinition[];
  /** Heights of the walkable roof layers, lowest first. */
  roofLevels: number[];
  rooms: RoomDefinition[];
  /** Balconies, landings, walkways and open decks (rooms are in `rooms`). */
  zones: Zone[];
  spawnPoints: SpawnPoint[];
  /** The ventilation system under the arena floor. */
  vents: VentNetwork;
  /** The ventilation system in the upper floor (along the walkways, touching the rooms). */
  upperVents: VentNetwork;
}

/** Camera yaw at (x, z) that looks toward (lookX, lookZ). */
export function yawToward(
  x: number,
  z: number,
  lookX: number,
  lookZ: number,
): number {
  return Math.atan2(-(lookX - x), -(lookZ - z));
}

export function spawn(
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

/**
 * The lid of an opened hatch: the panel standing on its hinge (the hole's west
 * edge), a solid you cannot walk through. It only exists while the hatch is open.
 */
export function hatchLid(hatch: HatchDefinition): BoxSolid {
  const width = (hatch.maxX - hatch.minX) * 0.96;

  return {
    kind: "box",
    id: `${hatch.id}-lid`,
    role: "hatch",
    minX: hatch.minX - 0.15,
    maxX: hatch.minX + 0.15,
    minZ:
      (hatch.minZ + hatch.maxZ) / 2 - ((hatch.maxZ - hatch.minZ) * 0.96) / 2,
    maxZ:
      (hatch.minZ + hatch.maxZ) / 2 + ((hatch.maxZ - hatch.minZ) * 0.96) / 2,
    bottom: hatch.top,
    height: hatch.top + width,
  };
}

/**
 * A ladder's body: a slim solid against its face, so nobody walks through the
 * rails. It stops 0.3 m under the top, so it never makes a ledge at the floor
 * the ladder tops out on.
 */
export function ladderBody(ladder: LadderDefinition): BoxSolid {
  const alongX = ladder.normal.endsWith("z");
  const sign = ladder.normal.startsWith("+") ? 1 : -1;
  // The ladder stands 0.12 m off its face; its body reaches 0.18 m out from it.
  const face = (alongX ? ladder.z : ladder.x) - sign * 0.12;
  const out = [face, face + sign * 0.18].sort((a, b) => a - b);
  const half = ladder.width / 2 + 0.04;
  const across = alongX ? ladder.x : ladder.z;

  return {
    kind: "box",
    id: `${ladder.id}-body`,
    role: "machinery",
    minX: alongX ? across - half : out[0],
    maxX: alongX ? across + half : out[1],
    minZ: alongX ? out[0] : across - half,
    maxZ: alongX ? out[1] : across + half,
    bottom: ladder.bottomY,
    height: ladder.topY - 0.3,
  };
}

export type SteelKind = "column" | "beam" | "brace" | "truss" | "support";

export type Vec3 = [x: number, y: number, z: number];

/**
 * One piece of exposed structural steel from `from` to `to`: an I-beam (flanges
 * and a web) or a plain rectangular bar. Drawn only; a column that stands on a
 * floor also carries the solid that stops bodies walking through it.
 */
export interface SteelMember {
  id: string;
  kind: SteelKind;
  from: Vec3;
  to: Vec3;
  profile: "i" | "box";
  /** Across the flanges (the wider way) and the section's depth, in metres. */
  width: number;
  depth: number;
  /** For an I column: which way the flanges run (default x). */
  flangeAlong?: "x" | "z";
  /** The collision of a column that stands on a floor. */
  solid?: BoxSolid;
}

/** Every collidable solid in the layout, stair steps included. */
export function allSolids(layout: ArenaLayout): Solid[] {
  return [
    ...layout.platforms,
    ...layout.walls,
    ...layout.ramps,
    ...layout.stairs.flatMap(stairsToSteps),
    ...layout.pillars,
    ...layout.hatches.map(hatchLid),
    ...layout.ladders.map(ladderBody),
    ...layout.steel.flatMap((member) => (member.solid ? [member.solid] : [])),
  ];
}
