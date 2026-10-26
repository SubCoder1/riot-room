import * as THREE from "three";

import type { PileElement, TapeRun } from "./ArenaLayout";
import { Pieces, rng } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";

/**
 * The vault entrance: the Server room's doorway, on the loading dock. The
 * wall round it has broken and fallen across the way, and what is left of the
 * 4 m doorway is a dark, ragged hole almost entirely behind rubble. The GCPD
 * have been and gone: tape on temporary posts across the approach and two
 * tripod halogens trained on the collapse.
 *
 * Everything is placed from the doorway itself: its wall face, the way it
 * looks out (to the dock, toward -x), its centre and its size (all read from
 * the room's own definition by `entranceOf`), in a frame of (u along the wall,
 * dx out from it, y up from the floor). Nothing is an offset from anywhere
 * else.
 *
 * The pieces are rocks (cut by fracture planes, three variants), chipped
 * slabs and bricks, all merged into a few meshes with colour that varies
 * across each piece. The heap is built greedily, dropping pieces where it can
 * hold them until the doorway is hidden to the degree asked for, so the
 * picture and `collapseCoverage` agree. One solid box stands over the heap and
 * the doorway, so it stays shut until a breach replaces it.
 */

/** Where the entrance is, found from the room that owns it. */
export interface Entrance {
  /** The wall's outer face (x), and which way out is (-1: toward -x). */
  face: number;
  out: 1 | -1;
  /** The doorway: its centre along the wall (z), width and height, and the floor. */
  centre: number;
  width: number;
  height: number;
  floor: number;
  /** How thick the wall is (the doorway is a gap this deep). */
  thickness: number;
}

interface RoomLike {
  id: string;
  minX: number;
  floorY: number;
  doors: Array<{ side: string; at: number; width: number }>;
}

/** The Server room's west doorway as it is built (the map's own numbers). */
export function entranceOf(
  rooms: readonly RoomLike[],
  wallThickness: number,
  doorHeight: number,
): Entrance {
  const room = rooms.find((r) => r.id === "room-server");
  const door = room?.doors.find((d) => d.side === "w");

  if (!room || !door) {
    throw new Error("The Server room has no west doorway.");
  }

  return {
    face: room.minX,
    out: -1,
    centre: door.at,
    width: door.width,
    height: doorHeight,
    floor: room.floorY,
    thickness: wallThickness,
  };
}

/** A rectangle on the wall, in u (along it) and height. */
export interface WallRect {
  u0: number;
  u1: number;
  y0: number;
  y1: number;
}

/** The doorway, as the hole that must be hidden (centred on u = 0). */
export const holeOf = (e: Entrance): WallRect => ({
  u0: -e.width / 2,
  u1: e.width / 2,
  y0: 0,
  y1: e.height,
});

/** The one gap left to see into, high in the heap and small. */
export const SLIT: WallRect = { u0: 0.2, u1: 0.65, y0: 1.65, y1: 2.05 };

/** How much of the hole the debris must hide, seen from the dock. */
export const HIDDEN_AT_LEAST = 0.92;

/** Old, dirty concrete: the wall's own dark grey, never one tone. */
const OLD = [
  0x26282b, 0x2e3033, 0x35373b, 0x1f2124, 0x383a3e, 0x2a2c2f, 0x303236,
  0x232528,
];
/** Recently broken concrete: only a little lighter and dustier (its colour is also mixed in per vertex). */
const FRESH = [0x44464a, 0x3f4144, 0x494b4f, 0x3a3c40];
const BRICK = [
  0x6a4033, 0x74483a, 0x58352c, 0x7a5042, 0x4e2c26, 0x62493c, 0x5a3e32,
];
const REBAR = 0x5e3320;
const REBAR_BARE = 0x7a4a2a;
const STEEL = 0x4f5f74;
const STEEL_DARK = 0x353b46;
const DRUM = 0x45607a;

export interface Footprint {
  u: number;
  y: number;
  /** Half size seen from the dock, along the wall and in height. */
  hu: number;
  hy: number;
}

/** The heap's height at a point: highest at the wall, falling away from it. */
function heapHeight(e: Entrance, u: number, dx: number): number {
  const across = u / (e.width * 0.62);
  const ridge = e.height - 0.15 - 1.0 * across * across;

  return Math.max(ridge, 0.4) * Math.max(0, 1 - dx / 1.5);
}

