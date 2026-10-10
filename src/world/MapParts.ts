import {
  DOOR_HEIGHT,
  DOOR_WIDTH,
  RAILING_BLOCK_HEIGHT,
  RAILING_HEIGHT,
  RAILING_THICKNESS,
  ROOF_THICKNESS,
  ROOM_WALL_HEIGHT,
  WALL_THICKNESS,
  type ArenaLayout,
  type BoxSolid,
  type DoorDefinition,
  type LadderDefinition,
  type LedgeDefinition,
  type OverheadMaterial,
  type PileDefinition,
  type PileKind,
  type SteelKind,
  type SteelMember,
  type Vec3,
  type PartRole,
  type RiseDirection,
  type RoomDefinition,
  type Side,
  type StairsDefinition,
  type Zone,
  type ZoneKind,
} from "./ArenaLayout";
import { buildBarrierShape, buildPile, type BarrierStyle } from "./PileShapes";

/** A stretch along a wall or railing that is left open. */
interface Gap {
  from: number;
  to: number;
}

/** How thick a floating balcony or a catwalk is. */
const FLOATING_THICKNESS = 0.5;
const CATWALK_THICKNESS = 0.25;

/** How wide the opening in a railing is where a ladder tops out. */
const LADDER_GAP = 2.2;
const LADDER_WIDTH = 0.7;
/** How far a ladder stands off the face it climbs. */
const LADDER_OFFSET = 0.12;

export type PropKind =
  | "crate"
  | "crateStack"
  | "shelf"
  | "rack"
  | "bench"
  | "machine"
  | "bed"
  | "locker"
  | "console"
  | "table"
  | "vent"
  | "cabinet";

/** Sizes (metres) of the graybox props, long side along x unless turned. */
const PROP_SIZES: Record<
  PropKind,
  { width: number; depth: number; height: number; role: PartRole }
> = {
  crate: { width: 1.1, depth: 1.1, height: 1, role: "prop" },
  crateStack: { width: 2, depth: 2, height: 1.8, role: "prop" },
  shelf: { width: 3, depth: 0.8, height: 2, role: "prop" },
  rack: { width: 3, depth: 1, height: 2, role: "machinery" },
  bench: { width: 2.4, depth: 0.9, height: 1, role: "prop" },
  machine: { width: 1.8, depth: 1.4, height: 1.6, role: "machinery" },
  bed: { width: 2, depth: 0.9, height: 0.7, role: "prop" },
  locker: { width: 0.8, depth: 0.6, height: 1.9, role: "prop" },
  console: { width: 1.4, depth: 0.8, height: 1, role: "machinery" },
  table: { width: 2.4, depth: 1.2, height: 0.8, role: "prop" },
  vent: { width: 2, depth: 1.4, height: 1, role: "machinery" },
  cabinet: { width: 1.2, depth: 0.7, height: 2, role: "machinery" },
};

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface RoomOptions {
  id: string;
  name: string;
  bounds: Bounds;
  floorY: number;
  /** Sides that get a wall (default all four). A shared wall is built by one room only. */
  walls?: Side[];
  doors: Array<{ side: Side; at: number; width?: number }>;
  /** Draw a roof (default true). It is a real slab: you can walk on it. */
  roof?: boolean;
  /** Wall height above the floor (default ROOM_WALL_HEIGHT); the roof sits on top. */
  wallHeight?: number;
}

export interface LadderOptions {
  id: string;
  /** Which way the face looks: the side the ladder is reached from. */
  normal: RiseDirection;
  /** Where the face is (x for an east / west face, z for a north / south one). */
  face: number;
  /** Position along the face. */
  along: number;
  /** Height of the floor the ladder tops out on. */
  topY: number;
  /** Height of the floor at its foot (default 0, the ground). */
  bottomY?: number;
  /** Hard to see from the main routes. */
  secret?: boolean;
}

export interface RailingOptions {
  id: string;
  /** Along a line of constant z (`axis` "x") or constant x (`axis` "z"). */
  axis: "x" | "z";
  /** The line: the edge of the floor the railing stands on. */
  at: number;
  from: number;
  to: number;
  floorY: number;
  /** Which side of `at` the railing stands on (the floor side): +1 or -1. */
  inside: 1 | -1;
  /** Extra openings (a ladder's own gap is added by itself). */
  gaps?: Gap[];
}

/**
 * Builds a map out of named parts (floor sections, rooms, balconies, walkways,
 * staircases, ladders, railings, ledges). Everything lands in a plain
 * ArenaLayout, so the map stays easy to rearrange.
 */
export class MapBuilder {
  private readonly layout: ArenaLayout;

  constructor(width: number, depth: number) {
    this.layout = {
      width,
      depth,
      platforms: [],
      walls: [],
      ramps: [],
      stairs: [],
      pillars: [],
      ladders: [],
      ledges: [],
      overheads: [],
      steel: [],
      hangZones: [],
      hatches: [],
      roofLevels: [],
      rooms: [],
      zones: [],
      spawnPoints: [],
      vents: { id: "ground", surfaceY: 0, grates: [], tunnels: [], closed: [] },
      upperVents: {
        id: "upper",
        surfaceY: 4,
        grates: [],
        tunnels: [],
        closed: [],
      },
      piles: [],
      decals: [],
    };
  }

  public build(): ArenaLayout {
    return this.layout;
  }

  // ---------------------------------------------------------------- floors

  /** A floor slab at `floorY`, solid down to the ground. */
  public createFloorSection(
    id: string,
    bounds: Bounds,
    floorY: number,
    role: PartRole = "floor",
  ): BoxSolid {
    const slab: BoxSolid = {
      kind: "box",
      id,
      role,
      ...bounds,
      height: floorY,
    };

    this.layout.platforms.push(slab);

    return slab;
  }

