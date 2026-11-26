import type { PartRole, PileElement } from "./ArenaLayout";
import { groundPieces } from "./DebrisGround";
import { rng } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import { meshExtent } from "./PileMeshes";

/**
 * The Ruins' chamber: an abandoned underground service hall of a building that
 * was still being fitted out when part of it came down. It is one continuous
 * room under the east wing, entered from the pit's south wall, and it changes
 * shape as it runs south (z -12 to 12):
 *
 *   ENTRY    x 21.7..25.3   z -11.7..-7.5   a narrow vestibule 3.6 m wide
 *            behind the doorway, its low service ceiling half fallen in;
 *   HALL     x 18.3..29.7   z -7.2..5.7     the wide industrial heart, 11.4 m
 *            across: a line of structural columns each side, two deep concrete
 *            beams across the ceiling, the arena's wall on the west (with the
 *            two weakened sections and the vent) and a pilastered east wall
 *            with the switchgear, a cable tray and a boiler unit in its bays;
 *   FAR END  x 20.9..27.1   z 6..11.7       narrowed again: a secured
 *            equipment enclosure (a caged transformer) and a control station.
 *
 * The walking route down the middle (x 22.5 to 26) stays open the whole way.
 * The ceiling is the underside of the wing's floor (a slab 0.3 m thick,
 * y 3.7 to 4), so the deep beams, girders and hanging fittings give it its
 * shape. Everything is set out in world coordinates (x east, z south, y up).
 */

/** The three hollows cut under the wing (outer faces: the walls stand inside them). */
export interface ChamberRect {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const CHAMBER_HOLLOWS: readonly ChamberRect[] = [
  { id: "chamber-entry", minX: 21.4, maxX: 25.6, minZ: -12, maxZ: -7.5 },
  // (The hall runs east to x 37.4, past the old east edge of the map, x 32.)
  { id: "room-ruins-chamber", minX: 18, maxX: 37.7, minZ: -7.5, maxZ: 6 },
  { id: "chamber-far", minX: 20.6, maxX: 27.4, minZ: 6, maxZ: 12 },
];

const H = 3.7;
/** The doorway in the pit wall (x span). */
const DOOR = { from: 22.5, to: 24.9 } as const;
/** The hall's inner faces. */
const XW = 18.3;
const XE = 37.4;
/** The structural columns: west line, east line, and the z of each pair. */
const COL_W = 20.6;
const COL_E = 26.9;
const COL_Z = [-6.0, 1.0] as const;
/** The east line's standing column is off the west line's: not a mirrored pair. */
const COL_EAST_Z = -3.1;

/** The two weakened sections of the arena wall (z centres, half widths). */
const WEAK = [
  { z: -3.8, half: 1.3 },
  { z: 3.0, half: 1.3 },
] as const;

/** The prefix of the weak sections' ids (and each carries `weak: true`). */
export const WEAK_WALL_PREFIX = "room-ruins-chamber-wall-weak";

/** The vent high in the arena wall, between the weak sections. */
const VENT = { z: -0.4, y: 2.75, w: 1.5, h: 1.1 } as const;

/**
 * The red tube fixtures over the chamber (centres; each is 1.6 m long, along
 * z, the way the hall runs): the drawn tubes and the water's reflections of
 * them follow this list (see ChamberGlow). The chamber's three lamps are in
 * NightLights, one over each stretch.
 */
export const CHAMBER_TUBES: ReadonlyArray<{ x: number; z: number }> = [
  { x: 23.9, z: -9.8 },
  { x: 24.3, z: -4.4 },
  { x: 24.3, z: -0.9 },
  { x: 24.3, z: 4.4 },
  { x: 24.0, z: 8.4 },
  // The east extension's: over its two parts.
  { x: 34.0, z: -1.9 },
  { x: 33.6, z: 4.6 },
];
/** The tubes' length and the height of their housings' undersides above the floor. */
export const TUBE_LENGTH = 1.6;

/** What a later feature needs to find about the chamber. */
export const RUINS_CHAMBER = {
  id: "room-ruins-chamber",
  bounds: { minX: 18, maxX: 37.7, minZ: -12, maxZ: 12 },
  floorY: 0,
  ceiling: H,
  /** The way in, from the pit. */
  doorway: { x: (DOOR.from + DOOR.to) / 2, width: DOOR.to - DOOR.from, z: -12 },
  /**
   * The weakened sections of the arena wall (x 18), north to south. `inside` is
   * a place to stand in the hall by each, `outside` one in the arena.
   */
  weakWalls: WEAK.map((w, i) => ({
    id: `${WEAK_WALL_PREFIX}-${i + 1}`,
    minZ: w.z - w.half,
    maxZ: w.z + w.half,
    wallFaceX: 18,
    inside: { x: XW + 1.4, z: w.z },
    outside: { x: 16.8, z: w.z },
  })),
  /** The vent: the hall side, and the grille on the arena face (a closed route for now). */
  vent: {
    hallSide: { x: XW, y: VENT.y, z: VENT.z },
    arenaSide: { x: 18, y: VENT.y, z: VENT.z },
  },
  /** The caged equipment enclosure at the far end. */
  enclosure: { minX: 22, maxX: 26, minZ: 9.7, maxZ: 11.7 },
} as const;

const CONCRETE = [0x3d3f43, 0x45474b, 0x4b4d51, 0x36383c, 0x505256, 0x4a4845];
const FRACTURE = [0x62646a, 0x6c6e72, 0x585a60];
const BRICK = [0x6a4033, 0x74483a, 0x58352c, 0x7a5042, 0x4e2c26];
const REBAR = 0x5e3320;
const REBAR_BARE = 0x7a4a2a;
const STEEL = 0x4f5f74;
const STEEL_DARK = 0x353b46;
const PIPE = 0x59606a;
const PIPE_OLD = 0x6a5a48;
const CABLE = 0x1c1e22;
const CABINET = 0x4a5560;
const HAZARD = 0x9a8836;
const STAIN = 0x2b2622;
const WOOD = [0x6b5338, 0x5a4632, 0x7a6244];

type V3 = [number, number, number];

const put = (
  list: PileElement[],
  shape: PileElement["shape"],
  x: number,
  y: number,
  z: number,
  size: V3,
  turn: V3,
  color: number,
): void => {
  list.push({
    shape,
    x,
    y,
    z,
    sx: size[0],
    sy: size[1],
    sz: size[2],
    rx: turn[0],
    ry: turn[1],
    rz: turn[2],
    color,
  });
};

/** A box whose bottom is at `bottom`. */
const box = (
  list: PileElement[],
  x: number,
  bottom: number,
  z: number,
  size: V3,
  color: number,
  turn: V3 = [0, 0, 0],
): void => put(list, "plank", x, bottom + size[1] / 2, z, size, turn, color);

/** A bar from one point to another: `thick` across, `deep` the other way. */
const between = (
  list: PileElement[],
  a: V3,
  b: V3,
  thick: number,
  color: number,
  deep = thick,
): void => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);

  put(
    list,
    "plank",
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2,
    [length, thick, deep],
    [0, Math.atan2(-dz, dx), Math.asin(dy / length)],
    color,
  );
};

const polyline = (
  list: PileElement[],
  from: V3,
  steps: V3[],
  thick: number,
  color: number,
): V3 => {
  let p = from;

  for (const step of steps) {
    const q: V3 = [p[0] + step[0], p[1] + step[1], p[2] + step[2]];

    between(list, p, q, thick, color);
    p = q;
  }

  return p;
};

interface ChamberBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
  bottom?: number;
  exact: true;
}

/** A solid block, in the same terms as the fittings' boxes. */
const solid = (
  list: ChamberBox[],
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  top: number,
): void => {
  list.push({ minX, maxX, minZ, maxZ, top, exact: true });
};

/** Which wall a piece of damage is on: where its face looks. */
type Face = "W" | "E" | "N" | "S";