/** The points of the hole to count, a hand's width apart. */
function holePoints(e: Entrance): Array<[number, number]> {
  const hole = holeOf(e);
  const points: Array<[number, number]> = [];

  for (let u = hole.u0 + 0.04; u < hole.u1; u += 0.08) {
    for (let y = 0.04; y < hole.y1; y += 0.08) {
      points.push([u, y]);
    }
  }

  return points;
}

/** A running count of the hole's points that the debris hides. */
class Cover {
  private readonly points: Array<[number, number]>;
  private readonly hidden: Uint8Array;
  private count = 0;

  constructor(e: Entrance) {
    this.points = holePoints(e);
    this.hidden = new Uint8Array(this.points.length);
  }

  /** How many not-yet-hidden points a footprint would hide. */
  public gain(f: Footprint): number {
    let n = 0;

    this.points.forEach(([u, y], i) => {
      if (
        !this.hidden[i] &&
        Math.abs(u - f.u) <= f.hu &&
        Math.abs(y - f.y) <= f.hy
      ) {
        n++;
      }
    });

    return n;
  }

  /** Marks the points a footprint hides; returns the share hidden so far. */
  public add(f: Footprint): number {
    this.points.forEach(([u, y], i) => {
      if (
        !this.hidden[i] &&
        Math.abs(u - f.u) <= f.hu &&
        Math.abs(y - f.y) <= f.hy
      ) {
        this.hidden[i] = 1;
        this.count++;
      }
    });

    return this.share;
  }

  public get share(): number {
    return this.count / this.points.length;
  }
}

/** The share of the hole that the footprints hide (the slit stays open). */
export function collapseCoverage(
  e: Entrance,
  feet: readonly Footprint[],
): number {
  const cover = new Cover(e);

  feet.forEach((f) => cover.add(f));

  return cover.share;
}

/** The Euler angles that turn a piece lying along x to lie along `to`. */
function along(to: THREE.Vector3): [number, number, number] {
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(1, 0, 0),
    to.clone().normalize(),
  );
  const eu = new THREE.Euler().setFromQuaternion(q, "XYZ");

  return [eu.x, eu.y, eu.z];
}

/** A steel rod from one point to another. */
function rod(
  p: Pieces,
  a: THREE.Vector3,
  b: THREE.Vector3,
  diameter: number,
  color: number,
): void {
  const d = b.clone().sub(a);
  const m = a.clone().add(b).multiplyScalar(0.5);
  const [rx, ry, rz] = along(d);

  p.bar(m.x, m.y, m.z, d.length(), diameter, color, ry, rz, rx);
}

export interface Collapse {
  /** The heap, the broken edges and the rebar: drawn pieces. */
  elements: PileElement[];
  /** What each piece hides of the doorway, seen from the dock. */
  footprints: Footprint[];
}