  private addZone(
    kind: ZoneKind,
    id: string,
    name: string,
    bounds: Bounds,
    floorY: number,
  ): Zone {
    const zone: Zone = { id, name, kind, ...bounds, floorY };

    this.layout.zones.push(zone);

    return zone;
  }

  /** A named walking strip on a floor that already exists. */
  public createWalkway(
    id: string,
    name: string,
    bounds: Bounds,
    floorY: number,
  ): Zone {
    return this.addZone("walkway", id, name, bounds, floorY);
  }

  /** A recessed balcony: a named area set back into the building, on a floor that already exists. */
  public createRecess(
    id: string,
    name: string,
    bounds: Bounds,
    floorY: number,
  ): Zone {
    return this.addZone("balcony", id, name, bounds, floorY);
  }

  /** A named open area (a plaza, a terrace) on a floor that already exists. */
  public createDeck(
    id: string,
    name: string,
    bounds: Bounds,
    floorY: number,
  ): Zone {
    return this.addZone("deck", id, name, bounds, floorY);
  }

  /**
   * A floor section that sticks out over the central arena (or a landing at the
   * top of stairs). A floating one hangs over open ground (you can walk under
   * it); otherwise it is solid down to the ground.
   */
  public createBalcony(
    id: string,
    name: string,
    bounds: Bounds,
    floorY: number,
    kind: "balcony" | "landing" = "balcony",
    floating = false,
  ): Zone {
    const slab = this.createFloorSection(id, bounds, floorY);

    // A floating balcony hangs over open ground: you can walk under it.
    if (floating) {
      slab.bottom = floorY - FLOATING_THICKNESS;
    }

    return this.addZone(kind, id, name, bounds, floorY);
  }

  // ----------------------------------------------------------------- walls

  /**
   * A straight wall box on a floor. `along` runs between `from` and `to` on the
   * line `at`; openings are left out.
   */
  public createWall(
    id: string,
    axis: "x" | "z",
    at: number,
    from: number,
    to: number,
    floorY: number,
    thickness: number,
    height: number,
    role: PartRole = "wall",
    gaps: Gap[] = [],
    glass = false,
  ): void {
    const cuts = [...gaps]
      .filter((gap) => gap.to > from && gap.from < to)
      .sort((a, b) => a.from - b.from);
    const pieces: Array<[number, number]> = [];
    let cursor = from;

    for (const gap of cuts) {
      if (gap.from > cursor) {
        pieces.push([cursor, gap.from]);
      }

      cursor = Math.max(cursor, gap.to);
    }

    if (cursor < to) {
      pieces.push([cursor, to]);
    }

    pieces.forEach(([a, b], index) => {
      const across: [number, number] = [at, at + thickness];

      this.layout.walls.push({
        kind: "box",
        id: `${id}-${index + 1}`,
        role,
        glass: glass || undefined,
        minX: axis === "x" ? a : across[0],
        maxX: axis === "x" ? b : across[1],
        minZ: axis === "x" ? across[0] : a,
        maxZ: axis === "x" ? across[1] : b,
        base: floorY,
        // Standing on a floor: it does not reach down through whatever hangs
        // below that floor (a balcony over open ground, a roof over a room).
        bottom: floorY,
        height: floorY + height,
        // A railing is drawn low but stops a body above the highest jump.
        // (and so does a low wall such as a roof parapet).
        blockTop:
          (role === "railing" || role === "wall") &&
          height < RAILING_BLOCK_HEIGHT
            ? floorY + RAILING_BLOCK_HEIGHT
            : undefined,
      });
    });
  }

  /**
   * A railing along the edge of a floor. It is waist-high: too tall to hop, low
   * enough to see and shoot over. A ladder that tops out along it leaves its
   * own opening.
   */
  public createRailing(options: RailingOptions): void {
    const { axis, at, floorY, inside } = options;
    const lo = inside > 0 ? at : at - RAILING_THICKNESS;
    const ladderGaps = this.layout.ladders
      .filter((ladder) => {
        // The ladder's top exit is on this floor, beside this edge.
        const face = axis === "x" ? ladder.exit.z : ladder.exit.x;

        return (
          Math.abs(ladder.topY - floorY) < 1e-6 &&
          Math.abs(face - (inside > 0 ? at + 0.6 : at - 0.6)) < 0.5
        );
      })
      .map((ladder) => {
        const centre = axis === "x" ? ladder.exit.x : ladder.exit.z;

        return { from: centre - LADDER_GAP / 2, to: centre + LADDER_GAP / 2 };
      });

    this.createWall(
      options.id,
      axis,
      lo,
      options.from,
      options.to,
      floorY,
      RAILING_THICKNESS,
      RAILING_HEIGHT,
      "railing",
      [...(options.gaps ?? []), ...ladderGaps],
    );

    // A proper opening: a gate post at each end and an amber landing pad on the
    // floor in front of the ladder, so it reads as the way down (or up).
    ladderGaps.forEach((gap, index) => {
      const own = (options.gaps ?? []).some(
        (other) => other.from < gap.to + 0.2 && other.to > gap.from - 0.2,
      );

      this.createOverhead(
        `${options.id}-landing-${index + 1}`,
        axis === "x"
          ? {
              minX: gap.from,
              maxX: gap.to,
              minZ: inside > 0 ? at : at - 0.9,
              maxZ: inside > 0 ? at + 0.9 : at,
            }
          : {
              minX: inside > 0 ? at : at - 0.9,
              maxX: inside > 0 ? at + 0.9 : at,
              minZ: gap.from,
              maxZ: gap.to,
            },
        floorY,
        floorY + 0.03,
        "hazard",
      );

      // Posts only where the gap is cut into a rail of its own (not where it
      // runs into another opening, or off the end of the rail).
      if (own || gap.from - 0.2 < options.from || gap.to + 0.2 > options.to) {
        return;
      }

      for (const [slot, start] of [
        [1, gap.from - 0.16],
        [2, gap.to],
      ] as const) {
        this.createWall(
          `${options.id}-post-${index + 1}-${slot}`,
          axis,
          lo - 0.04,
          start,
          start + 0.16,
          floorY,
          RAILING_THICKNESS + 0.08,
          RAILING_HEIGHT + 0.2,
          "railing",
        );
      }
    });
  }

