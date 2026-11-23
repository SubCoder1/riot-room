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
  { id: "room-ruins-chamber", minX: 18, maxX: 30, minZ: -7.5, maxZ: 6 },
  { id: "chamber-far", minX: 20.6, maxX: 27.4, minZ: 6, maxZ: 12 },
];

const H = 3.7;
/** The doorway in the pit wall (x span). */
const DOOR = { from: 22.5, to: 24.9 } as const;
/** The hall's inner faces. */
const XW = 18.3;
const XE = 29.7;
/** The structural columns: west line, east line, and the z of each pair. */
const COL_W = 20.6;
const COL_E = 26.9;
const COL_Z = [-6.0, 1.0] as const;

/** The two weakened sections of the arena wall (z centres, half widths). */
const WEAK = [
  { z: -3.8, half: 1.3 },
  { z: 3.0, half: 1.3 },
] as const;

/** The prefix of the weak sections' ids (and each carries `weak: true`). */
export const WEAK_WALL_PREFIX = "room-ruins-chamber-wall-weak";

/** The vent high in the arena wall, between the weak sections. */
const VENT = { z: -0.4, y: 2.75, w: 1.5, h: 1.1 } as const;

/** What a later feature needs to find about the chamber. */
export const RUINS_CHAMBER = {
  id: "room-ruins-chamber",
  bounds: { minX: 18, maxX: 30, minZ: -12, maxZ: 12 },
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
const STAIN = 0x15171a;
const WATER = 0x1a2430;
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
  wall("wall-e", XE, 30, -7.5, 6);
  // The far end narrows: shoulders, then its sides and its end wall.
  wall("wall-sw", XW, 20.9, 5.7, 6);
  wall("wall-se", 27.1, XE, 5.7, 6);
  wall("wall-f-w", 20.6, 20.9, 6, 12);
  wall("wall-f-e", 27.1, 27.4, 6, 12);
  wall("wall-f-s", 20.6, 27.4, 11.7, 12);

  // Wall pilasters (the recessed bays between them): the east wall, and two on the west.
  for (const z of [-6.3, -2.2, 5.0]) {
    wall(`pilaster-e-${z}`, 29.2, XE, z - 0.35, z + 0.35);
  }

  for (const z of [-6.3, 5.1]) {
    wall(`pilaster-w-${z}`, XW, 18.8, z - 0.35, z + 0.35);
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
  const column = (name: string, x: number, z: number, height: number): void =>
    wall(name, x - 0.45, x + 0.45, z - 0.45, z + 0.45, [], height);

  for (const z of COL_Z) {
    column(`column-w-${z}`, COL_W, z, ceiling);
  }

  column("column-e-a", COL_E, COL_Z[0], ceiling);
  column("column-e-stump", COL_E, COL_Z[1], 1.3);

  for (const x of [COL_W, COL_E]) {
    for (const z of COL_Z) {
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
    [COL_E, COL_Z[0], "W"],
  ] as const) {
    const px = x + (face === "E" ? 0.456 : -0.456);

    put(
      dress,
      "plank",
      px,
      1.35,
      z + 0.1,
      [0.012, 1.0, 0.5],
      [0, 0, 0],
      0x101114,
    );

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

  between(
    dress,
    [26.0, ceiling - 0.22, COL_Z[1]],
    [29.55, 2.65, COL_Z[1]],
    0.45,
    CONCRETE[3],
    0.55,
  );
  box(dress, 29.5, 2.2, COL_Z[1], [0.45, 0.05, 0.6], STEEL_DARK);

  // Spalls on the ceiling's soffit with bars hanging: the slab is cracked.
  for (const [x, z, w, d] of [
    [23.0, -1.0, 1.7, 1.2],
    [20.2, 4.2, 1.2, 1.0],
    [25.3, 7.8, 1.3, 1.0],
  ] as const) {
    put(
      dress,
      "plank",
      x,
      ceiling - 0.004,
      z,
      [w, 0.01, d],
      [0, random() * 0.6, 0],
      STAIN,
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
    const [px, py, pz] = at(0.02, y);

    put(
      dress,
      "plank",
      px,
      py,
      pz,
      along ? [0.012, h, w] : [w, h, 0.012],
      [0, 0, (random() - 0.5) * 0.15],
      0x101114,
    );

    let heading = (random() - 0.5) * 0.8;
    let cu = u;
    let cy = y + h / 2;

    for (let k = 0; k < 5; k++) {
      const length = 0.3 + random() * 0.3;
      const du = Math.sin(heading) * length;
      const dy = Math.cos(heading) * length;
      const a = at(0.026, cy);
      const b = at(0.026, cy + dy);

      if (along) {
        a[2] = cu;
        b[2] = cu + du;
      } else {
        a[0] = cu;
        b[0] = cu + du;
      }

      between(dress, a, b, 0.028, 0x0b0c0e, 0.012);
      cu += du;
      cy += dy;
      heading += (random() - 0.5) * 1.0;
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

  spall("E", XE, -0.6, 1.3, 0.9, 1.2);
  spall("E", XE, 4.3, 1.0, 0.6, 1.1);
  spall("W", XW, -1.95, 1.4, 0.5, 1.2);
  spall("W", XW, 1.0, 1.3, 0.7, 1.1);
  spall("N", -7.2, 27.2, 1.4, 1.0, 1.4);
  spall("E", 25.3, -8.2, 1.6, 0.7, 1.0);
  spall("W", 21.7, -9.9, 1.2, 0.7, 0.9);
  spall("S", 11.7, 21.25, 1.2, 0.6, 1.1);
  spall("E", 27.1, 9.0, 1.4, 0.8, 1.2);

  // Water stains: long dark runs from the ceiling joints down the walls.
  for (const [face, plane, u, len, w] of [
    ["E", XE, -1.3, 2.3, 0.45],
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

    plate(0, vy, 0.008, [w, h, 0.012], [0, 0, 0], 0x07080a);
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

    put(dress, "plank", 17.99, vy, vz, [0.012, h, w], [0, 0, 0], 0x07080a);

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
  // Switchgear in the north bay: three cabinets, one door hanging open, the
  // wiring spilling out of the bottom.
  {
    const x = 29.15;

    for (let k = 0; k < 3; k++) {
      const z = -5.35 + k * 1.1;

      box(machines, x + 0.275, 0, z, [0.55, 2.0, 1.0], CABINET);
      box(machines, x + 0.275, 2.0, z, [0.6, 0.05, 1.05], STEEL_DARK);
      // The front: louvres, a label plate, indicator lights (two dead).
      box(machines, x - 0.005, 1.55, z, [0.02, 0.3, 0.7], 0x20252b);

      for (let s = 0; s < 4; s++) {
        box(
          machines,
          x - 0.005,
          0.25 + s * 0.08,
          z,
          [0.02, 0.03, 0.7],
          0x1a1e23,
        );
      }

      box(
        machines,
        x - 0.012,
        1.15,
        z - 0.28,
        [0.02, 0.08, 0.08],
        k === 1 ? 0x2a2018 : 0xb87a2a,
      );
      box(machines, x - 0.012, 1.15, z, [0.02, 0.08, 0.08], 0x2a2018);
      box(
        machines,
        x - 0.012,
        1.15,
        z + 0.28,
        [0.02, 0.08, 0.08],
        k === 2 ? 0x7a2a22 : 0x2a2018,
      );
      box(machines, x - 0.012, 0.85, z, [0.02, 0.18, 0.36], 0x8a8068);
    }

    // The middle cabinet's door, open on its north hinge (its edge on the
    // cabinet's, swung 0.8 rad into the hall).
    put(
      machines,
      "plank",
      x - 0.32,
      1.0,
      -4.75 - 0.31,
      [0.05, 1.8, 0.9],
      [0.0, 0.8, 0.0],
      STEEL_DARK,
    );

    // Wiring out of the foot of the third cabinet, on the floor.
    for (let k = 0; k < 5; k++) {
      between(
        machines,
        [x - 0.01, 0.3 - k * 0.03, -3.4 + k * 0.1],
        [x - 0.5 - k * 0.1, 0.02, -3.2 + k * 0.18],
        0.03,
        CABLE,
      );
    }

    solid(machineBoxes, x, XE, -5.9, -2.6, 2.0);
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
      box(dress, XE - 0.04, y + 0.2, z, [0.04, 0.5, 0.05], STEEL_DARK);
    }

    for (const z of [-0.45, -0.2, 0.05]) {
      between(
        dress,
        [x - 0.1, 2.2, z],
        [x - 0.14, 0.7 + random() * 0.4, z],
        0.03,
        CABLE,
      );
    }
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

  // ------------------------------------------------- the main across the hall
  // One thick main crossing the hall from wall to wall at 3 m on hangers,
  // under the beams: the pipe that leaks at its middle joint.
  put(dress, "pipe", 24.0, 3.0, 2.6, [11.4, 0.4, 0.4], [0, 0, 0], PIPE);

  for (let x = 19.4; x < 29.2; x += 2.7) {
    box(dress, x, 3.2, 2.6, [0.06, 0.5, 0.06], STEEL_DARK);
    box(dress, x, 2.88, 2.6, [0.12, 0.04, 0.6], STEEL_DARK);
  }

  box(dress, 24.0, 2.76, 2.6, [0.5, 0.48, 0.5], STEEL_DARK);
  put(dress, "plank", 24.0, 0.006, 2.6, [0.9, 0.01, 0.7], [0, 0.4, 0], WATER);

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

    // Its door, open on the south hinge (an edge on the board's, 0.9 rad out).
    put(
      machines,
      "plank",
      x - 0.47,
      0.9 + 0.8,
      -9.3 + 0.37,
      [0.04, 1.6, 0.9],
      [0, -0.9, 0],
      STEEL_DARK,
    );

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
    const fx = 28.4;
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

    // Cracks on both faces: chains of straight stretches that kink.
    for (const [xFace, sign] of [
      [faceIn + 0.007, 1],
      [18 - 0.007, -1],
    ] as const) {
      for (let c = 0; c < 2; c++) {
        let z = z0 + 0.5 + random() * (w.half * 2 - 1);
        let y = ceiling - 0.12;
        let heading = (random() < 0.5 ? -1 : 1) * (0.1 + random() * 0.3);

        for (let k = 0; k < 6 + c; k++) {
          const length = 0.32 + random() * 0.3;
          const dz = Math.sin(heading) * length;
          const dy = -Math.cos(heading) * length;

          if (y + dy < 0.15) break;

          between(
            dress,
            [xFace + sign * 0.002, y, z],
            [xFace + sign * 0.002, y + dy, z + dz],
            0.03 - k * 0.002,
            0x0b0c0e,
            0.014,
          );
          z += dz;
          y += dy;
          heading += (random() - 0.5) * 1.0;
        }
      }
    }

    // The arena face: a spalled patch low down with bars poking out of it.
    const pz = w.z + (i % 2 ? -0.5 : 0.45);

    put(
      dress,
      "plank",
      17.994,
      1.0,
      pz,
      [0.012, 0.7, 0.55],
      [0, 0, 0],
      0x101114,
    );

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

    // The cage: posts, top and middle rails, bars between (the gate's bars missing).
    for (const px of [x0, x1]) {
      for (const pz of [zF, zB]) {
        box(machines, px, 0, pz, [0.1, top, 0.1], STEEL_DARK);
      }
    }

    for (const pz of [zF, zB]) {
      box(machines, 24.0, top - 0.05, pz, [x1 - x0, 0.06, 0.06], STEEL_DARK);
      box(machines, 24.0, 1.2, pz, [x1 - x0, 0.04, 0.04], STEEL_DARK);
    }

    for (const px of [x0, x1]) {
      box(machines, px, top - 0.05, 10.62, [0.06, 0.06, zB - zF], STEEL_DARK);
    }

    for (let bx = x0 + 0.3; bx < x1 - 0.1; bx += 0.3) {
      if (bx > 23.1 && bx < 24.9) continue;

      box(machines, bx, 0.1, zF, [0.03, top - 0.2, 0.03], STEEL);
    }

    for (let bz = zF + 0.3; bz < zB - 0.1; bz += 0.3) {
      box(machines, x0, 0.1, bz, [0.03, top - 0.2, 0.03], STEEL);
      box(machines, x1, 0.1, bz, [0.03, top - 0.2, 0.03], STEEL);
    }

    // The gate, hinged at x 24.9, open and sagging.
    for (const [gx, gy, gsx, gsy] of [
      [0.0, 0.1, 0.05, 2.35],
      [0.9, 0.12, 0.05, 2.25],
      [0.45, 0.1, 0.9, 0.05],
      [0.45, 1.2, 0.9, 0.05],
      [0.45, 2.35, 0.9, 0.05],
    ] as const) {
      put(
        machines,
        "plank",
        24.9 + 0.05 + gx * 0.55,
        gy + gsy / 2,
        zF + 0.1 + gx * 0.83,
        [gsx, gsy, 0.05],
        [0, -0.98, 0.08],
        STEEL_DARK,
      );
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

    // The control station by the way in, on the west wall: a desk-high console
    // with a smashed screen and a rack above it.
    box(machines, 21.2, 0, 7.5, [0.6, 0.85, 1.4], 0x40464e);
    put(
      machines,
      "plank",
      21.12,
      1.1,
      7.5,
      [0.05, 0.6, 1.2],
      [0, 0, -0.5],
      0x20252b,
    );
    box(machines, 21.15, 1.0, 7.5, [0.02, 0.3, 0.9], 0x101114);

    for (let k = 0; k < 5; k++) {
      box(
        machines,
        21.0,
        0.9,
        6.95 + k * 0.28,
        [0.02, 0.04, 0.06],
        k === 2 ? 0xb87a2a : 0x2a2d32,
      );
    }

    box(machines, 21.1, 1.8, 7.5, [0.25, 0.7, 1.3], 0x30363d);
    between(machines, [21.5, 0.8, 8.15], [21.9, 0.02, 8.6], 0.03, CABLE);
    solid(machineBoxes, 20.9, 21.55, 6.8, 8.2, 1.2);
  }

  // ------------------------------------------------------ lamp fixtures
  // The central fixture: an old double fluorescent housing on two chains, one
  // chain gone so it hangs crooked.
  {
    const x = 22.4;
    const z = 0.3;

    put(
      dress,
      "plank",
      x,
      ceiling - 0.62,
      z,
      [2.4, 0.1, 0.36],
      [0, 0, 0.1],
      0x3a3c40,
    );
    between(
      dress,
      [x - 1.15, ceiling - 0.5, z],
      [x - 1.17, ceiling - 0.02, z],
      0.025,
      CABLE,
    );
  }

  // The far end's strip light: a steel housing flush to the ceiling over the
  // way up to the enclosure.
  box(dress, 24.0, ceiling - 0.12, 8.6, [1.8, 0.1, 0.26], 0x3a3c40);

  // The vestibule's emergency lamp: a round bulkhead lamp, a steel base plate
  // on the ceiling and a wire guard (six bars between two rings) round the
  // bulb, which the glow draws.
  {
    const lx = 23.7;
    const lz = -9.6;

    put(
      dress,
      "pipe",
      lx,
      ceiling - 0.03,
      lz,
      [0.06, 0.34, 0.34],
      [0, 0, Math.PI / 2],
      0x3a3c40,
    );
    put(
      dress,
      "pipe",
      lx,
      ceiling - 0.4,
      lz,
      [0.025, 0.28, 0.28],
      [0, 0, Math.PI / 2],
      STEEL_DARK,
    );

    for (let k = 0; k < 6; k++) {
      const angle = (k / 6) * Math.PI * 2;

      box(
        dress,
        lx + Math.cos(angle) * 0.13,
        ceiling - 0.4,
        lz + Math.sin(angle) * 0.13,
        [0.02, 0.37, 0.02],
        STEEL_DARK,
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

  for (let n = 0; n < 60; n++) {
    const x = 18.7 + random() * 10.6;
    const z = -7.0 + random() * 12.4;
    const nearWall = x < 20.4 || x > 28.2 || z > 4.6;
    const onRoute = x > 22.2 && x < 26 && !nearWall;

    if (onRoute && random() < 0.8) continue;

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