/** Builds the collapse for an entrance (the same every run). */
export function buildCollapse(e: Entrance): Collapse {
  const random = rng(8123);
  const pick = <T>(list: readonly T[]): T =>
    list[Math.floor(random() * list.length)];
  const p = new Pieces();
  const out: PileElement[] = [];
  const feet: Footprint[] = [];
  const cover = new Cover(e);
  const hole = holeOf(e);
  const X = (dx: number): number => e.face + e.out * dx;
  const Z = (u: number): number => e.centre + u;

  const piece = (
    shape: "rock" | "slab" | "brick",
    dx: number,
    y: number,
    u: number,
    size: [number, number, number],
    color: number,
    turn: [number, number, number],
  ): void => {
    // No two pieces quite alike: each is a little lighter or darker, and a
    // little warmer or cooler, than its palette colour.
    const tone = new THREE.Color(color);
    const hsl = { h: 0, s: 0, l: 0 };

    tone.getHSL(hsl);
    tone.setHSL(
      hsl.h + (random() - 0.5) * 0.02,
      Math.max(0, hsl.s * (0.7 + random() * 0.6)),
      Math.min(0.9, hsl.l * (0.75 + random() * 0.5)),
    );
    color = tone.getHex();

    out.push({
      shape,
      x: X(dx),
      y,
      z: Z(u),
      sx: size[0],
      sy: size[1],
      sz: size[2],
      rx: turn[0],
      ry: turn[1],
      rz: turn[2],
      color,
    });
  };

  const spin = (): number => random() * Math.PI * 2;
  // Whole bricks, halves, broken thirds and quarter-chips.
  const brickSize = (): [number, number, number] => {
    const r = random();
    const len =
      r < 0.3
        ? 0.22
        : r < 0.55
          ? 0.15 + random() * 0.05
          : 0.06 + random() * 0.09;

    return [len, 0.05 + random() * 0.03, 0.06 + random() * 0.05];
  };

  // ------------------------------------------------ big slabs in the heap
  // Heavy concrete leaning on the jambs and the heap, each with its lower
  // edge buried. They are the first to hide the doorway. `lean` tips the top
  // toward the wall.
  const bigs: Array<[number, number, number, number, number, number]> = [
    // u, dx from the wall, centre height, width, height, lean
    [-1.25, 0.32, 1.25, 1.15, 1.0, 0.34],
    [1.05, 0.38, 1.35, 1.0, 1.15, 0.3],
    [-0.1, 0.72, 0.62, 1.35, 0.72, 0.12],
    [1.35, 0.95, 0.5, 0.9, 0.62, 0.1],
  ];

  for (const [u, dx, y, w, h, lean] of bigs) {
    piece("slab", dx, y, u, [0.3 + random() * 0.18, h, w], pick(OLD), [
      0.04,
      (random() - 0.5) * 0.4,
      lean * e.out,
    ]);
    feet.push({ u, y, hu: w * 0.4, hy: h * 0.4 });
    cover.add(feet[feet.length - 1]);
  }

  // --------------------------------------- the heap itself, built greedily
  let covered = cover.share;

  for (
    let tries = 0;
    tries < 40000 && covered < HIDDEN_AT_LEAST + 0.012;
    tries++
  ) {
    const u = (random() * 2 - 1) * (e.width / 2 - 0.1);
    const dx = -0.25 + random() * 1.3;
    // Mostly broken slabs of wall and floor (wide, flat, chipped); smaller
    // angular lumps only to fill between them.
    const slab = random() < 0.4;
    // Some slabs stand on edge, more lie flat or tipped (a floor, a ceiling).
    const flat = slab && random() < 0.5;
    const w = slab ? 0.4 + random() * random() * 0.9 : 0.22 + random() * 0.4;
    const h = slab
      ? flat
        ? 0.24 + random() * 0.18
        : 0.34 + random() * 0.5
      : w * (0.7 + random() * 0.4);
    const top = dx < 0.3 ? e.height - 0.2 : heapHeight(e, u, dx);
    const y = h * 0.4 + random() * Math.max(top - h * 0.5, 0.05);

    // Held by the heap, or wedged in the doorway between the jambs.
    if (dx >= 0.3 && y - h * 0.4 > top - h * 0.25) {
      continue;
    }

    const hu = w * 0.42;
    const hy = h * 0.42;

    // Never over the slit.
    if (
      u + hu > SLIT.u0 - 0.04 &&
      u - hu < SLIT.u1 + 0.04 &&
      y + hy > SLIT.y0 - 0.04 &&
      y - hy < SLIT.y1 + 0.04 &&
      dx < 1.3
    ) {
      continue;
    }

    const foot = { u, y, hu: hu * 0.9, hy: hy * 0.9 };

    // Only a piece that hides something new belongs in the heap.
    if (cover.gain(foot) < 4) {
      continue;
    }

    if (slab) {
      // A slab keeps the lie of the wall or floor it came from: tipped and
      // twisted, not tumbled end over end.
      const depth = flat ? 0.4 + random() * 0.45 : 0.24 + random() * 0.26;

      piece(
        "slab",
        dx,
        y,
        u,
        // (A flat slab is thin in height and long out from the wall.)
        flat ? [depth, h, w] : [depth, h, w],
        pick(random() < 0.22 ? FRESH : OLD),
        flat
          ? [
              (random() - 0.5) * 0.5,
              (random() - 0.5) * 1.2,
              (random() - 0.5) * 0.9 * e.out,
            ]
          : [
              (random() - 0.5) * 0.7,
              (random() - 0.5) * 0.9,
              (random() - 0.5) * 1.1 * e.out,
            ],
      );
    } else {
      piece("rock", dx, y, u, [w, h, w * (0.8 + random() * 0.4)], pick(OLD), [
        spin(),
        spin(),
        spin(),
      ]);
    }

    feet.push(foot);
    covered = cover.add(foot);
  }

  // ------------------------------------------- the broken edge of the wall
  // Fractured sections of the jambs and lintel, pale where they have just
  // broken, bitten into the doorway and sticking out of the wall face.
  const edge: Array<[number, number, number]> = [];

  for (let y = 0.2; y < hole.y1; y += 0.42) {
    edge.push([hole.u0, y, 0]);
    edge.push([hole.u1, y, 0]);
  }

  for (let u = hole.u0; u <= hole.u1; u += 0.45) {
    edge.push([u, hole.y1, 1]);
  }

  for (const [u, y, top] of edge) {
    if (random() < 0.3) {
      continue;
    }

    piece(
      "slab",
      0.04 + random() * 0.14 - (top ? 0 : 0.1),
      y + (top ? 0.1 : 0) + (random() - 0.5) * 0.2,
      u + (random() - 0.5) * 0.3 + (top ? 0 : u > 0 ? -0.1 : 0.1),
      [0.08 + random() * 0.1, 0.18 + random() * 0.34, 0.22 + random() * 0.4],
      pick(random() < 0.55 ? FRESH : OLD),
      [(random() - 0.5) * 0.6, (random() - 0.5) * 0.5, (random() - 0.5) * 0.7],
    );
  }

  // ------------------------------------------------------ depth and damage
  // Big slabs that stand out toward the player, propped against the heap and
  // leaning back on it, each its own height and twist...
  const props: Array<[number, number, number, number]> = [
    // u, dx, height, width
    [-1.55, 1.05, 1.5, 0.95],
    [0.35, 1.25, 1.05, 1.2],
    [1.6, 0.95, 1.7, 0.85],
    [-0.5, 0.85, 1.3, 0.8],
    [1.0, 1.15, 0.8, 1.0],
  ];

  for (const [u, dx, h, w] of props) {
    const y = h * 0.5 - 0.06;

    piece(
      "slab",
      dx,
      y,
      u,
      [0.3 + random() * 0.14, h, w],
      pick(random() < 0.35 ? FRESH : OLD),
      [
        (random() - 0.5) * 0.35,
        (random() - 0.5) * 0.7,
        // Leaning back toward the wall.
        (0.28 + random() * 0.2) * e.out,
      ],
    );
    feet.push({ u, y: y + 0.2, hu: w * 0.4, hy: h * 0.4 });
    cover.add(feet[feet.length - 1]);
  }

  // ...and slabs wedged deeper in the doorway, behind the heap, so there are
  // layers to see between the pieces in front.
  for (const [u, y, w, h] of [
    [-1.1, 1.0, 0.9, 0.7],
    [1.2, 1.5, 0.8, 0.8],
    [-0.4, 2.2, 0.9, 0.5],
    [0.9, 0.5, 1.0, 0.6],
  ] as const) {
    piece(
      "slab",
      -0.3 - random() * 0.35,
      y,
      u,
      [0.3 + random() * 0.2, h, w],
      pick(OLD),
      [(random() - 0.5) * 0.4, (random() - 0.5) * 0.9, (random() - 0.5) * 0.9],
    );
  }

  // Pieces of the lintel hanging over the opening on their rebar, their
  // heights and the way they hang all different.
  for (let u = hole.u0 + 0.2; u < hole.u1 - 0.1; u += 0.5 + random() * 0.5) {
    const h = 0.25 + random() * 0.45;

    piece(
      "slab",
      0.12 + random() * 0.5,
      hole.y1 - 0.1 - random() * 0.35,
      u,
      [0.2 + random() * 0.2, h, 0.25 + random() * 0.4],
      pick(random() < 0.5 ? FRESH : OLD),
      [(random() - 0.5) * 0.8, spin(), (random() - 0.5) * 1.2],
    );
  }

  // The wall round the doorway, broken where it tore: bites of exposed brick
  // and chipped concrete along the jambs, thinning out up the wall...
  for (let i = 0; i < 26; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const out = 0.12 + random() * random() * 0.9;
    const u = side * (e.width / 2 + out);
    const y = 0.15 + random() * (e.height + 0.5) * (1 - out * 0.45);
    const brickish = random() < 0.45;

    if (brickish) {
      piece(
        "brick",
        0.03,
        y,
        u,
        [0.04, 0.07, 0.11 + random() * 0.11],
        pick(BRICK),
        [0, 0, (random() - 0.5) * 0.4],
      );
    } else {
      piece(
        "slab",
        0.05 + random() * 0.05,
        y,
        u,
        [0.05 + random() * 0.05, 0.12 + random() * 0.3, 0.14 + random() * 0.3],
        pick(random() < 0.5 ? FRESH : OLD),
        [
          (random() - 0.5) * 0.4,
          (random() - 0.5) * 0.4,
          (random() - 0.5) * 0.9,
        ],
      );
    }
  }

  // ...and cracks running out of the corners across the wall, each a zigzag
  // of thin dark fractures, with a damp stain under the worst.
  const crackFrom: Array<[number, number, number]> = [
    // u, y, direction (radians, 0 = along the wall, up is +)
    [hole.u0, hole.y1 - 0.2, 2.5],
    [hole.u0, 0.8, 3.4],
    [hole.u1, hole.y1 - 0.1, 0.6],
    [hole.u1, 1.2, -0.3],
    [0.3, hole.y1 + 0.3, 1.6],
  ];

  for (const [u0, y0, dir] of crackFrom) {
    let u = u0;
    let y = y0;
    let a = dir;

    for (let k = 0; k < 7; k++) {
      const len = 0.18 + random() * 0.3;

      a += (random() - 0.5) * 1.1;
      piece(
        "slab",
        0.006,
        y + (Math.sin(a) * len) / 2,
        u + (Math.cos(a) * len) / 2,
        [0.012, len, 0.02 + random() * 0.015],
        0x131417,
        // (A slab's long side is its height: turned about x into the wall's plane.)
        [a - Math.PI / 2, 0, 0],
      );
      u += Math.cos(a) * len;
      y += Math.sin(a) * len;
    }
  }

  for (const [u, y, w, h] of [
    [hole.u0 - 0.5, 0.7, 0.9, 1.3],
    [hole.u1 + 0.45, 1.1, 0.7, 1.1],
  ] as const) {
    piece("slab", 0.004, y, u, [0.008, h, w], 0x17191c, [0, 0, 0]);
  }

  // Broken sections of the wall beside the opening: tall slabs, each a
  // different height and tilt, torn off ragged up the jambs, so the sides and
  // the top are not a straight edge.
  for (let i = 0; i < 9; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const h = 0.5 + random() * 1.1;
    const u = side * (e.width / 2 + 0.05 + random() * 0.55);
    const y = 0.5 + random() * (e.height - 0.2);

    piece(
      "slab",
      0.05 + random() * 0.35,
      y,
      u,
      [0.12 + random() * 0.14, h, 0.18 + random() * 0.4],
      pick(random() < 0.45 ? FRESH : OLD),
      [(random() - 0.5) * 0.5, (random() - 0.5) * 0.8, (random() - 0.5) * 1.3],
    );
  }

  // Brick and masonry fragments caught between the big pieces, up the heap.
  for (let i = 0; i < 28; i++) {
    const u = (random() * 2 - 1) * (e.width / 2 - 0.15);
    const dx = random() * 0.9;

    piece(
      "brick",
      dx,
      0.2 + random() * (heapHeight(e, u, dx) + 0.8),
      u,
      brickSize(),
      pick(BRICK),
      [spin(), spin(), spin()],
    );
  }

  // The crown: jagged teeth of broken wall over the lintel.
  for (let u = hole.u0 - 0.1; u < hole.u1; u += 0.3 + random() * 0.25) {
    const h = 0.18 + random() * 0.5;

    piece(
      "slab",
      0.07,
      hole.y1 + 0.12 + h * 0.5,
      u,
      [0.1 + random() * 0.08, h, 0.16 + random() * 0.3],
      pick(random() < 0.5 ? FRESH : OLD),
      [0, 0, (random() - 0.5) * 0.9],
    );
  }

  // Loose bricks and broken block tumbled over the heap.
  for (let i = 0; i < 64; i++) {
    const u = (random() * 2 - 1) * (e.width / 2 + 0.25);
    const dx = -0.15 + random() * 1.4;
    const top = dx < 0.3 ? 0.9 : heapHeight(e, u, dx);

    if (top < 0.15) {
      continue;
    }

    // Mostly low, at the heap's foot; a few up on the slabs.
    piece(
      "brick",
      dx,
      Math.max(
        0.05,
        top * (random() < 0.7 ? 0.1 + random() * 0.3 : 0.4 + random() * 0.6),
      ),
      u,
      brickSize(),
      pick(BRICK),
      [spin(), spin(), spin()],
    );
  }

  // ----------------------------------------------------- bent reinforcement
  // Snapped bars standing out of the broken jambs and lintel, bent where they
  // gave way.
  const bars: Array<[number, number, number, number]> = [
    // u, y, reach, droop
    [hole.u0 + 0.35, hole.y1 - 0.05, 0.7, 0.35],
    [-0.4, hole.y1 + 0.1, 0.55, 0.5],
    [hole.u1 - 0.45, hole.y1 - 0.1, 0.65, 0.3],
    [0.5, hole.y1 + 0.2, 0.8, 0.45],
    [hole.u0 + 0.05, 1.1, 0.5, 0.2],
    [hole.u1 - 0.05, 0.9, 0.55, 0.25],
    [-1.3, hole.y1 + 0.05, 0.6, 0.4],
    [1.4, hole.y1 + 0.15, 0.5, 0.3],
    [0.1, 1.7, 0.45, 0.35],
  ];

  for (const [u, y, reach, droop] of bars) {
    // The bar starts inside the wall (0.18 m in) and comes out through a lump
    // of the concrete it snapped from.
    const a = new THREE.Vector3(X(-0.18), y + 0.01, Z(u));
    const knee = new THREE.Vector3(
      X(0.04 + reach * 0.55),
      y + 0.02,
      Z(u + 0.06),
    );
    const tip = new THREE.Vector3(
      X(0.04 + reach),
      y - droop,
      Z(u + 0.18 * (random() - 0.3)),
    );

    // Each bar its own thickness; rust-dark where it left the concrete, the
    // bright orange of fresh rust where it bent and snapped.
    const thick = 0.02 + random() * 0.016;

    piece(
      "slab",
      0.08 + random() * 0.05,
      y - 0.02,
      u,
      [0.18 + random() * 0.12, 0.22 + random() * 0.18, 0.22 + random() * 0.16],
      pick(random() < 0.6 ? FRESH : OLD),
      [(random() - 0.5) * 0.6, spin(), (random() - 0.5) * 0.8],
    );
    rod(p, a, knee, thick, REBAR);
    rod(p, knee, tip, thick * 0.9, random() < 0.6 ? REBAR_BARE : 0x8a4e22);
  }

  // ------------------------------------------------------------- foreground
  // A modest scatter reaching out from the heap: gravel, small rocks, bricks.
  for (let i = 0; i < 44; i++) {
    const size = 0.05 + random() * random() * 0.2;

    piece(
      "rock",
      1.0 + random() * 1.9,
      size * 0.25,
      (random() * 2 - 1) * (e.width / 2 + 0.5),
      [size, size * (0.5 + random() * 0.4), size * (0.8 + random() * 0.4)],
      pick(OLD),
      [spin(), spin(), spin()],
    );
  }

  for (let i = 0; i < 12; i++) {
    piece(
      "brick",
      1.2 + random() * 1.6,
      0.035,
      (random() * 2 - 1) * (e.width / 2 + 0.3),
      brickSize(),
      pick(BRICK),
      [0, random() * 3, 0],
    );
  }

  // The doorway's own floor, inside, where it spilled in a little.
  for (let i = 0; i < 8; i++) {
    const size = 0.2 + random() * 0.3;

    piece(
      "rock",
      -0.35 - random() * 0.6,
      size * 0.3,
      (random() * 2 - 1) * (e.width / 2 - 0.3),
      [size, size * 0.6, size * 0.9],
      pick(OLD),
      [spin(), spin(), spin()],
    );
  }

  // ------------------------------------------------ the pile at the foot
  // Where the wall came down, the rubble is deepest at the bottom: a broad,
  // low skirt of small broken stone, brick and chipped slab banked against
  // the heap and thinning out across the floor, wider than the doorway.
  const reach = e.width / 2 + 0.7;

  for (let i = 0; i < 120; i++) {
    const dx = 0.3 + random() * random() * 1.9 + random() * 0.3;
    const u = (random() * 2 - 1) * reach;
    // Highest against the heap, falling away outward and toward the sides.
    const bank =
      Math.max(0.05, 0.62 * (1 - dx / 2.3)) *
      Math.max(0.2, 1 - Math.abs(u) / (reach + 0.4));
    const size = 0.07 + random() * random() * 0.3;

    piece(
      "rock",
      dx,
      Math.max(size * 0.22, bank * random()),
      u,
      [size, size * (0.5 + random() * 0.4), size * (0.75 + random() * 0.5)],
      pick(OLD),
      [spin(), spin(), spin()],
    );
  }

  for (let i = 0; i < 18; i++) {
    const dx = 0.5 + random() * 1.5;
    const u = (random() * 2 - 1) * reach;
    const w = 0.22 + random() * 0.3;

    piece(
      "slab",
      dx,
      0.06 + random() * 0.14,
      u,
      [0.18 + random() * 0.3, 0.07 + random() * 0.07, w],
      pick(random() < 0.3 ? FRESH : OLD),
      [(random() - 0.5) * 0.3, spin(), (random() - 0.5) * 0.3],
    );
  }

  for (let i = 0; i < 36; i++) {
    const dx = 0.4 + random() * random() * 2.0;
    const u = (random() * 2 - 1) * reach;

    piece(
      "brick",
      dx,
      0.03 + random() * Math.max(0.02, 0.4 * (1 - dx / 2.4)),
      u,
      brickSize(),
      pick(BRICK),
      [spin(), spin(), spin()],
    );
  }

  return { elements: [...p.elements, ...out], footprints: feet };
}