  /**
   * A room: walls with doorways, a floor that already exists under it, and a
   * roof (drawn only; collision is a height field). A wall shared with a
   * neighbouring room is built by one of the two.
   */
  public createRoom(options: RoomOptions): RoomDefinition {
    const { bounds, floorY } = options;
    const sides = options.walls ?? ["n", "s", "e", "w"];
    const t = WALL_THICKNESS;
    const wallHeight = options.wallHeight ?? ROOM_WALL_HEIGHT;
    const doors: DoorDefinition[] = options.doors.map((door) => ({
      side: door.side,
      at: door.at,
      width: door.width ?? DOOR_WIDTH,
    }));

    for (const side of sides) {
      const mine = doors.filter((door) => door.side === side);
      const gaps = mine.map((door) => ({
        from: door.at - door.width / 2,
        to: door.at + door.width / 2,
      }));
      const id = `${options.id}-wall-${side}`;

      // North and south walls run the full width; east and west fit between them.
      if (side === "n") {
        this.createWall(
          id,
          "x",
          bounds.minZ,
          bounds.minX,
          bounds.maxX,
          floorY,
          t,
          wallHeight,
          "wall",
          gaps,
        );
      } else if (side === "s") {
        this.createWall(
          id,
          "x",
          bounds.maxZ - t,
          bounds.minX,
          bounds.maxX,
          floorY,
          t,
          wallHeight,
          "wall",
          gaps,
        );
      } else if (side === "w") {
        this.createWall(
          id,
          "z",
          bounds.minX,
          bounds.minZ + t,
          bounds.maxZ - t,
          floorY,
          t,
          wallHeight,
          "wall",
          gaps,
        );
      } else {
        this.createWall(
          id,
          "z",
          bounds.maxX - t,
          bounds.minZ + t,
          bounds.maxZ - t,
          floorY,
          t,
          wallHeight,
          "wall",
          gaps,
        );
      }
    }

    // Above each doorway: drawn only, so the opening stays walkable.
    doors.forEach((door, index) => {
      const half = door.width / 2;
      const across =
        door.side === "n"
          ? [bounds.minZ, bounds.minZ + t]
          : door.side === "s"
            ? [bounds.maxZ - t, bounds.maxZ]
            : door.side === "w"
              ? [bounds.minX, bounds.minX + t]
              : [bounds.maxX - t, bounds.maxX];
      const horizontal = door.side === "n" || door.side === "s";

      // The wall above the door: solid from the top of the doorway up, so
      // nobody (on a prop, or jumping) passes through it.
      this.layout.walls.push({
        kind: "box",
        id: `${options.id}-lintel-${index + 1}`,
        role: "wall",
        minX: horizontal ? door.at - half : across[0],
        maxX: horizontal ? door.at + half : across[1],
        minZ: horizontal ? across[0] : door.at - half,
        maxZ: horizontal ? across[1] : door.at + half,
        bottom: floorY + DOOR_HEIGHT,
        height: floorY + wallHeight,
      });
    });

    if (options.roof !== false) {
      this.createRoofSection(
        `${options.id}-roof`,
        bounds,
        floorY + wallHeight + ROOF_THICKNESS,
      );
    }

    const room: RoomDefinition = {
      id: options.id,
      name: options.name,
      kind: "room",
      ...bounds,
      floorY,
      doors,
    };

    this.layout.rooms.push(room);

    return room;
  }

  // ----------------------------------------------------------------- roofs

  /**
   * A roof slab with its top at `top`. It is a real surface: you can walk on
   * it, and a character underneath is not blocked by it.
   */
  public createRoofSection(
    id: string,
    area: Bounds,
    top: number,
    thickness = ROOF_THICKNESS,
    hole?: Bounds,
  ): BoxSolid {
    const make = (name: string, part: Bounds): BoxSolid => ({
      kind: "box",
      id: name,
      role: "roof",
      ...part,
      bottom: top - thickness,
      height: top,
    });
    // With a hole (for a hatch) the slab is built from the pieces around it.
    const pieces: Bounds[] = hole
      ? [
          { ...area, maxX: hole.minX },
          { ...area, minX: hole.maxX },
          { ...area, minX: hole.minX, maxX: hole.maxX, maxZ: hole.minZ },
          { ...area, minX: hole.minX, maxX: hole.maxX, minZ: hole.maxZ },
        ].filter((p) => p.maxX - p.minX > 0.01 && p.maxZ - p.minZ > 0.01)
      : [area];
    const slabs = pieces.map((part, index) =>
      make(hole ? `${id}-${index + 1}` : id, part),
    );
    const slab = slabs[0];

    this.layout.platforms.push(...slabs);

    if (!this.layout.roofLevels.some((level) => Math.abs(level - top) < 1e-6)) {
      this.layout.roofLevels.push(top);
      this.layout.roofLevels.sort((a, b) => a - b);
    }

    return slab;
  }