export function furnishRuinsChamber(map: MapBuilder, F: number): void {
  const layout = map.build();
  const random = rng(5531);
  const pick = <A>(list: readonly A[]): A =>
    list[Math.floor(random() * list.length)];
  const dress: PileElement[] = [];
  const debris: PileElement[] = [];
  const machines: PileElement[] = [];
  const dressBoxes: ChamberBox[] = [];
  const debrisBoxes: ChamberBox[] = [];
  const machineBoxes: ChamberBox[] = [];
  const ceiling = Math.min(H, F - 0.3);

  /**
   * The services were set out against the hall's old east wall (x 29.7); the
   * hall now runs EAST_SHIFT further east, so what a section adds between a
   * `mark()` and `moveEast()` is moved that far (drawn pieces and boxes).
   */
  const EAST_SHIFT = XE - 29.7;
  const mark = (): number[] => [
    dress.length,
    machines.length,
    debris.length,
    dressBoxes.length,
    machineBoxes.length,
    debrisBoxes.length,
  ];
  const moveEast = (from: number[]): void => {
    for (const [list, start] of [
      [dress, from[0]],
      [machines, from[1]],
      [debris, from[2]],
    ] as const) {
      for (const e of list.slice(start)) e.x += EAST_SHIFT;
    }

    for (const [list, start] of [
      [dressBoxes, from[3]],
      [machineBoxes, from[4]],
      [debrisBoxes, from[5]],
    ] as const) {
      for (const b of list.slice(start)) {
        b.minX += EAST_SHIFT;
        b.maxX += EAST_SHIFT;
      }
    }
  };

  // ------------------------------------------------------------------ room
  layout.rooms.push({
    id: RUINS_CHAMBER.id,
    name: "Ruins chamber (ground floor hall)",
    kind: "room",
    ...RUINS_CHAMBER.bounds,
    floorY: 0,
    doors: [
      {
        side: "n",
        at: RUINS_CHAMBER.doorway.x,
        width: RUINS_CHAMBER.doorway.width,
      },
    ],
  });

  // -------------------------------------------------------------- the walls
  /** A wall block x0..x1 by z0..z1 (along its longer side), as the map builds walls. */
  const wall = (
    name: string,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    gaps: Array<{ from: number; to: number }> = [],
    height = ceiling,
  ): void => {
    const wallId = `room-ruins-chamber-${name}`;

    if (x1 - x0 >= z1 - z0) {
      map.createWall(wallId, "x", z0, x0, x1, 0, z1 - z0, height, "wall", gaps);
    } else {
      map.createWall(wallId, "z", x0, z0, z1, 0, x1 - x0, height, "wall", gaps);
    }
  };

  // The pit wall, with the doorway.
  wall("wall-door", 21.4, 25.6, -12, -11.7, [DOOR]);
  // The vestibule's sides, then the shoulders where the hall opens out.
  wall("wall-a-w", 21.4, 21.7, -12, -7.2);
  wall("wall-a-e", 25.3, 25.6, -12, -7.2);
  wall("wall-nw", XW, 21.4, -7.5, -7.2);
  wall("wall-ne", 25.6, XE, -7.5, -7.2);
  // The hall: the arena's wall (weak sections left out), and the east wall.
  wall(
    "wall-w",
    18,
    XW,
    -7.5,
    6,
    WEAK.map((w) => ({ from: w.z - w.half, to: w.z + w.half })),
  );
  wall("wall-e", XE, 37.7, -7.5, 6);
  // The far end narrows: shoulders, then its sides and its end wall.
  wall("wall-sw", XW, 20.9, 5.7, 6);
  wall("wall-se", 27.1, XE, 5.7, 6);
  wall("wall-f-w", 20.6, 20.9, 6, 12);
  wall("wall-f-e", 27.1, 27.4, 6, 12);
  wall("wall-f-s", 20.6, 27.4, 11.7, 12);

  // Wall pilasters (the recessed bays between them): the east wall, and two on the west.
  // Deep piers (0.9 m out of the wall, 0.7 m wide) between the bays: the long
  // walls step in and out, and the bays between them hold the machinery.
  for (const z of [-6.3, 5.0]) {
    wall(`pilaster-e-${z}`, XE - 0.9, XE, z - 0.35, z + 0.35);
  }

  for (const z of [-6.3, 5.1]) {
    wall(`pilaster-w-${z}`, XW, 19.2, z - 0.35, z + 0.35);
  }

  // The weak sections: thinner panels flush with the arena face (a recess
  // 0.14 m deep on the hall side), each a box the Batman mechanic will find.
  const PANEL = 0.16;

  WEAK.forEach((w, i) => {
    layout.walls.push({
      kind: "box",
      id: `${WEAK_WALL_PREFIX}-${i + 1}`,
      role: "wall",
      minX: 18,
      maxX: 18 + PANEL,
      minZ: w.z - w.half,
      maxZ: w.z + w.half,
      base: 0,
      bottom: 0,
      height: ceiling,
      weak: true,
    });
  });

  // ---------------------------------------------------------- the doorway
  // A damaged opening where a door was: a steel jamb each side, a lintel solid
  // from 2.6 m, its underside broken with bars hanging out of it.
  layout.walls.push({
    kind: "box",
    id: "room-ruins-chamber-lintel",
    role: "wall",
    minX: DOOR.from,
    maxX: DOOR.to,
    minZ: -12,
    maxZ: -11.7,
    bottom: 2.6,
    height: ceiling,
  });

  for (const [n, x] of [
    ["a", DOOR.from - 0.2],
    ["b", DOOR.to + 0.2],
  ] as const) {
    map.createSteelColumn(
      `room-ruins-chamber-jamb-${n}`,
      x,
      -11.85,
      0,
      ceiling,
      0.4,
    );
  }

  // The opening between the vestibule and the hall: a heavy lintel with a
  // steel girder under it, set a little lower than the hall's beams.
  box(dress, 23.5, 2.8, -7.35, [3.6, ceiling - 2.8, 0.3], CONCRETE[2]);
  box(dress, 23.5, 2.62, -7.62, [3.4, 0.18, 0.22], STEEL_DARK);
  box(dress, 23.5, 2.8, -7.62, [0.04, 0.26, 0.2], STEEL_DARK);

  // ------------------------------------------------- structural columns
  // A few columns have a corner broken away: real missing concrete (the column
  // is built in pieces, with a notch out of one corner between y0 and y1, a
  // third of a metre in each way), with the bars showing in the notch, broken
  // lumps in its edges and the pieces that fell lying at its foot. The rest
  // stay whole. [corner x sign, corner z sign, notch bottom, notch top]
  const NOTCH = 0.42;
  const notches = new Map<string, [number, number, number, number]>([
    [`${COL_W},${COL_Z[1]}`, [1, 1, 0.8, 1.75]],
    [`${COL_E},${COL_EAST_Z}`, [1, -1, 1.2, 2.25]],
    ["32.4,-2.3", [-1, -1, 0.5, 1.45]],
  ]);
  const solidBox = (
    id: string,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    bottom: number,
    top: number,
  ): void => {
    layout.walls.push({
      kind: "box",
      id: `room-ruins-chamber-${id}`,
      role: "wall",
      minX: x0,
      maxX: x1,
      minZ: z0,
      maxZ: z1,
      base: 0,
      bottom,
      height: top,
    });
  };
  const column = (name: string, x: number, z: number, height: number): void => {
    const notch = notches.get(`${x},${z}`);

    if (!notch || height < ceiling) {
      wall(name, x - 0.45, x + 0.45, z - 0.45, z + 0.45, [], height);

      return;
    }

    const [sx, sz, y0, y1] = notch;
    const h = 0.45;
    const x0 = x - h;
    const x1 = x + h;
    const z0 = z - h;
    const z1 = z + h;

    // Whole to y0; an L (the notch's corner left out) from y0 to y1; whole above.
    solidBox(`${name}-a`, x0, x1, z0, z1, 0, y0);
    solidBox(
      `${name}-b`,
      x0,
      x1,
      sz > 0 ? z0 : z0 + NOTCH,
      sz > 0 ? z1 - NOTCH : z1,
      y0,
      y1,
    );
    solidBox(
      `${name}-c`,
      sx > 0 ? x0 : x0 + NOTCH,
      sx > 0 ? x1 - NOTCH : x1,
      sz > 0 ? z1 - NOTCH : z0,
      sz > 0 ? z1 : z0 + NOTCH,
      y0,
      y1,
    );
    solidBox(`${name}-d`, x0, x1, z0, z1, y1, height);

    // In the notch: the corner bars (four, bent a little out of line, one
    // snapped short), and the broken edges of the concrete round it.
    const nx = x + sx * (h - NOTCH);
    const nz = z + sz * (h - NOTCH);

    for (const [i, [bx, bz]] of (
      [
        [nx + sx * 0.04, nz + sz * 0.04],
        [x + sx * (h - 0.05), nz + sz * 0.04],
        [nx + sx * 0.04, z + sz * (h - 0.05)],
        [x + sx * (h - 0.05), z + sz * (h - 0.05)],
      ] as const
    ).entries()) {
      const top = i === 3 ? y0 + (y1 - y0) * 0.55 : y1 + 0.18;

      polyline(
        dress,
        [bx, y0 - 0.12, bz],
        [
          [0, (top - y0) * 0.5, 0],
          [(random() - 0.5) * 0.05, (top - y0) * 0.5, (random() - 0.5) * 0.05],
        ],
        0.03,
        i % 2 ? REBAR : REBAR_BARE,
      );
    }

    // Ties: a bent stirrup round the bars.
    box(
      dress,
      nx + sx * 0.2,
      y0 + (y1 - y0) * 0.45,
      nz + sz * 0.2,
      [NOTCH * 0.8, 0.014, NOTCH * 0.8],
      REBAR,
      [0, random(), 0],
    );

    for (let k = 0; k < 9; k++) {
      const edge = k % 3;
      const size = 0.08 + random() * 0.09;
      const t = random();
      // Along the notch's three edges: the face below it, the two sides, the lid.
      const px =
        edge === 0
          ? x + sx * (h - NOTCH * t)
          : edge === 1
            ? nx
            : x + sx * (h - NOTCH * t);
      const pz = edge === 0 ? nz : edge === 1 ? z + sz * (h - NOTCH * t) : nz;

      put(
        dress,
        "rock",
        px,
        edge === 2 ? y1 - 0.03 : y0 + 0.04 + t * (y1 - y0 - 0.1),
        pz,
        [size * 1.1, size, size * 1.1],
        [random() * 0.6, random() * Math.PI * 2, random() * 0.6],
        pick(FRACTURE),
      );
    }

    // What fell: broken pieces at the corner's foot (the largest the size of
    // the missing piece), each lying on the floor on its own lowest point, and
    // a low solid box under the heap, off the walking route.
    const fx = x + sx * (h + 0.25);
    const fz = z + sz * (h + 0.25);

    for (let k = 0; k < 7; k++) {
      const big = k < 2;
      const size = big ? 0.3 + random() * 0.16 : 0.1 + random() * 0.16;
      const a = random() * Math.PI * 2;
      const r = big ? random() * 0.15 : 0.1 + random() * 0.45;

      layOn(
        debris,
        "rock",
        fx + Math.cos(a) * r,
        fz + Math.sin(a) * r,
        [size * 1.3, size * (big ? 0.62 : 0.8), size],
        [random() * 0.5, random() * Math.PI * 2, random() * 0.5],
        pick(big ? CONCRETE : FRACTURE),
      );
    }

    solid(debrisBoxes, fx - 0.3, fx + 0.3, fz - 0.3, fz + 0.3, 0.26);
  };

  for (const z of COL_Z) {
    column(`column-w-${z}`, COL_W, z, ceiling);
  }

  column("column-e-a", COL_E, COL_EAST_Z, ceiling);
  column("column-e-stump", COL_E, COL_Z[1], 1.3);

  for (const [x, zs] of [
    [COL_W, COL_Z],
    [COL_E, [COL_EAST_Z, COL_Z[1]]],
  ] as const) {
    for (const z of zs) {
      box(dress, x, 0, z, [1.1, 0.22, 1.1], CONCRETE[1]);

      if (!(x === COL_E && z === COL_Z[1])) {
        box(dress, x, ceiling - 0.2, z, [1.08, 0.2, 1.08], CONCRETE[1]);
      }
    }
  }

  // Two of the standing columns have a face burst open: a dark patch, the
  // bars showing.
  for (const [x, z, face] of [
    [COL_W, COL_Z[0], "E"],
    [COL_E, COL_EAST_Z, "W"],
  ] as const) {
    const px = x + (face === "E" ? 0.456 : -0.456);

    for (let k = 0; k < 7; k++) {
      const size = 0.07 + random() * 0.08;

      put(
        dress,
        "rock",
        px + (face === "E" ? 0.02 : -0.02),
        1.0 + random() * 0.7,
        z + 0.1 + (random() - 0.5) * 0.5,
        [size * 0.5, size, size],
        [random() * 0.5, random() * Math.PI * 2, random() * 0.5],
        pick(FRACTURE),
      );
    }

    for (const dz of [-0.1, 0.05, 0.2, 0.32]) {
      between(
        dress,
        [px, 0.9, z + dz],
        [
          px + (face === "E" ? 0.12 : -0.12) * (0.5 + random()),
          1.85,
          z + dz + (random() - 0.5) * 0.1,
        ],
        0.035,
        random() < 0.4 ? REBAR_BARE : REBAR,
      );
    }
  }

  // The east line's second column is broken: the stump's top fractured with
  // bars out of it, and the rest of it lying against the south shoulder.
  {
    const x = COL_E;
    const z = COL_Z[1];

    for (let k = 0; k < 7; k++) {
      const size = 0.16 + random() * 0.2;

      put(
        dress,
        "rock",
        x + (random() - 0.5) * 0.7,
        1.3 + size * 0.1,
        z + (random() - 0.5) * 0.7,
        [size * 1.3, size * 0.8, size],
        [random() * 0.5, random() * Math.PI * 2, random() * 0.5],
        pick(FRACTURE),
      );
    }

    for (const [dx, dz] of [
      [-0.3, -0.3],
      [0.3, -0.3],
      [0.05, 0.32],
      [-0.32, 0.25],
    ] as const) {
      polyline(
        dress,
        [x + dx, 1.25, z + dz],
        [
          [0, 0.4 + random() * 0.25, 0],
          [
            dx * 1.2 + (random() - 0.5) * 0.3,
            0.25,
            dz * 1.4 + (random() - 0.5) * 0.3,
          ],
        ],
        0.035,
        random() < 0.4 ? REBAR_BARE : REBAR,
      );
    }

    // The fallen upper part: a column's length of concrete on the floor.
    put(
      debris,
      "slab",
      28.0,
      0.45,
      5.28,
      [0.9, 2.5, 0.85],
      [0.02, 0.0, Math.PI / 2 - 0.02],
      CONCRETE[0],
    );
    solid(debrisBoxes, 26.9, 29.1, 4.85, 5.7, 0.9);

    for (const k of [0, 1, 2]) {
      polyline(
        dress,
        [26.78, 0.3 + k * 0.22, 5.0 + k * 0.2],
        [[-(0.45 + random() * 0.25), 0.04, (random() - 0.5) * 0.2]],
        0.035,
        REBAR,
      );
    }
  }

  // ------------------------------------------------- beams across the ceiling
  // Two deep concrete beams on the column lines, the underside spalled and the
  // bars hanging out of it; the second pulled off its seat at the east end and
  // sagging over the boiler.
  for (const z of COL_Z) {
    const east = z === COL_Z[1] ? 26.0 : XE;

    box(
      dress,
      (XW + east) / 2,
      ceiling - 0.45,
      z,
      [east - XW, 0.45, 0.55],
      CONCRETE[3],
    );
    box(
      dress,
      (XW + east) / 2,
      ceiling - 0.47,
      z,
      [east - XW, 0.04, 0.4],
      FRACTURE[2],
    );
  }

  // The standing east column's own beam, tying its head to the east wall (a
  // short one: the column is off the long beams' lines).
  box(
    dress,
    (COL_E + XE) / 2,
    ceiling - 0.45,
    COL_EAST_Z,
    [XE - COL_E, 0.45, 0.5],
    CONCRETE[3],
  );

  between(
    dress,
    [26.0, ceiling - 0.22, COL_Z[1]],
    [29.55, 2.65, COL_Z[1]],
    0.45,
    CONCRETE[3],
    0.55,
  );
  box(dress, 29.5, 2.2, COL_Z[1], [0.45, 0.05, 0.6], STEEL_DARK);

  // ------------------------------------------------------ the ceiling's frame
  // The slab is carried on a frame: a transverse beam over each column line
  // and one between them, tied into the long beams above, and a portal beam
  // across the far end's opening; capitals (flared heads) where a pier meets
  // a beam. Beam undersides are well over head height (3.2 m).
  const BEAM = (
    x: number,
    z: number,
    sx: number,
    sz: number,
    depth = 0.45,
  ): void => box(dress, x, ceiling - depth, z, [sx, depth, sz], CONCRETE[3]);

  BEAM(COL_W, -0.7, 0.5, 12.8);
  BEAM(23.7, -0.7, 0.34, 12.8, 0.3);
  // The east transverse beam is broken between z -3.2 and -1.6: it hangs on its
  // bars from each side, and its fallen middle lies on the floor below.
  BEAM(COL_E, -5.2, 0.5, 4.0);
  BEAM(COL_E, 2.2, 0.5, 7.0);

  for (const [z, dz] of [
    [-3.2, 0.5],
    [-1.6, -0.5],
  ] as const) {
    // The torn end: a ragged lower edge and bars out of it, bent down.
    for (let k = 0; k < 5; k++) {
      const bx = COL_E - 0.18 + k * 0.09;

      between(
        dress,
        [bx, ceiling - 0.4, z],
        [
          bx + (random() - 0.5) * 0.08,
          ceiling - 0.4 - 0.25 - random() * 0.35,
          z + dz * (0.25 + random() * 0.4),
        ],
        0.035,
        random() < 0.5 ? REBAR_BARE : REBAR,
      );
    }

    for (let k = 0; k < 4; k++) {
      const size = 0.1 + random() * 0.1;

      put(
        dress,
        "rock",
        COL_E + (random() - 0.5) * 0.4,
        ceiling - 0.42 - size * 0.3,
        z + dz * 0.1,
        [size * 1.3, size, size],
        [random() * 0.5, random() * Math.PI * 2, random() * 0.5],
        pick(FRACTURE),
      );
    }
  }

  // The fallen length of that beam, on the floor under the gap, broken in two.
  put(
    debris,
    "slab",
    COL_E - 0.35,
    0.2,
    -2.9,
    [0.5, 0.44, 0.9],
    [0.0, 0.2, 0.04],
    CONCRETE[3],
  );
  put(
    debris,
    "slab",
    COL_E - 0.8,
    0.18,
    -1.95,
    [0.5, 0.4, 0.7],
    [0.0, -0.5, 0.0],
    CONCRETE[3],
  );
  solid(debrisBoxes, COL_E - 0.85, COL_E - 0.1, -3.4, -1.55, 0.42);

  // The portal across the far end: a deep beam over the narrowing, carried on
  // corbels at each shoulder (it frames the enclosure from the hall).
  BEAM(24.0, 6.0, 6.9, 0.55, 0.62);

  for (const x of [20.9, 27.1]) {
    box(
      dress,
      x + (x < 24 ? 0.25 : -0.25),
      ceiling - 0.9,
      6.0,
      [0.5, 0.3, 0.7],
      CONCRETE[1],
    );
  }

  // Exposed reinforcement where the slab has broken away: a hollow in the
  // soffit ringed with fractured concrete, the bars of the top and bottom
  // mats showing across it (some snapped and bent down), lumps hanging on them.
  const bare = (cx: number, cz: number, w: number, d: number): void => {
    for (let k = 0; k < 14; k++) {
      const t = (k / 14) * Math.PI * 2;
      const size = 0.1 + random() * 0.12;

      put(
        dress,
        "rock",
        cx + Math.cos(t) * (w / 2) * (0.9 + random() * 0.2),
        ceiling - size * 0.35,
        cz + Math.sin(t) * (d / 2) * (0.9 + random() * 0.2),
        [size * 1.3, size * 0.8, size],
        [random() * 0.5, random() * Math.PI * 2, random() * 0.5],
        pick(FRACTURE),
      );
    }

    for (let x = cx - w / 2 + 0.15; x < cx + w / 2; x += 0.2) {
      between(
        dress,
        [x, ceiling - 0.08, cz - d / 2 + 0.1],
        [x, ceiling - 0.08, cz + d / 2 - 0.1],
        0.03,
        REBAR,
      );
    }

    for (let z = cz - d / 2 + 0.15; z < cz + d / 2; z += 0.22) {
      between(
        dress,
        [cx - w / 2 + 0.1, ceiling - 0.11, z],
        [cx + w / 2 - 0.1, ceiling - 0.11, z],
        0.028,
        REBAR_BARE,
      );
    }

    // Two snapped bars hanging down in loose curves.
    for (const side of [-1, 1]) {
      polyline(
        dress,
        [cx + side * w * 0.3, ceiling - 0.1, cz],
        [
          [side * 0.05, -0.3, 0.1],
          [side * 0.12, -0.35, 0.25],
          [side * 0.25, -0.15, 0.3],
        ],
        0.032,
        REBAR,
      );
    }
  };

  bare(23.0, -1.0, 1.7, 1.3);
  bare(20.2, 4.2, 1.3, 1.1);
  bare(25.3, 8.2, 1.4, 1.0);

  // A cable tray along the long beam at z -6: a channel with rungs, hung from
  // the beam on L brackets, and two cable runs lying in it.
  {
    const z = -6.0 + 0.42;
    const y = ceiling - 0.62;

    box(dress, 24.0, y, z, [10.8, 0.05, 0.34], STEEL_DARK);
    box(dress, 24.0, y + 0.05, z - 0.17, [10.8, 0.1, 0.03], STEEL_DARK);
    box(dress, 24.0, y + 0.05, z + 0.17, [10.8, 0.1, 0.03], STEEL_DARK);

    for (let x = XW + 0.4; x < XE - 0.4; x += 0.5) {
      box(dress, x, y + 0.01, z, [0.03, 0.02, 0.32], STEEL);
    }

    for (let x = XW + 1.2; x < XE - 1; x += 2.4) {
      box(dress, x, y, z + 0.02, [0.05, ceiling - y - 0.2, 0.05], STEEL_DARK);
      box(dress, x, ceiling - 0.2, z - 0.1, [0.08, 0.04, 0.3], STEEL_DARK);
    }

    for (const dz of [-0.07, 0.08]) {
      between(
        dress,
        [XW + 0.5, y + 0.09, z + dz],
        [XE - 0.6, y + 0.09, z + dz],
        0.06,
        CABLE,
      );
    }
  }

  // The ventilation opening is carried up into the ceiling: a plenum from the
  // duct's torn end to a flanged riser through the slab, braced to the beam,
  // so the opening is a route and not a hole in a wall.
  {
    const z = VENT.z;

    box(dress, XW + 0.55, 3.3, z, [1.2, 0.04, VENT.w + 0.1], STEEL);
    box(dress, XW + 0.55, ceiling - 0.04, z, [1.2, 0.04, VENT.w + 0.1], STEEL);

    for (const side of [-1, 1]) {
      box(
        dress,
        XW + 0.55,
        3.3,
        z + side * (VENT.w / 2 + 0.03),
        [1.2, ceiling - 3.3, 0.04],
        STEEL,
      );
    }

    box(
      dress,
      XW + 1.15,
      3.28,
      z,
      [0.06, ceiling - 3.28 + 0.04, VENT.w + 0.2],
      STEEL_DARK,
    );
    between(
      dress,
      [XW + 1.1, ceiling - 0.05, z - 0.5],
      [XW + 1.6, ceiling - 0.4, z - 0.5],
      0.06,
      STEEL_DARK,
    );
    between(
      dress,
      [XW + 1.1, ceiling - 0.05, z + 0.5],
      [XW + 1.6, ceiling - 0.4, z + 0.5],
      0.06,
      STEEL_DARK,
    );
  }

  // ---------------------------------------------------- the collapsed entrance
  // The vestibule has partly come down: a slab has dropped from the ceiling and
  // lies on a slant from its torn seat against the west wall to the floor,
  // with a spill of rubble at its foot and a beam stub hanging above it. The
  // way in (x 22.5 to 25.3) stays open.
  {
    put(
      debris,
      "slab",
      22.15,
      1.5,
      -9.2,
      [0.42, 2.6, 1.7],
      [0.0, 0.1, Math.PI / 2 - 1.05],
      CONCRETE[0],
    );
    solid(debrisBoxes, 21.7, 22.55, -10.15, -8.2, 1.7);
    bare(22.7, -9.2, 1.4, 1.5);

    for (let n = 0; n < 12; n++) {
      layOn(
        debris,
        n % 3 === 0 ? "slab" : "rock",
        22.5 + random() * 1.1,
        -10.3 + random() * 2.2,
        [0.14 + random() * 0.26, 0.14, 0.14 + random() * 0.2],
        [random() * 0.4, random() * Math.PI * 2, random() * 0.4],
        pick(CONCRETE),
      );
    }

    // A beam over the vestibule's middle, snapped, its east half sagging.
    BEAM(23.5, -8.4, 3.0, 0.4, 0.4);
    between(
      dress,
      [25.0, ceiling - 0.4, -8.4],
      [25.3, ceiling - 0.85, -8.5],
      0.12,
      CONCRETE[3],
      0.4,
    );
  }

  // ------------------------------------------------- damage on the walls
  /**
   * A broken patch on a wall: a dark spall with bars, a kinked crack and
   * rubble at its foot. `plane` is the wall face, `u` the place along it.
   */
  const spall = (
    face: Face,
    plane: number,
    u: number,
    y: number,
    w: number,
    h: number,
  ): void => {
    const sign = face === "W" || face === "N" ? 1 : -1;
    const along = face === "W" || face === "E";
    const at = (off: number, v: number): V3 =>
      along ? [plane + sign * off, v, u] : [u, v, plane + sign * off];
    // The break: where the outer skin of concrete has come away. Three thin
    // slabs of rough, lighter concrete (the exposed core), each a little
    // smaller than the last and 1.5 cm further out, so the patch has an
    // irregular stepped outline and a visible edge (the steps are separate
    // offsets, so nothing shares a plane). They lie flat on the wall: nothing
    // floats and nothing is black.
    const slab = (
      du: number,
      dv: number,
      sw: number,
      sh: number,
      off: number,
      turn: number,
      color: number,
    ): void => {
      const [cx, , cz] = at(off, y);

      put(
        dress,
        "plank",
        along ? cx : u + du,
        y + dv,
        along ? u + du : cz,
        along ? [0.02, sh, sw] : [sw, sh, 0.02],
        along ? [turn, 0, 0] : [0, 0, turn],
        color,
      );
    };

    slab(0, 0, w, h, 0.012, 0, FRACTURE[2]);
    slab(
      w * 0.08,
      -h * 0.06,
      w * 0.74,
      h * 0.7,
      0.026,
      (random() - 0.5) * 0.3,
      FRACTURE[0],
    );
    slab(
      -w * 0.1,
      h * 0.12,
      w * 0.45,
      h * 0.42,
      0.04,
      (random() - 0.5) * 0.4,
      FRACTURE[1],
    );

    // Broken edge: a few chunks sitting in the lower rim of the break (resting
    // on its ledge, touching the wall).
    for (let k = 0; k < 4; k++) {
      const size = 0.07 + random() * 0.08;
      const lu = u + (k / 3 - 0.5) * w * 0.9;
      const [cx, , cz] = at(0.03 + size * 0.2, y - h * 0.5);

      put(
        dress,
        "rock",
        along ? cx : lu,
        y - h * 0.5 + size * 0.3,
        along ? lu : cz,
        [size * 1.2, size * 0.8, size],
        [random() * 0.4, random() * Math.PI * 2, random() * 0.4],
        pick(CONCRETE),
      );
    }

    // Reinforcement: two bars run along inside the core, bared where the skin
    // is gone: each comes out of the wall plane (starting inside the patch),
    // bends and ends, not stuck on from outside.
    for (let k = 0; k < 2; k++) {
      const off = (k - 0.5) * (w * 0.4);
      const [bx, by, bz] = at(0.045, y + (k ? 0.12 : -0.1));
      const o: V3 = along ? [bx, by, u + off] : [u + off, by, bz];

      polyline(
        dress,
        o,
        [
          along ? [sign * 0.07, 0.01, 0] : [0, 0.01, sign * 0.07],
          along
            ? [sign * 0.09, -0.12 - random() * 0.1, (random() - 0.5) * 0.08]
            : [(random() - 0.5) * 0.08, -0.12 - random() * 0.1, sign * 0.09],
        ],
        0.028,
        k % 2 ? REBAR : REBAR_BARE,
      );
    }

    for (let n = 0; n < 5; n++) {
      const out = 0.15 + random() * 0.8;
      const spread = u + (random() - 0.5) * (w + 0.8);

      layOn(
        debris,
        "rock",
        along ? plane + sign * out : spread,
        along ? spread : plane + sign * out,
        [0.1 + random() * 0.2, 0.1, 0.1 + random() * 0.15],
        [random() * 0.4, random() * Math.PI * 2, random() * 0.4],
        pick(CONCRETE),
      );
    }
  };

  spall("E", XE, 4.3, 1.0, 0.6, 1.1);
  spall("W", XW, -1.95, 1.4, 0.5, 1.2);
  spall("W", XW, 1.0, 1.3, 0.7, 1.1);
  spall("N", -7.2, 27.2, 1.4, 1.0, 1.4);
  spall("E", 25.3, -8.2, 1.6, 0.7, 1.0);
  spall("E", 27.1, 9.0, 1.4, 0.8, 1.2);
  spall("W", 21.7, -9.9, 1.2, 0.7, 0.9);
  spall("S", 11.7, 21.25, 1.2, 0.6, 1.1);

  // Water stains: long dark runs from the ceiling joints down the walls.
  for (const [face, plane, u, len, w] of [
    ["W", XW, 5.0, 1.9, 0.4],
    ["E", XE, 4.3, 1.5, 0.3],
    ["W", XW, 0.9, 1.6, 0.35],
    ["S", 11.7, 26.6, 1.8, 0.5],
    ["W", 21.7, -8.6, 1.5, 0.35],
  ] as const) {
    const along = face === "W" || face === "E";
    const sign = face === "W" ? 1 : -1;
    const x = along ? plane + sign * 0.016 : u;
    const z = along ? u : plane + sign * 0.016;

    put(
      dress,
      "plank",
      x,
      ceiling - len / 2,
      z,
      along ? [0.008, len, w] : [w, len, 0.008],
      [0, 0, 0],
      STAIN,
    );
  }

  // ------------------------------------------------- the ventilation opening
  // High in the arena wall between the two weak sections: a torn duct end
  // standing 0.8 m into the hall, its grille hanging by one bolt, brackets
  // under it. The same duct comes out on the arena face behind a bent frame
  // and a barred grille (the wall behind both stays solid).
  {
    const vz = VENT.z;
    const vy = VENT.y;
    const w = VENT.w;
    const h = VENT.h;
    const top = vy + h / 2;
    const bottom = vy - h / 2;
    // (u along the wall, v up, n out of it) to the world.
    const plate = (
      u: number,
      v: number,
      n: number,
      size: V3,
      turn: V3,
      color: number,
    ): void =>
      put(
        dress,
        "plank",
        XW + n,
        v,
        vz + u,
        [size[2], size[1], size[0]],
        [turn[0], turn[1], turn[2]],
        color,
      );

    plate(0, vy, 0.008, [w, h, 0.012], [0, 0, 0], 0x1d1b1a);
    plate(0, top + 0.05, 0.08, [w + 0.2, 0.1, 0.16], [0, 0, 0], STEEL_DARK);
    plate(
      0,
      bottom - 0.05,
      0.08,
      [w + 0.2, 0.1, 0.16],
      [0.03, 0, 0],
      STEEL_DARK,
    );
    plate(-w / 2 - 0.05, vy, 0.08, [0.1, h, 0.16], [0, 0, 0], STEEL_DARK);
    plate(
      w / 2 + 0.12,
      vy + 0.05,
      0.1,
      [0.1, h, 0.16],
      [0.12, 0.35, 0],
      STEEL_DARK,
    );

    // The duct end, torn off 0.8 m out of the wall.
    plate(0, top - 0.03, 0.43, [w, 0.04, 0.7], [0, 0, 0], STEEL);
    plate(0, bottom + 0.02, 0.3, [w, 0.04, 0.45], [0, 0, 0.18], STEEL);
    plate(-w / 2 + 0.02, vy, 0.43, [0.04, h, 0.7], [0, 0, 0], STEEL);
    plate(w / 2 + 0.2, vy, 0.4, [0.04, h, 0.6], [0, 0.55, 0], STEEL);

    // The grille: held by one bolt at the top, hanging crooked, a rim and slats.
    const gw = 1.4;
    const gh = 0.9;
    const angle = -0.55;
    const hu = -w / 2;
    const hv = top - 0.02;
    const loc = (u: number, v: number): [number, number] => [
      hu + u * Math.cos(angle) - v * Math.sin(angle),
      hv + u * Math.sin(angle) + v * Math.cos(angle),
    ];

    for (const [cu, cv, su, sv] of [
      [gw / 2, 0, gw, 0.05],
      [gw / 2, -gh, gw, 0.05],
      [0, -gh / 2, 0.05, gh],
      [gw, -gh / 2, 0.05, gh],
    ] as const) {
      const c = loc(cu, cv);

      plate(c[0], c[1], 0.12, [su, sv, 0.04], [angle, 0, 0], STEEL_DARK);
    }

    for (let k = 1; k < 7; k++) {
      const c = loc(gw / 2, -(gh * k) / 7);

      plate(c[0], c[1], 0.12, [gw - 0.05, 0.025, 0.04], [angle, 0.5, 0], STEEL);
    }

    for (const du of [-0.5, 0.5]) {
      plate(du, bottom - 0.2, 0.0, [0.24, 0.22, 0.06], [0, 0, 0], STEEL_DARK);
      plate(du, bottom - 0.1, 0.25, [0.5, 0.04, 0.06], [0, 0, 0], STEEL_DARK);
    }

    // The arena face: the frame, a dark opening and bars (outside the wall).
    for (const [u, v, su, sv] of [
      [0, top + 0.04, w + 0.2, 0.08],
      [0, bottom - 0.04, w + 0.2, 0.08],
      [-w / 2 - 0.04, vy, 0.08, h],
      [w / 2 + 0.04, vy, 0.08, h],
    ] as const) {
      put(
        dress,
        "plank",
        17.94,
        v,
        vz + u,
        [0.1, sv, su],
        [0, 0, 0],
        STEEL_DARK,
      );
    }

    put(dress, "plank", 17.99, vy, vz, [0.012, h, w], [0, 0, 0], 0x1d1b1a);

    for (let k = 0; k < 9; k++) {
      put(
        dress,
        "plank",
        17.93,
        vy,
        vz - w / 2 + 0.1 + k * ((w - 0.2) / 8),
        [0.03, h - 0.04, 0.03],
        [0, 0, 0],
        STEEL,
      );
    }
  }

  // ---------------------------------------------------- the east wall: services
  const servicesMark = mark();

  // Switchgear in the north bay: three different units, old and damaged. Each
  // stands on a plinth under a vented hood, with a framed door, handle, hinges
  // and a meter window; the middle one's door hangs open on its lower hinge,
  // showing its breakers and bus bars; cables enter each from above through
  // a gland.
  {
    const x = 29.15;
    const units: Array<{
      z0: number;
      w: number;
      h: number;
      body: number;
      open: boolean;
    }> = [
      { z0: -5.9, w: 1.15, h: 2.15, body: 0x4a5560, open: false },
      { z0: -4.7, w: 0.95, h: 1.95, body: 0x3f464e, open: true },
      { z0: -3.7, w: 1.1, h: 2.05, body: 0x55544c, open: false },
    ];

    units.forEach((u, i) => {
      const zc = u.z0 + u.w / 2;

      // Plinth and body, a hood with a vent slot, a gland plate on top.
      box(machines, x + 0.3, 0, zc, [0.6, 0.12, u.w + 0.04], STEEL_DARK);
      box(machines, x + 0.275, 0.12, zc, [0.55, u.h - 0.12, u.w], u.body);
      box(machines, x + 0.28, u.h, zc, [0.62, 0.05, u.w + 0.06], STEEL_DARK);
      box(machines, x + 0.1, u.h + 0.05, zc, [0.2, 0.04, u.w * 0.6], 0x2a2d33);

      // Framed door: a raised rim and a recessed panel, so it has depth.
      const doorH = u.h - 0.55;

      box(machines, x - 0.01, 0.3, zc, [0.025, doorH, u.w - 0.1], STEEL_DARK);

      if (u.open) {
        // The door open on its lower-north hinge (swung 1.1 rad into the hall),
        // the cabinet's inside showing: a dark back, bus bars, a row of breakers.
        box(
          machines,
          x + 0.02,
          0.32,
          zc,
          [0.03, doorH - 0.04, u.w - 0.14],
          0x14161a,
        );

        for (let k = 0; k < 3; k++) {
          box(
            machines,
            x + 0.04,
            0.45,
            zc - 0.28 + k * 0.28,
            [0.02, doorH - 0.3, 0.05],
            0x8a5530,
          );
        }

        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 3; c++) {
            box(
              machines,
              x + 0.05,
              0.5 + r * 0.3,
              zc - 0.3 + c * 0.3,
              [0.06, 0.12, 0.1],
              0x2a2d33,
            );
          }
        }

        put(
          machines,
          "plank",
          x - 0.34,
          0.3 + doorH / 2,
          u.z0 + 0.05 + (u.w - 0.1) * 0.4,
          [0.04, doorH, u.w - 0.12],
          [0, 1.1, 0],
          u.body,
        );
      } else {
        box(
          machines,
          x - 0.03,
          0.34,
          zc,
          [0.025, doorH - 0.08, u.w - 0.18],
          u.body,
        );
        // Handle, hinge pins, a meter window with a cracked pane, a nameplate.
        box(
          machines,
          x - 0.06,
          1.0,
          zc + u.w / 2 - 0.2,
          [0.04, 0.16, 0.03],
          0x1a1c20,
        );

        for (const hy of [0.5, doorH - 0.1]) {
          box(
            machines,
            x - 0.045,
            hy,
            zc - u.w / 2 + 0.07,
            [0.03, 0.08, 0.04],
            0x1a1c20,
          );
        }

        box(machines, x - 0.045, 1.35, zc - 0.12, [0.012, 0.22, 0.3], 0x1b1f24);
        box(
          machines,
          x - 0.052,
          1.3,
          zc - 0.15,
          [0.006, 0.01, 0.2],
          0x7a8088,
          [0, 0, 0.5],
        );
        box(machines, x - 0.045, 0.6, zc, [0.012, 0.07, 0.4], 0x8a8068);
      }

      // Lamps (some dead) in a row above the door, louvres low down.
      for (let k = 0; k < 3; k++) {
        box(
          machines,
          x - 0.04,
          u.h - 0.17,
          zc - 0.2 + k * 0.2,
          [0.02, 0.06, 0.06],
          (i + k) % 3 === 0
            ? 0xb87a2a
            : (i + k) % 3 === 1
              ? 0x2a2018
              : 0x7a2a22,
        );
      }

      for (let l = 0; l < 3 && !u.open; l++) {
        box(
          machines,
          x - 0.032,
          0.17 + l * 0.05,
          zc,
          [0.015, 0.025, u.w * 0.6],
          0x15181c,
        );
      }

      // The cable up into the tray from a gland, along the hood.
      between(
        machines,
        [x + 0.1, u.h + 0.09, zc],
        [x + 0.35, 2.95, zc + (i - 1) * 0.1],
        0.07,
        CABLE,
      );
    });

    // Wiring out of the foot of the third unit, on the floor.
    for (let k = 0; k < 4; k++) {
      between(
        machines,
        [x - 0.01, 0.28 - k * 0.04, -3.4 + k * 0.1],
        [x - 0.5 - k * 0.1, 0.02, -3.2 + k * 0.18],
        0.03,
        CABLE,
      );
    }

    solid(machineBoxes, x, 29.7, -5.9, -2.6, 2.0);
  }

  // The cable tray along the east wall at 3.1 m: a run of channel, one length
  // pulled off its hangers and sagging, cables hanging from it.
  {
    const x = 29.42;
    const y = 3.1;

    // Two straight runs, and between them the end of the first torn from its
    // hangers and drooping to the floor, its cables hanging.
    for (const [z0, z1] of [
      [-7.0, -0.7],
      [2.0, 5.5],
    ] as const) {
      between(dress, [x, y, z0], [x, y, z1], 0.04, STEEL_DARK, 0.5);
      between(
        dress,
        [x - 0.24, y + 0.06, z0],
        [x - 0.24, y + 0.06, z1],
        0.04,
        STEEL_DARK,
        0.04,
      );
      between(
        dress,
        [x + 0.24, y + 0.06, z0],
        [x + 0.24, y + 0.06, z1],
        0.04,
        STEEL_DARK,
        0.04,
      );
    }

    between(dress, [x, y, -0.7], [x - 0.1, 2.2, 0.15], 0.04, STEEL_DARK, 0.5);

    for (let z = -6.5; z < 5.3; z += 2.2) {
      box(dress, 29.7 - 0.04, y + 0.2, z, [0.04, 0.5, 0.05], STEEL_DARK);
    }

    // A cable hanging from the torn end, draped over the drooping channel and
    // lying on the floor in a loose curve (not a rod standing on its end).
    polyline(
      dress,
      [x - 0.1, 2.2, -0.1],
      [
        [-0.1, -0.7, 0.05],
        [-0.25, -0.9, 0.25],
        [-0.5, -0.5, 0.35],
      ],
      0.035,
      CABLE,
    );
  }

  // The boiler unit in the south bay, on skids: a horizontal drum, a riser
  // pipe to the ceiling, a burst relief valve, gauges; pipes running on from it.
  {
    const bx = 29.0;
    const bz = 2.3;

    box(machines, bx, 0, bz - 1.1, [1.2, 0.3, 0.14], STEEL_DARK);
    box(machines, bx, 0, bz + 1.1, [1.2, 0.3, 0.14], STEEL_DARK);
    put(
      machines,
      "pipe",
      bx,
      0.95,
      bz,
      [3.2, 1.3, 1.3],
      [0, Math.PI / 2, 0],
      0x4b5663,
    );
    put(
      machines,
      "pipe",
      bx,
      0.95,
      bz - 1.55,
      [0.14, 1.36, 1.36],
      [0, Math.PI / 2, 0],
      STEEL_DARK,
    );
    put(
      machines,
      "pipe",
      bx,
      0.95,
      bz + 1.55,
      [0.14, 1.36, 1.36],
      [0, Math.PI / 2, 0],
      STEEL_DARK,
    );
    put(
      machines,
      "pipe",
      bx + 0.15,
      2.7,
      bz - 0.4,
      [2.1, 0.28, 0.28],
      [0, 0, Math.PI / 2],
      PIPE_OLD,
    );
    box(
      machines,
      bx + 0.15,
      ceiling - 0.1,
      bz - 0.4,
      [0.5, 0.05, 0.5],
      STEEL_DARK,
    );

    for (const dz of [-0.7, -0.2, 0.5]) {
      put(
        machines,
        "pipe",
        bx - 0.66,
        1.2,
        bz + dz,
        [0.06, 0.22, 0.22],
        [0, 0, 0],
        0x23272c,
      );
      put(
        machines,
        "pipe",
        bx - 0.7,
        1.2,
        bz + dz,
        [0.02, 0.18, 0.18],
        [0, 0, 0],
        0x8a8068,
      );
    }

    put(
      machines,
      "pipe",
      bx - 0.7,
      0.55,
      bz + 0.9,
      [0.3, 0.1, 0.1],
      [0, 0, 0],
      STEEL,
    );
    between(
      machines,
      [bx - 0.1, 1.62, bz + 0.6],
      [bx - 0.25, 1.95, bz + 0.85],
      0.1,
      PIPE,
    );
    put(
      machines,
      "plank",
      bx - 0.1,
      1.598,
      bz + 0.6,
      [0.5, 0.01, 0.5],
      [0, 0, 0],
      0x0d0e10,
    );
    // The pipes on from it along the east wall, north and south.
    put(
      machines,
      "pipe",
      29.4,
      2.55,
      -3.45,
      [5.5, 0.3, 0.3],
      [0, Math.PI / 2, 0],
      PIPE,
    );
    put(
      machines,
      "pipe",
      29.4,
      2.55,
      3.35,
      [1.5, 0.3, 0.3],
      [0, Math.PI / 2, 0],
      PIPE,
    );
    solid(machineBoxes, 28.35, 29.65, 0.7, 3.9, 1.6);
  }

  moveEast(servicesMark);

  // ------------------------------------------------- the main across the hall
  // One thick main crossing the hall from wall to wall at 3 m on hangers,
  // under the beams: the pipe that leaks at its middle joint.
  put(
    dress,
    "pipe",
    (XW + XE) / 2,
    3.0,
    2.6,
    [XE - XW, 0.4, 0.4],
    [0, 0, 0],
    PIPE,
  );

  for (let x = 19.4; x < XE - 0.2; x += 2.7) {
    box(dress, x, 3.2, 2.6, [0.06, 0.5, 0.06], STEEL_DARK);
    box(dress, x, 2.88, 2.6, [0.12, 0.04, 0.6], STEEL_DARK);
  }

  box(dress, 24.0, 2.76, 2.6, [0.5, 0.48, 0.5], STEEL_DARK);

  // ----------------------------------------------------- the entry vestibule
  // A wall-mounted distribution board on the east wall, its door hanging, a
  // conduit run to the ceiling, and a hazard stripe on the floor before it.
  {
    const x = 25.0;

    box(machines, x + 0.15, 0.9, -9.9, [0.3, 1.6, 1.2], CABINET);
    box(machines, x - 0.005, 1.0, -9.9, [0.02, 1.2, 1.0], 0x20252b);

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 6; c++) {
        box(
          machines,
          x - 0.012,
          1.12 + r * 0.22,
          -10.35 + c * 0.18,
          [0.02, 0.1, 0.1],
          (r * 6 + c) % 7 === 0 ? 0xb87a2a : 0x2a2d32,
        );
      }
    }

    // Its door, open on the south hinge (an edge on the board's, 0.9 rad out):
    // a solid steel leaf 7 cm thick with a folded rim round all four edges, a
    // stiffening panel on the inside face, hinge knuckles and a latch.
    {
      const cx = x - 0.47;
      const cz = -9.3 + 0.37;
      const th = -0.9;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      // a point (lx across the thickness, lz along the leaf) in the world
      const at = (lx: number, lz: number): [number, number] => [
        cx + lx * c + lz * sn,
        cz - lx * sn + lz * c,
      ];
      const leaf = (
        lx: number,
        y: number,
        lz: number,
        sx: number,
        sy: number,
        sz: number,
        color: number,
      ): void => {
        const [wx, wz] = at(lx, lz);

        put(machines, "plank", wx, y, wz, [sx, sy, sz], [0, th, 0], color);
      };

      leaf(0, 1.7, 0, 0.07, 1.6, 0.9, 0x3c4652);
      // The folded rim: bars proud of both faces along the edges.
      leaf(0.02, 1.7, -0.44, 0.1, 1.6, 0.04, STEEL_DARK);
      leaf(0.02, 1.7, 0.44, 0.1, 1.6, 0.04, STEEL_DARK);
      leaf(0.02, 0.92, 0, 0.1, 0.04, 0.9, STEEL_DARK);
      leaf(0.02, 2.48, 0, 0.1, 0.04, 0.9, STEEL_DARK);
      // The stiffening panel on the face that looks into the hall.
      leaf(-0.05, 1.7, 0, 0.03, 1.3, 0.62, 0x2c333b);
      // Hinge knuckles (south edge) and a latch plate (north edge).
      for (const hy of [1.05, 1.7, 2.35]) {
        leaf(0, hy, -0.46, 0.05, 0.12, 0.05, 0x1a1c20);
      }

      leaf(-0.06, 1.7, 0.36, 0.04, 0.16, 0.06, 0x1a1c20);
    }

    // Wiring from the board's foot to the floor.
    for (let k = 0; k < 6; k++) {
      between(
        machines,
        [x - 0.02, 0.95, -10.3 + k * 0.17],
        [x - 0.2 - (k % 3) * 0.08, 0.03, -10.2 + k * 0.17],
        0.03,
        CABLE,
      );
    }

    between(
      machines,
      [25.1, 2.45, -10.2],
      [25.1, ceiling - 0.05, -10.2],
      0.08,
      PIPE,
    );
    solid(machineBoxes, 25.0, 25.3, -10.5, -9.3, 2.5);

    for (let k = 0; k < 5; k++) {
      put(
        machines,
        "plank",
        24.7,
        0.007,
        -10.4 + k * 0.4,
        [0.5, 0.012, 0.2],
        [0, 0.7, 0],
        k % 2 ? 0x16181b : HAZARD,
      );
    }
  }

  // ---------------------------------------------------- the burning drum
  // One drum in the north-east corner of the hall, well off the route: a low
  // warm glow on the east wall, not a floodlight.
  {
    const fx = 28.4 + EAST_SHIFT;
    const fz = -5.2;

    put(
      machines,
      "pipe",
      fx,
      0.41,
      fz,
      [0.82, 0.58, 0.58],
      [0, 0, Math.PI / 2],
      0x3c3f44,
    );
    put(
      machines,
      "pipe",
      fx,
      0.2,
      fz,
      [0.06, 0.62, 0.62],
      [0, 0, Math.PI / 2],
      0x2c2f33,
    );
    put(
      machines,
      "pipe",
      fx,
      0.62,
      fz,
      [0.06, 0.62, 0.62],
      [0, 0, Math.PI / 2],
      0x2c2f33,
    );

    for (const [a, b] of [
      [0.5, 0.0],
      [-0.8, 0.0],
      [1.9, 0.0],
    ] as const) {
      put(
        machines,
        "plank",
        fx,
        0.86,
        fz,
        [0.46, 0.04, 0.04],
        [0, a, b],
        0x1a1411,
      );
    }

    box(
      machines,
      fx - 0.68,
      0,
      fz + 0.1,
      [0.9, 0.05, 0.12],
      WOOD[0],
      [0, 0.5, 0],
    );
    box(
      machines,
      fx - 0.66,
      0.05,
      fz + 0.12,
      [0.8, 0.05, 0.1],
      WOOD[1],
      [0, 0.42, 0],
    );
    solid(machineBoxes, fx - 0.29, fx + 0.29, fz - 0.29, fz + 0.29, 0.9);
    map.addFireDrum({
      id: "fire-drum-chamber",
      x: fx,
      y: 0.82,
      z: fz,
      glow: 0.28,
    });
    map.addDecal({
      id: "decal-room-chamber-fire-soot",
      kind: "stain",
      x: fx,
      z: fz,
      y: 0,
      width: 1.8,
      depth: 1.8,
      rotation: 0.4,
      color: 0x0d0c0b,
      alpha: 0.5,
    });
  }

  // ----------------------------------------------------- the fallen slab
  // A ceiling slab that came down by the vent and lies flat on the floor, with
  // the rubble that came down with it in a spill round its edges.
  {
    put(
      debris,
      "slab",
      19.65,
      0.14,
      -0.5,
      [2.5, 0.28, 1.75],
      [0, 0.06, 0],
      CONCRETE[0],
    );
    solid(debrisBoxes, XW, 20.9, -1.4, 0.4, 0.3);

    for (let n = 0; n < 14; n++) {
      const east = n < 7;

      layOn(
        debris,
        "rock",
        east ? 21.0 + random() * 0.8 : XW + 0.3 + random() * 2.4,
        east
          ? -1.6 + random() * 2.2
          : (n % 2 ? -1.65 : 0.65) + (random() - 0.5) * 0.2,
        [0.15 + random() * 0.3, 0.16, 0.15 + random() * 0.25],
        [random() * 0.5, random() * Math.PI * 2, random() * 0.5],
        pick(CONCRETE),
      );
    }
  }

  // ---------------------------------------------- the hall's east half
  // The hall runs on east past the arena's old east edge (x 32) to its east
  // wall at x 37.4, with that wall's services (switchgear, cable tray, boiler,
  // the burning drum) where they were against it, now at the new wall. Its
  // east half has a standing column and a broken one, a slab lying in the
  // south corner, rubble, and the ceiling partly down. The middle is open.
  {
    for (const [name, x, z, height] of [
      ["east-a", 32.4, -2.3, ceiling],
      ["east-b-stump", 34.6, -0.7, 1.5],
    ] as const) {
      column(name, x, z, height);
      box(dress, x, 0, z, [1.1, 0.22, 1.1], CONCRETE[1]);

      if (height === ceiling) {
        box(dress, x, ceiling - 0.2, z, [1.08, 0.2, 1.08], CONCRETE[1]);
      }
    }

    // The broken column's stump: bars out of its fractured top, fragments.
    for (const [dx, dz] of [
      [-0.3, -0.3],
      [0.3, -0.3],
      [-0.3, 0.3],
      [0.3, 0.3],
      [0, 0],
    ] as const) {
      polyline(
        dress,
        [34.6 + dx, 1.5, -0.7 + dz],
        [
          [dx * 0.2, 0.4, dz * 0.2],
          [dx * 0.4, 0.2, dz * 0.4],
        ],
        0.034,
        REBAR,
      );
    }

    for (let k = 0; k < 6; k++) {
      const size = 0.1 + random() * 0.1;

      put(
        dress,
        "rock",
        34.6 + (random() - 0.5) * 0.7,
        1.5 - size * 0.25,
        -0.7 + (random() - 0.5) * 0.7,
        [size * 1.2, size * 0.8, size],
        [random() * 0.5, random() * Math.PI * 2, random() * 0.5],
        pick(FRACTURE),
      );
    }

    // Deep beams under the ceiling: one the length of the first hall over its
    // column; one across it over the stump, broken between z -1.9 and 0.3
    // with bars bridging the gap and sagging.
    box(dress, 34.0, 3.05, -2.3, [7.1, 0.65, 0.5], CONCRETE[2]);
    box(dress, 34.6, 3.05, -3.1, [0.5, 0.65, 2.4], CONCRETE[2]);
    box(dress, 34.6, 3.05, 0.7, [0.5, 0.65, 0.8], CONCRETE[2]);

    for (const dx of [-0.15, 0.15]) {
      polyline(
        dress,
        [34.6 + dx, 3.25, -1.9],
        [
          [0, -0.3, 0.5],
          [0, -0.2, 0.5],
          [0, 0.1, 0.6],
          [0, 0.2, 0.5],
        ],
        0.034,
        REBAR_BARE,
      );
    }

    // The ceiling where it has come down: bare reinforcement, a fragment
    // sagging from its bars, and a girder pulled half out of its seat.
    bare(33.8, -3.4, 2.0, 1.3);
    bare(34.2, 5.4, 1.6, 1.2);
    box(
      dress,
      34.4,
      ceiling - 0.5,
      2.9,
      [1.7, 0.14, 1.3],
      CONCRETE[2],
      [0.1, 0.3, 0.2],
    );

    for (const [x, z] of [
      [33.6, 2.3],
      [35.2, 2.3],
      [33.6, 3.5],
      [35.2, 3.5],
    ] as const) {
      polyline(
        dress,
        [x, ceiling, z],
        [
          [0, -0.2, 0],
          [0.04, -0.2, 0.03],
        ],
        0.03,
        REBAR_BARE,
      );
    }

    between(
      dress,
      [31.0, ceiling - 0.1, -6.8],
      [31.9, ceiling - 1.7, -6.2],
      0.14,
      STEEL_DARK,
      0.28,
    );

    // Conduits: two pipes along the first hall's north wall on brackets (the
    // big one ends in a broken drop), a cable tray length half off its hangers.
    put(dress, "pipe", 33.6, 2.85, -7.0, [6.6, 0.2, 0.2], [0, 0, 0], PIPE);
    put(
      dress,
      "pipe",
      33.3,
      2.52,
      -7.05,
      [6.0, 0.12, 0.12],
      [0, 0, 0],
      PIPE_OLD,
    );

    for (const x of [31.0, 32.6, 34.2, 35.8]) {
      box(dress, x, 2.62, -7.1, [0.06, 0.34, 0.06], STEEL_DARK);
    }

    between(dress, [36.9, 2.85, -7.0], [37.2, 2.05, -6.95], 0.2, PIPE, 0.2);
    box(dress, 32.8, 2.2, -6.95, [2.2, 0.05, 0.34], STEEL_DARK, [0, 0, 0.12]);
    // A fallen slab lying flat in the south corner.
    put(
      debris,
      "slab",
      33.0,
      0.17,
      4.7,
      [2.2, 0.32, 1.4],
      [0, 0.12, 0],
      CONCRETE[3],
    );
    solid(debrisBoxes, 31.9, 34.1, 4.0, 5.4, 0.34);

    // Rubble piles under the other damage, each with its solid box.
    for (const [px, pz, count] of [[35.0, 4.9, 4]] as const) {
      for (let k = 0; k < count; k++) {
        const size = k < 2 ? 0.34 + random() * 0.2 : 0.16 + random() * 0.2;
        const ang = random() * Math.PI * 2;
        const r = k < 2 ? random() * 0.15 : 0.1 + random() * 0.4;

        put(
          debris,
          k % 4 === 3 ? "slab" : "rock",
          px + Math.cos(ang) * r,
          0.1 + k * 0.09,
          pz + Math.sin(ang) * r,
          [size * 1.25, size * 0.7, size],
          [random() * 0.4, random() * Math.PI * 2, random() * 0.4],
          pick(CONCRETE),
        );
      }

      solid(debrisBoxes, px - 0.25, px + 0.25, pz - 0.25, pz + 0.25, 0.28);
    }

    // Fractured concrete spilled at the openings and under the damage, kept
    // off the way through.
    const spills = [
      [30.3, 31.6, -4.5, -2.6],
      [30.3, 31.4, 0.3, 1.1],
      [35.0, 36.0, -1.8, -0.3],
      [30.4, 31.6, 4.6, 5.5],
    ] as const;

    for (let k = 0; k < 14; k++) {
      const [x0, x1, z0, z1] = spills[k % spills.length];

      layOn(
        debris,
        "rock",
        x0 + random() * (x1 - x0),
        z0 + random() * (z1 - z0),
        [0.14 + random() * 0.28, 0.16, 0.14 + random() * 0.22],
        [random() * 0.5, random() * Math.PI * 2, random() * 0.5],
        pick(CONCRETE),
      );
    }

    // Damp patches on the floor under the leaks and the collapse.
    [
      [33.5, -2.0, 3.0, 2.4],
      [32.5, 4.2, 2.8, 2.2],
    ].forEach(([x, z, w, d], i) => {
      map.addDecal({
        id: `decal-room-chamber-damp-e${i}`,
        kind: "stain",
        x,
        z,
        y: 0,
        width: w,
        depth: d,
        rotation: i * 0.9,
        color: 0x040201,
        alpha: 0.38,
      });
    });
  }

  // ------------------------------------------------- detailing: wear and damage
  // Restrained: a few damaged pillars among intact ones, hairline cracks on the
  // floor and ceiling, floor joints, dust along the walls, one hanging conduit.
  // Nothing here is on the central route, and nothing but the chips' fallen
  // lumps (low, off to the sides) is a solid.
  {
    // A chipped pillar corner: pale fractured lumps proud of the edge up the
    // corner, two bars bent out of it, and chips fallen at its foot.
    const chip = (
      cx: number,
      cz: number,
      sx: number,
      sz: number,
      y0: number,
      y1: number,
    ): void => {
      const x = cx + sx * 0.45;
      const z = cz + sz * 0.45;

      for (let k = 0; k < 6; k++) {
        const size = 0.07 + random() * 0.08;

        put(
          dress,
          "rock",
          x - sx * size * 0.2,
          y0 + ((y1 - y0) * k) / 5 + (random() - 0.5) * 0.06,
          z - sz * size * 0.2,
          [size * 1.2, size, size * 1.2],
          [random() * 0.5, random() * Math.PI * 2, random() * 0.5],
          pick(FRACTURE),
        );
      }

      for (const y of [(y0 + y1) / 2, (y0 + y1) / 2 + 0.22]) {
        polyline(
          dress,
          [x - sx * 0.05, y, z - sz * 0.05],
          [
            [sx * 0.12, -0.03, sz * 0.12],
            [sx * 0.1, -0.1, sz * 0.1],
          ],
          0.03,
          random() < 0.5 ? REBAR : REBAR_BARE,
        );
      }

      for (let k = 0; k < 3; k++) {
        layOn(
          debris,
          "rock",
          x + sx * (0.2 + random() * 0.35),
          z + sz * (0.2 + random() * 0.35),
          [0.1 + random() * 0.12, 0.08, 0.1 + random() * 0.1],
          [random() * 0.5, random() * Math.PI * 2, random() * 0.5],
          pick(FRACTURE),
        );
      }
    };

    // Three damaged pillars (one chipped on two corners), the rest left
    // intact or only worn.
    chip(COL_W, COL_Z[1], -1, 1, 1.5, 2.3);

    // Dust and dirt in patches along the walls and in the corners.
    [
      [19.6, -6.7, 2.8, 1.5],
      [36.4, -6.3, 2.6, 1.3],
      [36.5, 5.0, 2.4, 1.6],
      [21.2, 5.0, 2.2, 1.6],
      [28.4, -6.8, 3.0, 1.1],
    ].forEach(([x, z, w, d], i) => {
      map.addDecal({
        id: `decal-room-chamber-dust-${i}`,
        kind: "stain",
        x,
        z,
        y: 0,
        width: w,
        depth: d,
        rotation: i * 1.3,
        color: 0x0b0604,
        alpha: 0.22,
      });
    });

    // One disconnected conduit: clamped to the ceiling along x, its last
    // length hanging free from the final clamp, cable ends hanging out of it.
    for (const x of [27.6, 29.0, 30.4]) {
      box(dress, x, ceiling - 0.2, -4.2, [0.08, 0.06, 0.1], STEEL_DARK);
      box(dress, x, ceiling - 0.06, -4.2, [0.1, 0.06, 0.12], STEEL_DARK);
    }

    put(
      dress,
      "pipe",
      29.0,
      ceiling - 0.28,
      -4.2,
      [3.6, 0.1, 0.1],
      [0, 0, 0],
      PIPE_OLD,
    );
    between(
      dress,
      [30.8, ceiling - 0.28, -4.2],
      [31.2, ceiling - 0.95, -4.15],
      0.1,
      PIPE_OLD,
    );

    for (const dz of [-0.03, 0.03]) {
      polyline(
        dress,
        [31.2, ceiling - 0.95, -4.15 + dz],
        [
          [0.02, -0.15, dz],
          [0.05, -0.12, dz * 2],
        ],
        0.015,
        CABLE,
      );
    }

    // More wall damage on the perimeter: two on the north wall, one on the east.
    spall("N", -7.2, 30.4, 1.5, 0.9, 1.2);
    spall("N", -7.2, 35.0, 1.2, 0.7, 1.0);
    spall("E", XE, -0.9, 1.3, 0.9, 1.2);
  }

  // ------------------------------------------------- the weakened sections
  WEAK.forEach((w, i) => {
    const z0 = w.z - w.half;
    const z1 = w.z + w.half;
    const faceIn = 18 + PANEL;

    // Reinforcement in the recess: verticals (some cut, some bent out into the
    // hall) and horizontals, in front of the panel face.
    const planeV = faceIn + 0.02;
    const planeH = faceIn + 0.055;
    const tone = (): number => (random() < 0.4 ? REBAR_BARE : REBAR);

    for (let z = z0 + 0.2; z < z1 - 0.1; z += 0.28) {
      const bottom = random() < 0.35 ? 0.35 + random() * 0.6 : 0.12;
      const top =
        random() < 0.45 ? ceiling - 0.4 - random() * 1.1 : ceiling - 0.08;

      between(dress, [planeV, bottom, z], [planeV, top, z], 0.035, tone());
    }

    for (let y = 0.6; y < ceiling - 0.3; y += 0.62) {
      if (random() < 0.8) {
        between(
          dress,
          [planeH, y + (random() - 0.5) * 0.06, z0 + 0.1 + random() * 0.5],
          [planeH, y, z1 - 0.1 - random() * 0.9],
          0.03,
          REBAR,
        );
      }
    }

    // The arena face: a spalled patch low down with bars poking out of it.
    const pz = w.z + (i % 2 ? -0.5 : 0.45);

    for (let k = 0; k < 8; k++) {
      const size = 0.07 + random() * 0.09;

      put(
        dress,
        "rock",
        17.98,
        0.75 + random() * 0.5,
        pz + (random() - 0.5) * 0.6,
        [size * 0.5, size, size],
        [random() * 0.5, random() * Math.PI * 2, random() * 0.5],
        pick(FRACTURE),
      );
    }

    for (let k = 0; k < 4; k++) {
      between(
        dress,
        [18.05, 0.85 + random() * 0.4, pz - 0.2 + k * 0.13],
        [
          17.84 - random() * 0.14,
          0.8 + random() * 0.35,
          pz - 0.2 + k * 0.13 + (random() - 0.5) * 0.1,
        ],
        0.035,
        tone(),
      );
    }

    // Steel round it: a column each side, a band across the recess bolted to
    // the stub walls and sagging at one end, a brace propped under it.
    for (const side of [-1, 1]) {
      map.createSteelColumn(
        `room-ruins-chamber-column-${i + 1}${side < 0 ? "a" : "b"}`,
        XW + 0.15,
        w.z + side * (w.half + 0.3),
        0,
        ceiling,
        0.3,
        "z",
      );
    }

    between(
      dress,
      [XW + 0.15, 1.35 + (i === 1 ? 0.08 : 0), z0 - 0.1],
      [XW + 0.15, 1.2 - (i === 1 ? 0.08 : 0), z1 + 0.1],
      0.12,
      STEEL_DARK,
      0.04,
    );

    const lean = i % 2 ? -1 : 1;

    between(
      dress,
      [XW + 0.55, 0.05, w.z + lean * 0.5],
      [XW + 0.03, 2.3, w.z + lean * 0.35],
      0.14,
      STEEL,
      0.14,
    );
    box(dress, XW + 0.55, 0, w.z + lean * 0.5, [0.4, 0.03, 0.4], STEEL_DARK);

    // What fell out of the recess, in front of it.
    for (let n = 0; n < 9; n++) {
      const size = 0.08 + Math.pow(random(), 1.6) * 0.34;

      layOn(
        debris,
        random() < 0.2 ? "slab" : "rock",
        faceIn + size * 0.5 + Math.pow(random(), 1.4) * 1.4,
        w.z + (random() - 0.5) * (w.half * 2 + 0.4),
        [size * 1.2, size * 0.7, size],
        [random() * 0.3, random() * Math.PI * 2, random() * 0.3],
        pick(CONCRETE),
      );
    }

    for (let n = 0; n < 3; n++) {
      put(
        debris,
        "brick",
        faceIn + 0.2 + random() * 0.9,
        0.035,
        w.z + (random() - 0.5) * 2.2,
        [0.17, 0.06, 0.09],
        [0, random() * Math.PI, 0],
        pick(BRICK),
      );
    }
  });

  // --------------------------------------------- the far end: the enclosure
  // A secured equipment enclosure: a steel cage round a transformer, its gate
  // standing open and sagging on one hinge, hazard-striped at the foot, a
  // warning plate over it and a control station by the way in.
  {
    const x0 = 22.0;
    const x1 = 26.0;
    const zF = 9.7;
    const zB = 11.55;
    const top = 2.6;

    // The transformer inside it: tank, cooling fins, bushings, a window.
    box(machines, 24.0, 0.15, 10.75, [2.7, 1.9, 1.05], 0x4a5360);
    box(machines, 24.0, 0, 10.75, [2.9, 0.15, 1.2], STEEL_DARK);

    for (let k = 0; k < 9; k++) {
      box(machines, 22.55 + k * 0.1, 0.4, 10.75, [0.03, 1.4, 1.2], 0x3b424d);
      box(machines, 25.45 - k * 0.1, 0.4, 10.75, [0.03, 1.4, 1.2], 0x3b424d);
    }

    for (const bx of [23.2, 24.0, 24.8]) {
      put(
        machines,
        "pipe",
        bx,
        2.25,
        10.75,
        [0.55, 0.2, 0.2],
        [0, 0, Math.PI / 2],
        0x6a5a48,
      );
      box(machines, bx, 2.0, 10.75, [0.34, 0.06, 0.34], STEEL_DARK);
    }

    box(machines, 24.0, 0.9, 10.2, [1.4, 0.7, 0.04], 0x1b1f24);
    box(machines, 24.0, 1.62, 10.205, [1.4, 0.04, 0.04], HAZARD);

    for (const [px, color] of [
      [23.5, 0x3aa86a],
      [23.7, 0x3aa86a],
      [23.9, 0x2a2d32],
      [24.1, 0xb87a2a],
      [24.3, 0x2a2d32],
      [24.5, 0x7a2a22],
    ] as const) {
      box(machines, px, 1.28, 10.19, [0.1, 0.1, 0.03], color);
    }

    // The framing: four box-section posts on bolted base plates, a top frame
    // with gusset plates at the corners, a mid rail, and expanded-metal mesh
    // (flat bars in a grid) filling the sides and the back; the front has the
    // gate opening.
    const post = 0.16;
    const rails = [0.45, 1.25, top - 0.1];

    for (const px of [x0, x1]) {
      for (const pz of [zF, zB]) {
        box(machines, px, 0.03, pz, [post, top - 0.03, post], STEEL_DARK);
        box(machines, px, 0, pz, [0.34, 0.03, 0.34], STEEL_DARK);

        for (const [bx, bz] of [
          [-0.12, -0.12],
          [0.12, -0.12],
          [-0.12, 0.12],
          [0.12, 0.12],
        ] as const) {
          box(
            machines,
            px + bx - 0.02,
            0.03,
            pz + bz - 0.02,
            [0.04, 0.03, 0.04],
            STEEL,
          );
        }

        // Gusset under the top frame.
        between(
          machines,
          [px + (px === x0 ? 0.08 : -0.08), top - 0.4, pz],
          [px + (px === x0 ? 0.32 : -0.32), top - 0.1, pz],
          0.05,
          STEEL_DARK,
        );
      }
    }

    for (const ry of rails) {
      box(machines, 24.0, ry, zF, [x1 - x0, 0.07, 0.07], STEEL_DARK);
      box(machines, 24.0, ry, zB, [x1 - x0, 0.07, 0.07], STEEL_DARK);

      for (const px of [x0, x1]) {
        box(machines, px, ry, (zF + zB) / 2, [0.07, 0.07, zB - zF], STEEL_DARK);
      }
    }

    // Mesh: vertical and horizontal flats, every 0.4 m up and across.
    for (let by = 0.8; by < top - 0.2; by += 0.4) {
      box(machines, 24.0, by, zB, [x1 - x0, 0.022, 0.022], STEEL);

      for (const px of [x0, x1]) {
        box(machines, px, by, (zF + zB) / 2, [0.022, 0.022, zB - zF], STEEL);
      }

      if (by < top - 0.8) {
        for (const bx of [x0 + 0.1, x1 - 0.1]) {
          box(machines, bx, by, zF, [0.8, 0.022, 0.022], STEEL);
        }
      }
    }

    for (let bx = x0 + 0.4; bx < x1 - 0.2; bx += 0.4) {
      box(machines, bx, 0.45, zB, [0.025, top - 0.55, 0.025], STEEL);
    }

    for (let bz = zF + 0.4; bz < zB - 0.2; bz += 0.4) {
      for (const px of [x0, x1]) {
        box(machines, px, 0.45, bz, [0.025, top - 0.55, 0.025], STEEL);
      }
    }

    // Front: stiles beside the gate opening (x 23.1 to 24.9), with the mesh
    // above it to the top rail.
    for (const bx of [
      x0 + 0.3,
      x0 + 0.7,
      x0 + 1.1,
      x1 - 0.3,
      x1 - 0.7,
      x1 - 1.1,
    ]) {
      box(machines, bx, 0.45, zF, [0.025, top - 0.55, 0.025], STEEL);
    }

    box(machines, 24.0, 2.0, zF, [1.8, 0.07, 0.07], STEEL_DARK);

    // The gate: a framed leaf of mesh hinged at x 24.9, swung open and sagging
    // on its lower hinge, with a hasp and a hanging padlock.
    {
      const yaw = -1.0;
      const c = Math.cos(yaw);
      const sn = Math.sin(yaw);
      // (a point `lx` along the leaf from the hinge, `ly` up) in the world
      const leaf = (
        lx: number,
        ly: number,
        sx: number,
        sy: number,
        color: number,
      ): void => {
        put(
          machines,
          "plank",
          24.9 + lx * c,
          ly + sy / 2,
          zF - lx * sn,
          [sx, sy, 0.045],
          [0, yaw, 0.06],
          color,
        );
      };

      leaf(0.0, 0.1, 0.06, 1.95, STEEL_DARK);
      leaf(1.7, 0.14, 0.06, 1.9, STEEL_DARK);
      leaf(0.85, 0.1, 1.76, 0.06, STEEL_DARK);
      leaf(0.85, 1.0, 1.76, 0.05, STEEL_DARK);
      leaf(0.85, 2.0, 1.76, 0.06, STEEL_DARK);

      for (let k = 1; k < 4; k++) {
        leaf(0.0 + k * 0.42, 0.14, 0.022, 1.88, STEEL);
      }

      for (const gy of [0.5, 1.4]) {
        leaf(0.85, gy, 1.7, 0.022, STEEL);
      }

      // Hasp and padlock on the free stile.
      leaf(1.62, 1.0, 0.1, 0.16, 0x1a1c20);
      leaf(1.62, 0.84, 0.07, 0.12, 0x8a8068);
    }

    // Hazard stripe along the foot and a plate over the gate.
    for (let k = 0; k < 10; k++) {
      put(
        machines,
        "plank",
        22.3 + k * 0.4,
        0.007,
        9.3,
        [0.4, 0.012, 0.16],
        [0, 0.6, 0],
        k % 2 ? 0x16181b : HAZARD,
      );
    }

    box(machines, 24.0, 2.8, zF - 0.05, [1.2, 0.35, 0.03], 0x2a2c30);
    box(machines, 24.0, 2.86, zF - 0.075, [1.0, 0.04, 0.01], HAZARD);
    box(machines, 24.0, 2.97, zF - 0.075, [1.0, 0.04, 0.01], HAZARD);
    box(machines, 24.0, 3.1, zF, [0.03, 0.55, 0.03], STEEL_DARK);

    // The cage and what is in it are not a way through.
    solid(machineBoxes, x0 - 0.1, x1 + 0.1, zF - 0.1, 11.7, top);

    // The control station by the way in, on the west wall: a pedestal desk on a
    // plinth with a sloped panel (three screens, one smashed, a row of
    // switches, a red mushroom stop), and an instrument rack on the wall above
    // it; a conduit runs from the desk into the floor and another up the wall.
    box(machines, 21.28, 0, 7.5, [0.5, 0.1, 1.45], STEEL_DARK);
    box(machines, 21.28, 0.1, 7.5, [0.46, 0.7, 1.4], 0x40464e);
    // The sloped panel (tilted back toward the wall).
    put(
      machines,
      "plank",
      21.2,
      0.98,
      7.5,
      [0.5, 0.05, 1.42],
      [0, 0, 0.5],
      0x30363d,
    );

    for (const [dz, state] of [
      [-0.45, "dead"],
      [0.0, "smashed"],
      [0.45, "lit"],
    ] as const) {
      put(
        machines,
        "plank",
        21.17,
        1.07,
        7.5 + dz,
        [0.02, 0.26, 0.34],
        [0, 0, 0.5],
        state === "lit" ? 0x2f5a4a : 0x0d0f12,
      );

      if (state === "smashed") {
        between(
          machines,
          [21.14, 1.2, 7.5 + dz - 0.12],
          [21.13, 0.95, 7.5 + dz + 0.1],
          0.012,
          0x6a7078,
        );
        between(
          machines,
          [21.14, 1.0, 7.5 + dz - 0.1],
          [21.13, 1.15, 7.5 + dz + 0.13],
          0.012,
          0x6a7078,
        );
      }
    }

    for (let k = 0; k < 6; k++) {
      box(
        machines,
        21.1,
        0.86,
        7.0 + k * 0.1,
        [0.03, 0.05, 0.05],
        k === 2 ? 0xb87a2a : 0x2a2d32,
      );
    }

    put(
      machines,
      "pipe",
      21.06,
      0.9,
      8.1,
      [0.04, 0.1, 0.1],
      [0, Math.PI / 2, 0],
      0x9a2a22,
    );

    // The instrument rack above: a steel frame bolted to the wall (two uprights
    // and cross rails, 4 cm off it, on four wall plates), a back panel with
    // three dial gauges and a row of toggle switches, and a sheet-metal hood.
    // No loose door: it has come off and lies broken on the floor below.
    box(machines, 20.99, 1.4, 7.5, [0.06, 0.04, 1.3], STEEL_DARK);
    box(machines, 20.99, 2.15, 7.5, [0.06, 0.04, 1.3], STEEL_DARK);

    for (const gz of [-0.62, 0.62]) {
      box(machines, 20.99, 1.4, 7.5 + gz, [0.06, 0.79, 0.05], STEEL_DARK);
      box(
        machines,
        20.92,
        1.38,
        7.5 + gz - 0.05,
        [0.04, 0.1, 0.14],
        STEEL_DARK,
      );
      box(machines, 20.92, 2.1, 7.5 + gz - 0.05, [0.04, 0.1, 0.14], STEEL_DARK);
    }

    box(machines, 21.04, 1.44, 7.5, [0.04, 0.7, 1.2], 0x252a30);
    box(machines, 21.15, 2.15, 7.5, [0.26, 0.05, 1.3], 0x3a4048);

    for (const gz of [-0.4, 0.0, 0.4]) {
      put(
        machines,
        "pipe",
        21.08,
        1.95,
        7.5 + gz,
        [0.05, 0.22, 0.22],
        [0, Math.PI / 2, 0],
        0x8a8068,
      );
      put(
        machines,
        "pipe",
        21.11,
        1.95,
        7.5 + gz,
        [0.03, 0.15, 0.15],
        [0, Math.PI / 2, 0],
        0x15181c,
      );
    }

    for (let k = 0; k < 7; k++) {
      box(
        machines,
        21.08,
        1.6,
        7.0 + k * 0.17,
        [0.05, 0.05, 0.05],
        k % 3 ? 0x2a2d32 : 0xb87a2a,
      );
    }

    // The rack's door, torn off, lying on the floor against the desk.
    put(
      machines,
      "plank",
      21.7,
      0.025,
      8.5,
      [0.7, 0.04, 0.5],
      [0, 0.4, 0.0],
      0x30363d,
    );
    // Conduit from the desk into the floor, and up the wall from the rack.
    between(machines, [21.4, 0.1, 8.25], [21.4, 0.02, 8.5], 0.07, 0x2a2d33);
    between(machines, [20.95, 2.2, 6.95], [20.95, 3.5, 6.95], 0.08, 0x2a2d33);
    solid(machineBoxes, 20.9, 21.55, 6.8, 8.2, 1.2);
  }

  // ------------------------------------------------------ lamp fixtures
  // Red tube fixtures: old industrial fluorescent fittings converted to red
  // emergency light. Each is a sheet-steel channel (a top pan, two side
  // flanges and end plates, 0.4 m wide, 1.8 m long, 0.14 m deep) holding two
  // fat tubes (ChamberGlow draws the tubes and the frosted diffuser across the
  // open underside), with a painted reflector in the pan, tube holders at the
  // ends, and four flat hanger straps from the ceiling slab to the pan's ends,
  // bolted through plates on each side. Hung 0.55 m under the slab.
  for (const t of CHAMBER_TUBES) {
    const top = ceiling - 0.55;
    const long = TUBE_LENGTH + 0.2;

    box(dress, t.x, top, t.z, [0.42, 0.035, long], 0x2c3036);
    // The flanges, a lip turned in along each lower edge, and the end plates.
    for (const side of [-1, 1]) {
      box(
        dress,
        t.x + side * 0.2,
        top - 0.13,
        t.z,
        [0.025, 0.13, long],
        0x2c3036,
      );
      box(
        dress,
        t.x + side * 0.175,
        top - 0.13,
        t.z,
        [0.05, 0.02, long],
        0x2c3036,
      );
    }

    for (const end of [-1, 1]) {
      box(
        dress,
        t.x,
        top - 0.13,
        t.z + end * (long / 2 - 0.02),
        [0.42, 0.15, 0.04],
        0x25292e,
      );
      // The tube holder: a small block either end under each tube.
      for (const dx of [-0.075, 0.075]) {
        box(
          dress,
          t.x + dx,
          top - 0.11,
          t.z + end * (TUBE_LENGTH / 2 + 0.02),
          [0.06, 0.07, 0.05],
          0x15171a,
        );
      }
    }

    // The painted reflector in the pan, dull and dusty.
    box(dress, t.x, top - 0.012, t.z, [0.34, 0.008, long - 0.1], 0x4a3836);

    // Hanger straps: flat bar up to a plate on the slab, a clamp on the pan.
    for (const dz of [-0.65, 0.65]) {
      for (const side of [-1, 1]) {
        box(
          dress,
          t.x + side * 0.15,
          top + 0.035,
          t.z + dz,
          [0.03, ceiling - top - 0.035, 0.03],
          STEEL_DARK,
        );
        box(
          dress,
          t.x + side * 0.15,
          ceiling - 0.03,
          t.z + dz,
          [0.12, 0.03, 0.1],
          STEEL_DARK,
        );
        box(
          dress,
          t.x + side * 0.15,
          top - 0.005,
          t.z + dz,
          [0.08, 0.025, 0.07],
          STEEL_DARK,
        );
      }
    }
  }

  // The manifold the two pipes from the pit end in (they come through the wall
  // over the doorway at x 24.3 and 23.2): each runs on 0.6 m past the wall as a
  // flanged stub, drops through a short riser into one header pipe slung
  // across the doorway on two flat hanger straps bolted to the roof, with a
  // valve wheel, a pressure gauge and a junction box on its end. Above head
  // height; no box hung from the roof.
  {
    const hx = 23.75;
    const hz = -11.1;
    const hy = 3.05;
    const pipeBody = 0x59606a;

    // The stubs, with a flange where each leaves the wall.
    for (const [px, py] of [
      [24.3, 3.3],
      [23.2, 2.8],
    ] as const) {
      put(
        machines,
        "pipe",
        px,
        py,
        -11.4,
        [0.6, 0.26, 0.26],
        [0, Math.PI / 2, 0],
        pipeBody,
      );
      put(
        machines,
        "pipe",
        px,
        py,
        -11.69,
        [0.06, 0.4, 0.4],
        [0, Math.PI / 2, 0],
        STEEL_DARK,
      );
      // The riser into the header, with a collar.
      const lo = Math.min(py, hy);
      const hi = Math.max(py, hy);

      put(
        machines,
        "pipe",
        px,
        (lo + hi) / 2,
        hz,
        [hi - lo + 0.3, 0.24, 0.24],
        [0, 0, Math.PI / 2],
        pipeBody,
      );
      put(
        machines,
        "pipe",
        px,
        (lo + hi) / 2,
        hz,
        [0.1, 0.34, 0.34],
        [0, 0, Math.PI / 2],
        STEEL_DARK,
      );
    }

    // The header, with a flanged collar at each end and one in the middle.
    put(machines, "pipe", hx, hy, hz, [1.9, 0.4, 0.4], [0, 0, 0], pipeBody);

    for (const dx of [-0.95, -0.45, 0.0, 0.5, 0.95]) {
      put(
        machines,
        "pipe",
        hx + dx,
        hy,
        hz,
        [0.08, 0.5, 0.5],
        [0, 0, 0],
        STEEL_DARK,
      );
    }

    // Two flat hanger straps, bolted to the roof and clamped round the header.
    for (const dx of [-0.7, 0.7]) {
      box(
        machines,
        hx + dx - 0.025,
        hy + 0.2,
        hz - 0.1,
        [0.05, ceiling - hy - 0.2, 0.2],
        STEEL_DARK,
      );
      box(
        machines,
        hx + dx - 0.07,
        ceiling - 0.04,
        hz - 0.15,
        [0.14, 0.04, 0.3],
        STEEL_DARK,
      );
      box(
        machines,
        hx + dx - 0.07,
        hy - 0.24,
        hz - 0.1,
        [0.14, 0.04, 0.2],
        STEEL_DARK,
      );
    }

    // A valve on top (body, stem, wheel), a gauge on the front, a junction box.
    box(machines, hx + 0.25, hy + 0.2, hz - 0.1, [0.18, 0.22, 0.2], STEEL_DARK);
    box(
      machines,
      hx + 0.25 - 0.015,
      hy + 0.42,
      hz - 0.015,
      [0.03, 0.2, 0.03],
      STEEL_DARK,
    );
    put(
      machines,
      "pipe",
      hx + 0.25,
      hy + 0.64,
      hz,
      [0.03, 0.3, 0.3],
      [0, 0, Math.PI / 2],
      0x7a2a22,
    );
    put(
      machines,
      "pipe",
      hx - 0.2,
      hy,
      hz + 0.22,
      [0.06, 0.2, 0.2],
      [0, Math.PI / 2, 0],
      0x8a8068,
    );
    put(
      machines,
      "pipe",
      hx - 0.2,
      hy,
      hz + 0.19,
      [0.05, 0.1, 0.1],
      [0, Math.PI / 2, 0],
      STEEL_DARK,
    );
    box(machines, hx + 1.0, hy - 0.15, hz - 0.12, [0.24, 0.3, 0.2], 0x20252b);
    between(
      machines,
      [hx + 1.12, hy + 0.15, hz - 0.02],
      [hx + 1.12, ceiling - 0.05, hz - 0.02],
      0.08,
      0x2a2d33,
    );
  }

  // A ceiling fragment that has come away on one side and hangs by its
  // reinforcement from the cracked slab at x 20.2, z 4.2 (the rubble below it
  // is the drift at that spot): a plate tipped down, three bars out of the
  // slab holding it, its torn edge showing the bars' ends. Above head height.
  {
    const fx = 20.0;
    const fz = 4.0;

    put(
      dress,
      "slab",
      fx,
      ceiling - 0.5,
      fz,
      [0.9, 0.22, 0.75],
      [0.1, 0.4, 0.35],
      CONCRETE[0],
    );

    for (const dz of [-0.25, 0.0, 0.25]) {
      between(
        dress,
        [fx - 0.45, ceiling - 0.02, fz + dz],
        [fx - 0.2, ceiling - 0.4, fz + dz],
        0.04,
        REBAR,
      );
    }

    for (const dz of [-0.3, 0.1, 0.3]) {
      between(
        dress,
        [fx + 0.3, ceiling - 0.65, fz + dz],
        [fx + 0.45, ceiling - 0.85, fz + dz + 0.1],
        0.035,
        REBAR_BARE,
      );
    }
  }

  // ------------------------------------------------------ floor debris
  // Concrete and brick about the column feet and the walls' feet, thin along
  // the route; fuller where things fell (the south-east corner, the vent).
  const blocked = (x: number, z: number): boolean =>
    [...machineBoxes, ...debrisBoxes].some(
      (b) =>
        x > b.minX - 0.2 &&
        x < b.maxX + 0.2 &&
        z > b.minZ - 0.2 &&
        z < b.maxZ + 0.2,
    );

  // Debris comes from the damage: rubble lies in drifts under the wall spalls,
  // the broken column, the weak panels and the cracked slab, thinning with
  // distance from each; nothing is scattered over the whole floor.
  const SOURCES: Array<[number, number, number]> = [
    [18.8, -6.0, 1.0],
    [18.8, 0.35, 1.0],
    [18.8, -1.95, 0.8],
    [29.0, -0.6, 0.9],
    [29.0, 4.3, 0.8],
    [26.9, 2.5, 1.2],
    [23.0, -1.0, 1.4],
    [20.2, 4.2, 1.2],
    [25.3, 7.8, 1.1],
    [25.0, -8.2, 0.7],
    [21.8, -9.9, 0.7],
    [21.8, 9.0, 0.8],
  ];

  for (let n = 0; n < 190; n++) {
    const src = SOURCES[n % SOURCES.length];
    const spread = src[2] * (0.3 + Math.pow(random(), 0.7));
    const ang = random() * Math.PI * 2;
    const x = src[0] + Math.cos(ang) * spread;
    const z = src[1] + Math.sin(ang) * spread;

    if (x < XW + 0.2 || x > XE - 0.2 || z < -11 || z > 11.4) continue;

    // The way through the middle stays clear.
    if (x > 22.3 && x < 25.9 && z > -7 && z < 7 && random() < 0.85) continue;

    if (blocked(x, z)) continue;

    const roll = random();

    if (roll < 0.55) {
      const size = 0.06 + Math.pow(random(), 2) * 0.3;

      layOn(
        debris,
        "rock",
        x,
        z,
        [size * 1.2, size * 0.7, size],
        [random() * 0.4, random() * Math.PI * 2, random() * 0.4],
        pick(CONCRETE),
      );
    } else if (roll < 0.75) {
      put(
        debris,
        "brick",
        x,
        0.035,
        z,
        [random() < 0.4 ? 0.1 : 0.17, 0.06, 0.09],
        [0, random() * Math.PI, 0],
        pick(BRICK),
      );
    } else if (roll < 0.88) {
      put(
        debris,
        "plank",
        x,
        0.012,
        z,
        [0.22 + random() * 0.4, 0.022, 0.05 + random() * 0.18],
        [0, random() * Math.PI, 0],
        STEEL_DARK,
      );
    } else {
      put(
        debris,
        "plank",
        x,
        0.025,
        z,
        [0.4 + random() * 0.5, 0.045, 0.1 + random() * 0.06],
        [0, random() * Math.PI, 0],
        pick(WOOD),
      );
    }
  }

  // Rubble piles under the damage: a few big pieces settled together, the
  // smaller ones stacked on them (the grounding pass below rests each on what
  // is under it), with the pile's solid box a little inside its spread.
  for (const [px, pz, n] of [
    [26.2, -2.6, 7],
    [19.7, 4.2, 6],
    [28.6, 4.5, 5],
    [19.6, -6.3, 5],
    [25.2, 7.2, 5],
    [22.2, -9.8, 4],
  ] as const) {
    for (let k = 0; k < n; k++) {
      const size = k < 2 ? 0.34 + random() * 0.2 : 0.16 + random() * 0.2;
      const ang = random() * Math.PI * 2;
      const r = k < 2 ? random() * 0.15 : 0.1 + random() * 0.4;

      put(
        debris,
        k % 4 === 3 ? "slab" : "rock",
        px + Math.cos(ang) * r,
        0.1 + k * 0.09,
        pz + Math.sin(ang) * r,
        [size * 1.25, size * 0.7, size],
        [random() * 0.4, random() * Math.PI * 2, random() * 0.4],
        pick(CONCRETE),
      );
    }

    solid(debrisBoxes, px - 0.25, px + 0.25, pz - 0.25, pz + 0.25, 0.28);
  }

  // Short broken pipe sections and a fallen length of cable tray, lying on the
  // floor under the damage they came from (pipes rest on their own radius).
  for (const [px, pz, len, yaw] of [
    [28.6, -2.0, 0.9, 0.5],
    [19.7, 3.4, 0.7, -0.4],
    [24.9, 7.0, 0.6, 1.1],
  ] as const) {
    put(debris, "pipe", px, 0.07, pz, [len, 0.14, 0.14], [0, yaw, 0], PIPE);
    put(
      debris,
      "pipe",
      px + 0.05,
      0.07,
      pz + 0.02,
      [0.06, 0.2, 0.2],
      [0, yaw, 0],
      STEEL_DARK,
    );
  }

  box(debris, 20.3, 0, -4.9, [1.1, 0.07, 0.34], STEEL_DARK, [0, 0.35, 0]);
  box(debris, 20.3, 0.07, -4.9, [1.1, 0.06, 0.03], STEEL_DARK, [0, 0.35, 0]);

  // Bent reinforcement lying on the floor, grounded: bars run out of the
  // fallen beam's two pieces, each lying on the floor (a short bent end rising
  // onto the concrete it came out of).
  for (const [bx, bz, dir] of [
    [COL_E - 0.35, -3.35, -1],
    [COL_E - 0.8, -1.5, 1],
  ] as const) {
    for (let k = 0; k < 4; k++) {
      const x0 = bx - 0.2 + k * 0.13;

      polyline(
        debris,
        [x0, 0.2, bz],
        [
          [0, -0.12, dir * 0.12],
          [(random() - 0.5) * 0.15, -0.06, dir * (0.3 + random() * 0.3)],
          [(random() - 0.5) * 0.3, 0, dir * (0.3 + random() * 0.3)],
        ],
        0.034,
        random() < 0.5 ? REBAR : REBAR_BARE,
      );
    }
  }

  // Damp concrete: dark water-stained patches round the columns' feet, under
  // each leak, along the foot of the walls where the water runs, and under the
  // cracked slab.
  (
    [
      [COL_W, COL_Z[0], 2.4, 2.4],
      [COL_W, COL_Z[1], 2.6, 2.4],
      [COL_E, COL_EAST_Z, 2.2, 2.2],
      [24.25, -10.6, 2.6, 2.0],
      [29.0, -0.7, 2.0, 1.6],
      [22.0, 4.6, 3.2, 2.6],
      [26.5, 7.5, 2.4, 2.0],
      [18.9, -2.5, 1.6, 4.0],
      [25.0, -6.0, 3.0, 1.8],
      [21.5, 0.5, 3.0, 2.0],
    ] as const
  ).forEach(([x, z, w, d], i) => {
    map.addDecal({
      id: `decal-room-chamber-damp-${i}`,
      kind: "stain",
      x,
      z,
      y: 0,
      width: w,
      depth: d,
      rotation: i * 0.7,
      color: 0x040201,
      alpha: 0.46,
    });
  });

  // Water trails on the walls and piers under each leak: a thin dark run from
  // the pipe to the floor, widening at the foot.
  for (const [x, z, , top] of [[19.2, 2.7, "W", 3.0]] as const) {
    const sign = 1;

    put(
      dress,
      "plank",
      x + sign * 0.008,
      top / 2,
      z,
      [0.006, top, 0.1],
      [0, 0, 0],
      0x2b2622,
    );
    put(
      dress,
      "plank",
      x + sign * 0.008,
      0.2,
      z,
      [0.006, 0.4, 0.28],
      [0, 0, 0],
      0x2b2622,
    );
  }

  // Water on the floor under the leaking pipe, and by the enclosure.
  for (const [x, z, w, d, rot, alpha] of [
    [24.0, 2.6, 2.2, 1.7, 0.4, 0.5],
    [28.8, -3.9, 1.4, 1.0, 0.2, 0.35],
    [21.3, 8.7, 1.8, 1.2, 0.8, 0.4],
  ] as const) {
    map.addDecal({
      id: `decal-room-chamber-water-${x}`,
      kind: "stain",
      x,
      z,
      y: 0,
      width: w,
      depth: d,
      rotation: rot,
      color: 0x0f1316,
      alpha,
    });
  }

  // ----------------------------------------------------------------- build
  const asRoles = <B extends object>(
    list: B[],
  ): Array<B & { role: PartRole }> =>
    list.map((b) => ({ ...b, role: "floor" as const }));

  map.createFitting("fittings-ruins-chamber-dress", 0, dress, dressBoxes);
  map.createFitting(
    "fittings-ruins-chamber-machines",
    0,
    machines,
    machineBoxes,
  );

  const pile = map.createFitting(
    "fittings-ruins-chamber-debris",
    0,
    debris,
    asRoles(debrisBoxes),
  );

  // Every loose piece on the floor rests on what is really under it (done
  // after the fitting is made, which lifts pieces by their boxes).
  groundPieces(pile.elements);
}

/** A piece laid on the floor by its own lowest point, a hair sunk in. */
function layOn(
  list: PileElement[],
  shape: PileElement["shape"],
  x: number,
  z: number,
  size: V3,
  turn: V3,
  color: number,
): void {
  const e: PileElement = {
    shape,
    x,
    y: 0,
    z,
    sx: size[0],
    sy: size[1],
    sz: size[2],
    rx: turn[0],
    ry: turn[1],
    rz: turn[2],
    color,
  };
  const extent = meshExtent(e);

  e.y = -(extent ? extent.low : size[1] / 2) - 0.012;
  list.push(e);
}