// -------------------------------------------------------------- the site

/**
 * A tripod work halogen that has gone over: the legs folded back along the
 * floor behind it, the mast on its side and the head down on the ground,
 * still aimed at the heap. `headX`/`headZ` is the lamp, `back` the way (+1 or
 * -1 along x) the legs trail.
 */
function fallenTripod(
  p: Pieces,
  headX: number,
  headZ: number,
  back: number,
): void {
  const yoke = new THREE.Vector3(headX + back * 0.32, 0.12, headZ);

  // The mast, on its side from the head back to the legs' crown.
  rod(p, new THREE.Vector3(headX, 0.1, headZ), yoke, 0.05, STEEL);
  p.box(yoke.x - 0.05, 0, yoke.z - 0.05, 0.1, 0.09, 0.1, STEEL_DARK);

  // Three legs splayed on the floor, one propped on the lamp's own yoke.
  for (const [dx, dz, lift] of [
    [1.15, -0.5, 0.03],
    [1.3, 0.35, 0.03],
    [0.9, 0.05, 0.16],
  ] as const) {
    rod(
      p,
      yoke,
      new THREE.Vector3(yoke.x + back * dx, lift, yoke.z + dz),
      0.035,
      STEEL_DARK,
    );
  }
}

/** A portable barrier post: a heavy foot and a slim post. */
function post(p: Pieces, x: number, z: number): void {
  p.box(x, 0, z, 0.34, 0.035, 0.34, STEEL_DARK);
  p.cableUp(x, 0.035, z, 1.15, 0.04, STEEL);
  p.cableUp(x, 1.16, z, 0.04, 0.07, 0x9a8836);
}