  /**
   * A hatch in a roof, over a ladder's climb: the roof must have been built
   * with this hole. Shut it is solid like the roof; once opened (in the game) it
   * is a hole, and the ladder can pass.
   */
  public createHatch(
    id: string,
    ladderId: string,
    hole: Bounds,
    top: number,
    thickness = ROOF_THICKNESS,
  ): void {
    const bottom = top - thickness;

    this.layout.platforms.push({
      kind: "box",
      id,
      role: "hatch",
      ...hole,
      bottom,
      height: top,
    });
    this.layout.hatches.push({ id, ladderId, ...hole, bottom, top });

    const ladder = this.layout.ladders.find((l) => l.id === ladderId);

    if (ladder) {
      // The head must stay under the hatch: 1.8 m of body, a little to spare.
      ladder.hatch = { id, stopY: bottom - 1.85 };
    }
  }

  /** A narrow steel walkway hanging at `top`, with open ground or air beneath. */
  public createCatwalk(id: string, area: Bounds, top: number): BoxSolid {
    const slab: BoxSolid = {
      kind: "box",
      id,
      role: "catwalk",
      ...area,
      bottom: top - CATWALK_THICKNESS,
      height: top,
    };

    this.layout.platforms.push(slab);

    return slab;
  }

  // ----------------------------------------------------------------- steel

  /**
   * An I-beam column standing on a floor at (x, z), flush to the walls it sits
   * against. It is solid (a thin steel post), so it stops bodies like the wall
   * it hugs. `size` is the flange width.
   */
  public createSteelColumn(
    id: string,
    x: number,
    z: number,
    fromY: number,
    toY: number,
    size = 0.4,
    flangeAlong: "x" | "z" = "x",
  ): void {
    const half = size / 2;

    this.layout.steel.push({
      id,
      kind: "column",
      from: [x, fromY, z],
      to: [x, toY, z],
      profile: "i",
      width: size,
      depth: size,
      flangeAlong,
      solid: {
        kind: "box",
        id: `${id}-solid`,
        role: "machinery",
        minX: x - half,
        maxX: x + half,
        minZ: z - half,
        maxZ: z + half,
        bottom: fromY,
        height: toY,
      },
    });
  }

  /**
   * A drawn steel member (a beam, a brace, a truss chord): no collision, unless
   * `collide` is set, which registers a solid box round an axis-aligned member
   * (a ledge arm you can stand on and shoot at).
   */
  public createSteel(
    id: string,
    kind: SteelKind,
    from: Vec3,
    to: Vec3,
    profile: "i" | "box" = "i",
    width = 0.3,
    depth = 0.4,
    collide = false,
  ): void {
    const member: SteelMember = { id, kind, from, to, profile, width, depth };

    if (collide) {
      const alongX = Math.abs(to[0] - from[0]) >= Math.abs(to[2] - from[2]);
      const yMid = (from[1] + to[1]) / 2;

      member.solid = {
        kind: "box",
        id: `${id}-solid`,
        role: "machinery",
        minX: alongX ? Math.min(from[0], to[0]) : from[0] - width / 2,
        maxX: alongX ? Math.max(from[0], to[0]) : from[0] + width / 2,
        minZ: alongX ? from[2] - width / 2 : Math.min(from[2], to[2]),
        maxZ: alongX ? from[2] + width / 2 : Math.max(from[2], to[2]),
        bottom: yMid - depth / 2,
        height: yMid + depth / 2,
      };
    }

    this.layout.steel.push(member);
  }

  /**
   * An observation ledge on a tall narrow pillar, shaped like a steel rail: a
   * long thin I-beam (6 m) running straight out of the side of the pillar near
   * its top (`dir` is the unit x or z step out of it), with a narrow top plate
   * (50 cm wide, 7 cm thick) to stand on, held by one compact bracket. `y` is
   * the top of the plate. No ladder and no railing. A hang point runs along its
   * outer end.
   */
  public createPerch(
    id: string,
    name: string,
    pillarX: number,
    pillarZ: number,
    dir: readonly [number, number],
    y: number,
    floorY = 0,
  ): void {
    const pillar = 0.25;
    const length = 6;
    const width = 0.5;
    const thickness = 0.07;
    const beamDepth = 0.3;
    const under = y - thickness;
    const [dx, dz] = dir;
    const face = pillar / 2;
    const half = width / 2;
    const end = face + length;
    const slab: Bounds =
      dx !== 0
        ? {
            minX: Math.min(pillarX + dx * face, pillarX + dx * end),
            maxX: Math.max(pillarX + dx * face, pillarX + dx * end),
            minZ: pillarZ - half,
            maxZ: pillarZ + half,
          }
        : {
            minX: pillarX - half,
            maxX: pillarX + half,
            minZ: Math.min(pillarZ + dz * face, pillarZ + dz * end),
            maxZ: Math.max(pillarZ + dz * face, pillarZ + dz * end),
          };
    const at = (u: number, level: number): Vec3 => [
      pillarX + dx * u,
      level,
      pillarZ + dz * u,
    ];

    // The tall narrow pillar, a little over the rail.
    this.createColumn(
      `${id}-pillar`,
      pillarX,
      pillarZ,
      floorY,
      y + 0.3,
      pillar,
    );

    // The thin top plate: the surface you stand on.
    this.layout.platforms.push({
      kind: "box",
      id: `${id}-deck`,
      role: "catwalk",
      ...slab,
      base: under,
      bottom: under,
      height: y,
    });
    this.layout.hangZones.push({
      id,
      name,
      x: pillarX + dx * end,
      z: pillarZ + dz * end,
      y: under - beamDepth,
      axis: dx !== 0 ? "z" : "x",
      length: width,
      floorY,
    });

    // The I-beam under the plate: top flange, web and bottom flange, like a rail.
    this.createSteel(
      `${id}-rail`,
      "beam",
      at(0, under - beamDepth / 2),
      at(end, under - beamDepth / 2),
      "i",
      width * 0.8,
      beamDepth,
    );

    // One compact bracket: from the pillar, 1.2 m down, out along the rail.
    this.createSteel(
      `${id}-bracket`,
      "brace",
      at(face, under - beamDepth - 1.2),
      at(face + 1.6, under - beamDepth),
      "box",
      0.07,
      0.09,
    );
  }

  /**
   * A light post against a wall near its top: one tall steel pole standing on
   * the floor 0.5 m off the wall, rising a little above `y`, with a slim arm
   * out of its top into the arena (`dir` is the unit x or z step away from
   * the wall), a knee brace under the arm and a lamp hood at its tip. The top
   * plate on the arm (30 cm wide, 7 cm thick, top at `y`) is the ledge where a
   * light is fixed. `face` is the wall's inner face, `along` the middle of the
   * post along the wall. A hang point sits on the arm, short of the lamp.
   */
  public createWallRail(
    id: string,
    name: string,
    face: number,
    along: number,
    dir: readonly [number, number],
    y: number,
    floorY = 0,
  ): void {
    const poleAt = 0.5;
    const size = 0.3;
    const start = poleAt + size / 2;
    const length = 3.4;
    const width = 0.3;
    const thickness = 0.07;
    const armDepth = 0.18;
    const under = y - thickness;
    const [dx, dz] = dir;
    const half = width / 2;
    const out = face + (dx !== 0 ? dx : dz) * length;
    const from = face + (dx !== 0 ? dx : dz) * start;
    const slab: Bounds =
      dx !== 0
        ? {
            minX: Math.min(from, out),
            maxX: Math.max(from, out),
            minZ: along - half,
            maxZ: along + half,
          }
        : {
            minX: along - half,
            maxX: along + half,
            minZ: Math.min(from, out),
            maxZ: Math.max(from, out),
          };
    const at = (u: number, level: number): Vec3 =>
      dx !== 0 ? [face + dx * u, level, along] : [along, level, face + dz * u];
    const hangAt = length - 1.0;
    const hang = at(hangAt, 0);

    this.layout.platforms.push({
      kind: "box",
      id: `${id}-deck`,
      role: "catwalk",
      ...slab,
      base: under,
      bottom: under,
      height: y,
    });
    this.layout.hangZones.push({
      id,
      name,
      x: hang[0],
      z: hang[2],
      y: under - armDepth,
      axis: dx !== 0 ? "z" : "x",
      length: width,
      floorY,
    });

    // The pole, from the floor to a little over the arm.
    const pole = at(poleAt, 0);

    this.createSteelColumn(
      `${id}-post`,
      pole[0],
      pole[2],
      floorY,
      y + 0.6,
      size,
      dx !== 0 ? "z" : "x",
    );

    // The arm out of the pole's top, under the plate.
    this.createSteel(
      `${id}-rail`,
      "beam",
      at(poleAt, under - armDepth / 2),
      at(length, under - armDepth / 2),
      "box",
      0.16,
      armDepth,
    );

    // A knee brace from the pole up to the arm.
    this.createSteel(
      `${id}-bracket`,
      "brace",
      at(poleAt, under - armDepth - 1.0),
      at(poleAt + 1.5, under - armDepth),
      "box",
      0.08,
      0.09,
    );

    // The lamp hood at the tip: a flat shade hanging under the end of the arm.
    this.createSteel(
      `${id}-lamp`,
      "support",
      at(length - 0.5, under - armDepth - 0.07),
      at(length + 0.1, under - armDepth - 0.07),
      "box",
      0.34,
      0.14,
    );
  }

  /**
   * A Warren truss under a flat roof: a top chord at the roof's underside, a
   * bottom chord `rise` below it, and diagonals zig-zagging between, with a post
   * at each end. Runs from `from` to `to` (same height), flush to what holds it.
   */
  public createTruss(
    id: string,
    from: Vec3,
    to: Vec3,
    rise: number,
    bays: number,
  ): void {
    const [x0, y0, z0] = from;
    const [x1, , z1] = to;
    const point = (t: number, y: number): Vec3 => [
      x0 + (x1 - x0) * t,
      y,
      z0 + (z1 - z0) * t,
    ];
    const bottom = y0 - rise;

    this.createSteel(`${id}-top`, "truss", from, to, "i", 0.28, 0.3);
    this.createSteel(
      `${id}-bottom`,
      "truss",
      point(0, bottom),
      point(1, bottom),
      "i",
      0.28,
      0.3,
    );
    this.createSteel(
      `${id}-post-a`,
      "truss",
      point(0, y0),
      point(0, bottom),
      "box",
      0.2,
      0.2,
    );
    this.createSteel(
      `${id}-post-b`,
      "truss",
      point(1, y0),
      point(1, bottom),
      "box",
      0.2,
      0.2,
    );

    for (let i = 0; i < bays; i++) {
      const a = i / bays;
      const b = (i + 1) / bays;
      const up = i % 2 === 0;

      this.createSteel(
        `${id}-diag-${i + 1}`,
        "truss",
        point(a, up ? bottom : y0),
        point(b, up ? y0 : bottom),
        "box",
        0.16,
        0.16,
      );
    }
  }

  /** A support column from `fromY` up to `toY` (a roof's underside). */
  public createColumn(
    id: string,
    x: number,
    z: number,
    fromY: number,
    toY: number,
    size = 0.6,
  ): BoxSolid {
    const column: BoxSolid = {
      kind: "box",
      id,
      role: "machinery",
      minX: x - size / 2,
      maxX: x + size / 2,
      minZ: z - size / 2,
      maxZ: z + size / 2,
      bottom: fromY,
      height: toY,
    };

    this.layout.walls.push(column);

    return column;
  }

  // ------------------------------------------------------------- corridors