/**
 * The site's furnishings, set out from the entrance: tape posts, tripod
 * lamps and the one drum, all on the dock floor in front of the
 * heap (never in the lane along the walkway or the route to the north).
 */
export interface Site {
  posts: Array<[number, number]>;
  tape: TapeRun[];
  viewer: [number, number, number];
  lamps: Array<{
    id: string;
    at: [number, number, number];
    target: [number, number, number];
    stand: [number, number];
  }>;
  drum: [number, number];
}

export function siteOf(e: Entrance): Site {
  const X = (dx: number): number => e.face + e.out * dx;
  const Z = (u: number): number => e.centre + u;
  const f = e.floor;
  // The tape's line, two metres out from the wall (so close to the heap that
  // no body can get between them, far enough from it that nothing is hidden).
  const left: [number, number] = [X(2.0), Z(-2.6)];
  const right: [number, number] = [X(2.0), Z(2.4)];
  // Where the side runs are tied to the wall, a little past each jamb.
  const hookL = Z(-2.6);
  const hookR = Z(2.4);
  const hookX = X(0.12);

  return {
    // The tape's two ends, tied to a post each (the tripods are gone).
    posts: [left, right],
    tape: [
      // One band across the front, one down each side to the wall: a clean
      // U round the approach, at one height.
      {
        from: [left[0], f + 1.05, left[1]],
        to: [right[0], f + 1.05, right[1]],
        sag: 0.14,
      },
      {
        from: [left[0], f + 1.05, left[1]],
        to: [hookX, f + 1.05, hookL],
        sag: 0.09,
      },
      {
        from: [right[0], f + 1.05, right[1]],
        to: [hookX, f + 1.05, hookR],
        sag: 0.09,
      },
    ],
    // Out in the dock, looking at the heap.
    viewer: [X(8), f + 1.2, e.centre],
    // One floodlight, knocked over in front of the tape and lying on the
    // dock floor, its beam still thrown across the heap (it flickers).
    lamps: [
      {
        id: "halogen-scene-1",
        at: [X(3.0), f + 0.3, Z(-2.0)],
        target: [X(0.0), f + 1.2, Z(0.6)],
        stand: [X(3.0), Z(-2.0)],
      },
    ],
    drum: [X(3.4), Z(-4.6)],
  };
}