  /**
   * A roofed passage with walls on its two long sides and open ends. `openings`
   * are doorways in the long walls. It is listed as a zone, not a room.
   */
  public createCorridor(
    id: string,
    name: string,
    area: Bounds,
    floorY: number,
    along: "x" | "z",
    options: { openings?: number[]; roof?: boolean; walled?: boolean } = {},
  ): Zone {
    const t = WALL_THICKNESS;
    const gaps = (options.openings ?? []).map((at) => ({
      from: at - DOOR_WIDTH / 2,
      to: at + DOOR_WIDTH / 2,
    }));

    // Walls that already belong to the rooms beside it are not built twice.
    for (const side of options.walled === false
      ? []
      : (["low", "high"] as const)) {
      if (along === "x") {
        const z = side === "low" ? area.minZ : area.maxZ - t;

        this.createWall(
          `${id}-wall-${side}`,
          "x",
          z,
          area.minX,
          area.maxX,
          floorY,
          t,
          ROOM_WALL_HEIGHT,
          "wall",
          gaps,
        );
      } else {
        const x = side === "low" ? area.minX : area.maxX - t;

        this.createWall(
          `${id}-wall-${side}`,
          "z",
          x,
          area.minZ,
          area.maxZ,
          floorY,
          t,
          ROOM_WALL_HEIGHT,
          "wall",
          gaps,
        );
      }
    }

    if (options.roof !== false) {
      this.createRoofSection(
        `${id}-roof`,
        area,
        floorY + ROOM_WALL_HEIGHT + ROOF_THICKNESS,
      );
    }

    return this.addZone("corridor", id, name, area, floorY);
  }

  // ------------------------------------------------------------ industrial

  /**
   * A simple graybox prop standing on a surface at `baseY`. Boxes are solid
   * (and only block someone standing on that surface, not a room below a roof).
   */
  public createIndustrialProp(
    kind: PropKind,
    id: string,
    x: number,
    z: number,
    baseY: number,
    along: "x" | "z" = "x",
    size?: { width?: number; depth?: number; height?: number },
  ): BoxSolid {
    const spec = PROP_SIZES[kind];
    const width = size?.width ?? spec.width;
    const depth = size?.depth ?? spec.depth;
    const height = size?.height ?? spec.height;
    const [sx, sz] = along === "x" ? [width, depth] : [depth, width];
    const prop: BoxSolid = {
      kind: "box",
      id,
      role: spec.role,
      minX: x - sx / 2,
      maxX: x + sx / 2,
      minZ: z - sz / 2,
      maxZ: z + sz / 2,
      bottom: baseY,
      height: baseY + height,
    };

    this.layout.walls.push(prop);

    return prop;
  }

  /**
   * A pile of building material (bags, bricks, rubble, boards, a brick
   * barricade) standing on a surface at `baseY`. Its pieces are drawn from the
   * layout's `piles`, and it stops a body with hidden boxes that follow them.
   * `touch` puts a side of the pile exactly on a wall or edge (no gap), the
   * way a pile is stacked against a wall; the others are as given.
   */
  public createPile(
    kind: PileKind,
    id: string,
    x: number,
    z: number,
    baseY: number,
    touch: Partial<{
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    }> = {},
    /** The way a long pile (a wall of bags, a barricade) runs. */
    along: "x" | "z" = "x",
  ): PileDefinition {
    const built = buildPile(kind, id);
    // Shapes are built running along x; turn the whole thing to run along z.
    const shape =
      along === "x"
        ? built
        : {
            ...built,
            width: built.depth,
            depth: built.width,
            elements: built.elements.map((e) => ({
              ...e,
              x: e.z,
              z: e.x,
              sx: e.sz,
              sz: e.sx,
            })),
            boxes: built.boxes.map((b) => ({
              minX: b.minZ,
              maxX: b.maxZ,
              minZ: b.minX,
              maxZ: b.maxX,
              top: b.top,
            })),
          };
    let cx = x;
    let cz = z;

    // The outline of the whole pile: its first box spans it for most kinds; a
    // barricade's boxes together span its wall, plus the bricks fallen round it.
    const halfW = shape.width / 2;
    const halfD = shape.depth / 2;

    if (touch.minX !== undefined) cx = touch.minX + halfW;
    if (touch.maxX !== undefined) cx = touch.maxX - halfW;
    if (touch.minZ !== undefined) cz = touch.minZ + halfD;
    if (touch.maxZ !== undefined) cz = touch.maxZ - halfD;

    const solids: string[] = [];

    shape.boxes.forEach((b, index) => {
      const solidId = shape.boxes.length === 1 ? id : `${id}-${index + 1}`;

      this.layout.walls.push({
        kind: "box",
        id: solidId,
        role: "prop",
        hidden: true,
        minX: cx + b.minX,
        maxX: cx + b.maxX,
        minZ: cz + b.minZ,
        maxZ: cz + b.maxZ,
        bottom: baseY,
        height: baseY + b.top,
      });
      solids.push(solidId);
    });

    const pile: PileDefinition = {
      id,
      kind,
      x: cx,
      z: cz,
      baseY,
      elements: shape.elements,
      solids,
    };

    this.layout.piles.push(pile);

    return pile;
  }

  /**
   * Re-dresses a railing or low barrier as a stack of pipes or as brick without moving it.
   * It keeps its footprint and its body-blocking height (a railing still
   * cannot be vaulted); what changes is what is drawn, and the drawn height
   * where bricks are missing (shots, grenades and sight follow the drawn
   * profile, so a gap in the top is a real gap). Collision slices are hidden
   * copies of the original with the new heights.
   */
  public restyleBarrier(id: string, style: BarrierStyle): void {
    const solid = this.removeSolid(id);
    const alongX = solid.maxX - solid.minX >= solid.maxZ - solid.minZ;
    const length = alongX ? solid.maxX - solid.minX : solid.maxZ - solid.minZ;
    const thick = alongX ? solid.maxZ - solid.minZ : solid.maxX - solid.minX;
    const base = solid.base ?? solid.bottom ?? 0;
    const rise = solid.height - base;
    const shape = buildBarrierShape(style, id, length, thick, rise);
    const cx = (solid.minX + solid.maxX) / 2;
    const cz = (solid.minZ + solid.maxZ) / 2;
    const lo = alongX ? solid.minX : solid.minZ;
    const solids: string[] = [];

    // The pieces are built along x: turn them to run along z when it does
    // (mirrored across the diagonal, so the columns of the collision line up).
    // A pipe is a cylinder along its own x: it is turned a quarter instead of
    // swapping its sizes.
    const elements = shape.elements.map((e) =>
      alongX
        ? e
        : e.shape === "pipe"
          ? { ...e, x: e.z, z: e.x, ry: Math.PI / 2 - e.ry }
          : { ...e, x: e.z, z: e.x, sx: e.sz, sz: e.sx },
    );

    shape.boxes.forEach((b, index) => {
      const a = lo + (length / 2 + b.minX);
      const z = lo + (length / 2 + b.maxX);
      const sliceId = shape.boxes.length === 1 ? id : `${id}~${index + 1}`;

      this.layout.walls.push({
        ...solid,
        id: sliceId,
        hidden: true,
        minX: alongX ? a : solid.minX,
        maxX: alongX ? z : solid.maxX,
        minZ: alongX ? solid.minZ : a,
        maxZ: alongX ? solid.maxZ : z,
        height: base + b.top,
      });
      solids.push(sliceId);
    });

    this.layout.piles.push({
      id: `${id}-${style}`,
      kind: style === "pipes" ? "pipes" : "barricade",
      x: cx,
      z: cz,
      baseY: base,
      elements,
      solids,
    });
  }

  /** Takes a prop or wall out of the layout (to put a pile or a broken piece in its place). */
  public removeSolid(id: string): BoxSolid {
    const index = this.layout.walls.findIndex((w) => w.id === id);

    if (index < 0) {
      throw new Error(`No wall or prop called ${id}`);
    }

    return this.layout.walls.splice(index, 1)[0];
  }

  /**
   * Breaks a wall or a block: it becomes `profile.length` slices side by side
   * along its long side, each as high as `profile` says (a share of its height
   * above where it stands, 1 = unbroken). A slice is never lower than
   * `minRise` metres above its base, so a broken wall stays a wall: too tall to
   * vault or jump, and nothing opens through it. The collision is the slices:
   * what is missing is not in the way.
   */
  public breakSolid(id: string, profile: number[], minRise = 1.7): void {
    const solid = this.removeSolid(id);
    const alongX = solid.maxX - solid.minX >= solid.maxZ - solid.minZ;
    const base = solid.base ?? solid.bottom ?? 0;
    const rise = solid.height - base;
    const length = alongX ? solid.maxX - solid.minX : solid.maxZ - solid.minZ;
    const lo = alongX ? solid.minX : solid.minZ;

    profile.forEach((share, index) => {
      const a = lo + (length * index) / profile.length;
      const b = lo + (length * (index + 1)) / profile.length;
      const top = base + Math.max(rise * share, Math.min(minRise, rise));

      this.layout.walls.push({
        ...solid,
        id: `${id}~${index + 1}`,
        minX: alongX ? a : solid.minX,
        maxX: alongX ? b : solid.maxX,
        minZ: alongX ? solid.minZ : a,
        maxZ: alongX ? solid.maxZ : b,
        height: top,
      });
    });
  }

  /** A water or fuel tank (a cylinder) standing on a surface at `baseY`. */
  public createTank(
    id: string,
    x: number,
    z: number,
    baseY: number,
    radius = 1.1,
    height = 2.4,
  ): void {
    this.layout.pillars.push({
      kind: "cylinder",
      id,
      x,
      z,
      radius,
      height: baseY + height,
      bottom: baseY,
    });
  }

  /** A drawn-only part (a pipe, a duct, a truss) that nothing collides with. */
  public createOverhead(
    id: string,
    area: Bounds,
    bottom: number,
    top: number,
    material: OverheadMaterial,
  ): void {
    this.layout.overheads.push({ id, material, ...area, bottom, top });
  }

  /**
   * A strong overhead beam a later hanging system can use: drawn as a steel
   * beam, and recorded as data. Nothing hangs from it yet.
   */
  public createHangZone(
    id: string,
    name: string,
    x: number,
    z: number,
    y: number,
    axis: "x" | "z",
    length: number,
    floorY = 0,
  ): void {
    const half = length / 2;
    const w = 0.18;

    this.layout.hangZones.push({ id, name, x, z, y, axis, length, floorY });
    this.createOverhead(
      `${id}-beam`,
      axis === "x"
        ? { minX: x - half, maxX: x + half, minZ: z - w, maxZ: z + w }
        : { minX: x - w, maxX: x + w, minZ: z - half, maxZ: z + half },
      y,
      y + 0.4,
      "steel",
    );
    // The hanger: a plate bolted flat under the beam and a short hook rod, so
    // the hang point is visibly part of the beam.
    this.createSteel(
      `${id}-plate`,
      "support",
      [x, y, z],
      [x, y - 0.1, z],
      "box",
      0.5,
      0.5,
    );
    this.createSteel(
      `${id}-hook`,
      "support",
      [x, y - 0.1, z],
      [x, y - 0.45, z],
      "box",
      0.07,
      0.07,
    );
  }