export function furnishCollapsedEntrance(map: MapBuilder, e: Entrance): Site {
  const site = siteOf(e);
  const X = (dx: number): number => e.face + e.out * dx;
  const Z = (u: number): number => e.centre + u;
  const half = e.width / 2;

  // The heap, the broken wall and the rebar: one solid box over the heap and
  // the doorway (and a little way inside), so nothing passes before a breach.
  const { elements } = buildCollapse(e);

  map.createFitting("fittings-vault-collapse", e.floor, elements, [
    {
      minX: Math.min(X(1.3), X(-0.8)),
      maxX: Math.max(X(1.3), X(-0.8)),
      minZ: Z(-half - 0.2),
      maxZ: Z(half + 0.1),
      top: 2.9,
      exact: true,
    },
  ]);

  // Posts for the tape, one by one.
  for (const [x, z] of site.posts) {
    const p = new Pieces();

    post(p, x, z);
    map.createFitting(`fittings-vault-post-${z}`, e.floor, p.elements, [
      {
        minX: x - 0.17,
        maxX: x + 0.17,
        minZ: z - 0.17,
        maxZ: z + 0.17,
        top: 1.2,
      },
    ]);
  }

  // The fallen floodlight (no battery case beside it: it would stand in the
  // way and have to be jumped).
  for (const lamp of site.lamps) {
    const p = new Pieces();
    const [sx, sz] = lamp.stand;

    fallenTripod(p, sx, sz, -e.out);
    // (The legs lie flat and are stepped over: a body meets only the head.)
    map.createFitting(`fittings-vault-${lamp.id}`, e.floor, p.elements, [
      {
        minX: sx - 0.22,
        maxX: sx + 0.22,
        minZ: sz - 0.22,
        maxZ: sz + 0.22,
        top: 0.32,
        exact: true,
      },
    ]);
    map.addLight({
      id: lamp.id,
      x: lamp.at[0],
      y: lamp.at[1],
      z: lamp.at[2],
      color: 0xffd9a8,
      intensity: 38,
      distance: 8,
      target: { x: lamp.target[0], y: lamp.target[1], z: lamp.target[2] },
      angle: 0.5,
    });
  }

  // One drum by the barrier.
  {
    const [dx, dz] = site.drum;
    const p = new Pieces();

    p.cableUp(dx, 0, dz, 0.9, 0.58, DRUM);
    p.cableUp(dx, 0.42, dz, 0.05, 0.6, STEEL_DARK);
    p.cableUp(dx, 0.88, dz, 0.03, 0.55, STEEL);
    map.createFitting("fittings-vault-drum", e.floor, p.elements, [
      {
        minX: dx - 0.32,
        maxX: dx + 0.32,
        minZ: dz - 0.32,
        maxZ: dz + 0.32,
        top: 0.95,
      },
    ]);
  }

  return site;
}