  /**
   * A framed glass panel that fills an opening in a roof (a skylight): it holds
   * you up like the roof beside it, so the roofline stays continuous. The
   * steel frame runs round its edge, and `mullions` bars cross it.
   */
  public createGlassSkylight(
    id: string,
    area: Bounds,
    top: number,
    thickness = ROOF_THICKNESS,
    mullions = 1,
    across: "x" | "z" = "x",
  ): void {
    this.layout.platforms.push({
      kind: "box",
      id,
      role: "roof",
      glass: true,
      ...area,
      base: top - 0.1,
      bottom: top - thickness,
      height: top,
    });

    const y = top - 0.06;
    const edge = (name: string, a: Vec3, b: Vec3): void =>
      this.createSteel(`${id}-frame-${name}`, "beam", a, b, "i", 0.16, 0.12);

    edge(
      "n",
      [area.minX, y, area.minZ + 0.08],
      [area.maxX, y, area.minZ + 0.08],
    );
    edge(
      "s",
      [area.minX, y, area.maxZ - 0.08],
      [area.maxX, y, area.maxZ - 0.08],
    );
    edge(
      "w",
      [area.minX + 0.08, y, area.minZ],
      [area.minX + 0.08, y, area.maxZ],
    );
    edge(
      "e",
      [area.maxX - 0.08, y, area.minZ],
      [area.maxX - 0.08, y, area.maxZ],
    );

    for (let i = 1; i <= mullions; i++) {
      const t = i / (mullions + 1);

      if (across === "x") {
        const z = area.minZ + (area.maxZ - area.minZ) * t;

        edge(`m${i}`, [area.minX, y, z], [area.maxX, y, z]);
      } else {
        const x = area.minX + (area.maxX - area.minX) * t;

        edge(`m${i}`, [x, y, area.minZ], [x, y, area.maxZ]);
      }
    }
  }

  /**
   * A glass barrier along an edge: a pane that stops bodies like a railing (and
   * is no thicker than one), a steel top rail and a post every few metres. It
   * leaves the openings in `gaps` (a ladder's exit) bare.
   */
  public createGlassBarrier(
    id: string,
    axis: "x" | "z",
    at: number,
    from: number,
    to: number,
    floorY: number,
    gaps: Gap[] = [],
    height = 1.3,
  ): void {
    this.createWall(
      id,
      axis,
      at,
      from,
      to,
      floorY,
      0.1,
      height,
      "railing",
      gaps,
      true,
    );

    const cuts = [...gaps].sort((a, b) => a.from - b.from);
    const runs: Array<[number, number]> = [];
    let cursor = from;

    for (const gap of cuts) {
      if (gap.from > cursor) runs.push([cursor, gap.from]);
      cursor = Math.max(cursor, gap.to);
    }

    if (cursor < to) runs.push([cursor, to]);

    const point = (along: number, y: number): Vec3 =>
      axis === "x" ? [along, y, at + 0.05] : [at + 0.05, y, along];

    runs.forEach(([a, b], run) => {
      this.createSteel(
        `${id}-rail-${run + 1}`,
        "beam",
        point(a, floorY + height),
        point(b, floorY + height),
        "box",
        0.12,
        0.08,
      );

      const posts = Math.max(1, Math.round((b - a) / 3));

      for (let i = 0; i <= posts; i++) {
        const along = a + ((b - a) * i) / posts;

        this.createSteel(
          `${id}-post-${run + 1}-${i + 1}`,
          "column",
          point(along, floorY),
          point(along, floorY + height),
          "box",
          0.12,
          0.12,
        );
      }
    });
  }

  // ------------------------------------------------------- vertical routes

  public createStaircase(stairs: StairsDefinition): void {
    this.layout.stairs.push(stairs);
  }

  /**
   * A ladder up a vertical face. Climbing is not built yet; the ladder is
   * drawn, and its approach and exit points mark where a player will start and
   * finish. Add it before the railings so they leave a gap for it.
   */
  public createLadder(options: LadderOptions): LadderDefinition {
    const { normal, face, along, topY } = options;
    const sign = normal.startsWith("+") ? 1 : -1;
    const faceIsX = normal.endsWith("x");
    const place = (offset: number): { x: number; z: number } =>
      faceIsX
        ? { x: face + sign * offset, z: along }
        : { x: along, z: face + sign * offset };
    const ladder: LadderDefinition = {
      id: options.id,
      ...place(LADDER_OFFSET),
      normal,
      width: LADDER_WIDTH,
      bottomY: options.bottomY ?? 0,
      topY,
      approach: place(0.9),
      exit: place(-0.7),
      secret: options.secret,
    };

    this.layout.ladders.push(ladder);

    return ladder;
  }

  /** Marks an existing edge as a climb: `fromY` is the lower floor, `topY` the ledge. */
  public declareLedge(
    id: string,
    area: Bounds,
    fromY: number,
    topY: number,
  ): void {
    this.layout.ledges.push({ id, fromY, topY, ...area });
  }

  /** A low step to climb onto, standing on a floor at `fromY`. */
  public createLedge(
    id: string,
    bounds: Bounds,
    fromY: number,
    rise: number,
  ): LedgeDefinition {
    this.layout.platforms.push({
      kind: "box",
      id,
      role: "ledge",
      ...bounds,
      base: fromY,
      bottom: fromY,
      height: fromY + rise,
    });

    const ledge: LedgeDefinition = {
      id,
      fromY,
      topY: fromY + rise,
      ...bounds,
    };

    this.layout.ledges.push(ledge);

    return ledge;
  }
}

/** A rectangle from its corners, in any order. */
export function bounds(x0: number, x1: number, z0: number, z1: number): Bounds {
  return {
    minX: Math.min(x0, x1),
    maxX: Math.max(x0, x1),
    minZ: Math.min(z0, z1),
    maxZ: Math.max(z0, z1),
  };
}
