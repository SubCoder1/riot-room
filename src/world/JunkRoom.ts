import * as THREE from "three";

import type { PileElement } from "./ArenaLayout";
import { Pieces, rng } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import {
  BLACK,
  CHARCOAL,
  GUNMETAL,
  RUST,
  STEEL_BARE,
  TIMBER,
  TIMBER_B,
  TIMBER_DARK,
} from "./RoomKit";

/**
 * The Industrial Junk Room (layout id `room-archive`: x -14 to -1, z -24 to
 * -16, floor 4; inside x -13.7 to -1.3, z -23.7 to -16.3): a neglected dump for
 * construction waste, broken machinery and tangled wiring.
 *
 *   - the big pile of mixed debris in the north-west (back) corner;
 *   - one collapsed rack on its side along the west wall, its contents spilled;
 *   - one tall, overloaded rack on the north wall;
 *   - three rusty drums (two by the pile, one leaking in the north-east
 *     corner, its oil trail running to the fuel pool: see `FuelSpillView`);
 *   - a heavy cable spool in the south-east corner and loose scraps round
 *     the edges;
 *   - the beams, cable tray, pipe and caged lamps overhead.
 *
 * The middle of the room (between the south door at x -9 to -7 and the east
 * door at z -21 to -19) is kept open: only low scraps lie along its edges.
 * Everything is static: merged pieces, with a few simple hidden boxes for
 * collision.
 */

const CONCRETE = [0x66645e, 0x58564f, 0x726f66, 0x4d4c48, 0x605e57];
const BRICK = [0x8a4838, 0x74382c, 0x9b5a45, 0x6a3a30, 0x80402f];
const RUSTY = [0x6b3e22, 0x59341f, 0x7a4a2a, 0x4a3022, 0x6e4a30];
const DARK = [0x2a2c2f, 0x35383c, 0x23252a, 0x3a3d40];
const WOOD = [TIMBER, TIMBER_B, TIMBER_DARK, 0x6a5a45, 0x57452f];
const PLASTER = 0xa59f8e;
const UPRIGHT = 0x3b4a5e;
const BEAM = 0x80502a;
const DECK = 0x4a4f55;
const OIL = 0x15161a;
const DAMP = 0x33373a;
const PIPE = 0x5a5e5a;
const DRUM_BLUE = 0x34506a;
const DRUM_RED = 0x6e2c24;
const DRUM_GREEN = 0x3c4a34;
const DRUM_BAND = 0x4a3a2c;
const FADED_WHITE = 0x8f8b7c;

/** The room's west and north inside faces. */
const X0 = -13.7;
const Z0 = -23.7;

/** Where the leaking drum's oil collects (also the fuel hazard, see below). */
export const JUNK_FUEL_SPILL = {
  id: "fuel-junk-room",
  // A wide puddle like standing rainwater, pooled round the doorway between the
  // two rooms (the east door, z -21 to -19), fed by the leaking drum in the
  // north-east corner, and running a little way into each room, not deep.
  x: -1.7,
  z: -20.3,
  radius: 2.0,
  source: { x: -2.3, z: -22.97 },
  path: [
    { x: -2.3, z: -22.97 },
    { x: -2.2, z: -22.0 },
    { x: -1.9, z: -21.0 },
  ],
  // The fuel fire burns between the pool and the leaking drum, so it covers
  // the drum, the doorway and the whole puddle.
  fire: { x: -2.1, z: -21.7 },
  // Warning signs: on the north wall over the drum and on the east wall by the doorway.
  signs: [
    { x: -3.1, y: 1.45, z: -23.69, nx: 0, nz: 1 },
    { x: -1.31, y: 1.5, z: -22.4, nx: -1, nz: 0 },
  ],
  lobes: [
    // Through the doorway into the Generator Room.
    { x: -0.1, z: -20.1, r: 1.1 },
    // Back into the Junk Room, and a side lobe towards the south.
    { x: -3.4, z: -19.6, r: 0.9 },
    { x: -2.2, z: -18.6, r: 0.6 },
  ],
} as const;

const pick = <T>(random: () => number, list: readonly T[]): T =>
  list[Math.floor(random() * list.length) % list.length];
const between = (random: () => number, a: number, b: number): number =>
  a + random() * (b - a);

/** A colour a little lighter or darker (each channel scaled together). */
function shade(color: number, k: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * k));
  const b = Math.min(255, Math.round((color & 255) * k));

  return (r << 16) | (g << 8) | b;
}

/**
 * Pieces drawn in a local frame (x along a rack, y up, z across it) and
 * placed in the world through a matrix: a rack stands, or lies on its side,
 * by changing the matrix alone.
 */
class Frame {
  private readonly local = new THREE.Matrix4();
  private readonly world = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();
  private readonly unit = new THREE.Vector3(1, 1, 1);

  private readonly pieces: Pieces;
  private readonly matrix: THREE.Matrix4;

  constructor(pieces: Pieces, matrix: THREE.Matrix4) {
    this.pieces = pieces;
    this.matrix = matrix;
  }

  public piece(
    shape: PileElement["shape"],
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ): void {
    this.local.compose(
      this.position.set(x, y, z),
      this.quaternion.setFromEuler(this.euler.set(rx, ry, rz)),
      this.unit,
    );
    this.world.multiplyMatrices(this.matrix, this.local);
    this.world.decompose(this.position, this.quaternion, this.scale);
    this.euler.setFromQuaternion(this.quaternion, "XYZ");
    this.pieces.elements.push({
      shape,
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      sx,
      sy,
      sz,
      rx: this.euler.x,
      ry: this.euler.y,
      rz: this.euler.z,
      color,
    });
  }

  /** A box from its bottom centre. */
  public box(
    x: number,
    bottom: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ): void {
    this.piece("plank", x, bottom + sy / 2, z, sx, sy, sz, color, rx, ry, rz);
  }

  /** A pipe or bar from its centre, along local x unless turned. */
  public rod(
    x: number,
    y: number,
    z: number,
    length: number,
    diameter: number,
    color: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ): void {
    this.piece("pipe", x, y, z, length, diameter, diameter, color, rx, ry, rz);
  }

  /** A cable length (a closed, plain cylinder) from its centre, along x. */
  public wire(
    x: number,
    y: number,
    z: number,
    length: number,
    diameter: number,
    color: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ): void {
    this.piece("cable", x, y, z, length, diameter, diameter, color, rx, ry, rz);
  }

  /** A closed upright cylinder (a coil, a drum, a disc) from its bottom. */
  public drum(
    x: number,
    bottom: number,
    z: number,
    height: number,
    diameter: number,
    color: number,
  ): void {
    this.piece(
      "cable",
      x,
      bottom + height / 2,
      z,
      height,
      diameter,
      diameter,
      color,
      0,
      0,
      Math.PI / 2,
    );
  }
}

/** What one shelf bay holds, standing on a deck at `y` in the rack's frame. */
function rackItem(
  f: Frame,
  random: () => number,
  kind: number,
  x: number,
  y: number,
  bay: number,
  depth: number,
): void {
  const z = between(random, -0.12, 0.14);

  switch (kind) {
    case 0: {
      // A cable coil, black, with a loose end hanging out of the front.
      const d = between(random, 0.4, 0.58);

      f.drum(x, y, z, 0.16, d, BLACK);
      f.drum(x, y + 0.16, z, 0.14, d * 0.9, shade(BLACK, 1.4));
      f.drum(x, y + 0.3, z, 0.05, d * 0.5, RUSTY[0]);
      f.wire(
        x + 0.12,
        y + 0.05,
        depth / 2 + 0.18,
        0.7,
        0.03,
        BLACK,
        0,
        Math.PI / 2 + between(random, -0.3, 0.3),
        0,
      );
      break;
    }

    case 1: {
      // A damaged box, its lid hanging off.
      const w = between(random, 0.34, 0.5);
      const c = pick(random, WOOD);

      f.box(x, y, z, w, 0.3, 0.38, c, 0, between(random, -0.3, 0.3), 0.04);
      f.box(
        x + 0.12,
        y + 0.3,
        z + 0.1,
        w,
        0.02,
        0.38,
        shade(c, 0.8),
        0,
        0,
        0.5,
      );
      f.box(x - 0.1, y + 0.05, z + 0.19, 0.2, 0.18, 0.02, BLACK);
      break;
    }

    case 2: {
      // Spare conduit: three lengths that stick out past the bay.
      for (let k = 0; k < 3; k++) {
        f.rod(
          x + between(random, -0.08, 0.08),
          y + 0.03 + k * 0.045,
          z + (k - 1) * 0.1,
          bay * between(random, 1.0, 1.25),
          0.04,
          k === 1 ? RUSTY[1] : pick(random, [PIPE, STEEL_BARE, DARK[0]]),
          0,
          between(random, -0.12, 0.12),
          between(random, -0.04, 0.05),
        );
      }
      break;
    }

    case 3: {
      // A metal component: a motor can, a gear and a bracket.
      f.drum(x, y, z, 0.32, 0.26, pick(random, [DRUM_BLUE, DARK[1], RUSTY[2]]));
      f.drum(x, y + 0.32, z, 0.03, 0.14, STEEL_BARE);
      f.drum(x + 0.26, y, z + 0.05, 0.05, 0.3, RUSTY[0]);
      f.box(x - 0.22, y, z, 0.1, 0.18, 0.2, DARK[2], 0, 0.4, 0);
      break;
    }

    case 4: {
      // A broken container: a bin with a split side and its contents slumped.
      const c = pick(random, [DRUM_RED, DARK[3], RUSTY[3]]);

      f.box(x, y, z, 0.5, 0.03, 0.4, c);
      f.box(x, y, z - 0.19, 0.5, 0.26, 0.02, c);
      f.box(x - 0.24, y, z, 0.02, 0.26, 0.4, c);
      f.box(x + 0.25, y, z + 0.02, 0.02, 0.2, 0.4, c, 0, 0, 0.5);
      f.box(x, y + 0.03, z + 0.04, 0.34, 0.12, 0.26, shade(c, 0.6), 0, 0.5, 0);
      break;
    }

    case 5: {
      // Scrap strips leaning against each other.
      for (let k = 0; k < 3; k++) {
        f.box(
          x + k * 0.1,
          y,
          z + between(random, -0.05, 0.05),
          0.014,
          0.55,
          0.1 + k * 0.04,
          pick(random, RUSTY),
          0,
          between(random, 0, 0.5),
          0.1 + k * 0.1,
        );
      }
      break;
    }

    default: {
      // A length of old pipe jutting from the front, and a few bricks.
      f.rod(
        x,
        y + 0.05,
        depth / 2 - 0.2,
        0.9,
        0.07,
        pick(random, [PIPE, RUSTY[2]]),
        0,
        Math.PI / 2 + between(random, -0.25, 0.25),
        0,
      );

      for (let k = 0; k < 3; k++) {
        f.piece(
          "brick",
          x - 0.1 + k * 0.1,
          y + 0.04 + (k % 2) * 0.07,
          z - 0.12,
          0.22,
          0.07,
          0.105,
          pick(random, BRICK),
          0,
          between(random, 0, 3),
          0,
        );
      }
    }
  }
}

/**
 * A heavy industrial rack in its own frame (x along its length, y up, z across
 * it; the origin on the floor, in the middle): painted uprights, rusty
 * orange beams, steel decks with a bay or two missing or sagging, and cross
 * braces. `fill` is the share of bays left with something on them.
 */
function buildRack(
  f: Frame,
  random: () => number,
  length: number,
  height: number,
  depth: number,
  levels: readonly number[],
  bays: number,
  fill: number,
  deckLoss = 0.1,
): void {
  const bay = length / bays;

  for (let k = 0; k <= bays; k++) {
    const x = -length / 2 + k * bay;

    for (const z of [-depth / 2, depth / 2]) {
      f.box(
        x,
        0,
        z,
        0.07,
        height,
        0.06,
        shade(UPRIGHT, between(random, 0.8, 1.1)),
      );
      f.box(x, 0, z, 0.16, 0.012, 0.16, DARK[0]);
    }
  }

  for (const y of levels) {
    for (const z of [-depth / 2, depth / 2]) {
      f.box(
        0,
        y,
        z,
        length,
        0.09,
        0.05,
        shade(BEAM, between(random, 0.75, 1.05)),
      );
    }

    for (let b = 0; b < bays; b++) {
      const x = -length / 2 + (b + 0.5) * bay;
      const roll = random();

      if (roll < deckLoss) {
        continue;
      }

      f.box(
        x,
        y + 0.09,
        0,
        bay - 0.05,
        0.025,
        depth - 0.05,
        shade(DECK, between(random, 0.8, 1.2)),
        0,
        0,
        roll > 0.85 ? between(random, 0.04, 0.09) : 0,
      );

      if (random() < fill) {
        const items = 1 + Math.floor(random() * 2);

        for (let n = 0; n < items; n++) {
          rackItem(
            f,
            random,
            Math.floor(random() * 7),
            x +
              (n - (items - 1) / 2) * bay * 0.38 +
              between(random, -0.05, 0.05),
            y + 0.115,
            bay,
            depth,
          );
        }
      }
    }
  }

  // Cross braces on the back (alternating), from the foot to the second level.
  const rise = levels[Math.min(2, levels.length - 1)] - 0.1;

  for (let b = 0; b < bays; b++) {
    const x = -length / 2 + (b + 0.5) * bay;
    const slope = Math.atan2(rise, bay);

    f.rod(
      x,
      0.1 + rise / 2,
      -depth / 2 - 0.04,
      Math.hypot(bay, rise),
      0.03,
      shade(UPRIGHT, 0.9),
      0,
      0,
      b % 2 ? slope : -slope,
    );
  }
}

/** A drum standing, with rim bands, a faded stripe, a dent and grime. */
function drumUp(
  p: Pieces,
  x: number,
  z: number,
  color: number,
  dent: boolean,
): void {
  p.cableUp(x, 0, z, 0.88, 0.58, color);
  p.cableUp(x, 0, z, 0.1, 0.59, 0x2a2118);

  for (const y of [0.0, 0.42, 0.84]) {
    p.cableUp(x, y, z, 0.04, 0.605, DRUM_BAND);
  }

  p.cableUp(x, 0.88, z, 0.015, 0.52, shade(color, 0.6));
  p.cableUp(x, 0.55, z, 0.17, 0.585, FADED_WHITE);

  if (dent) {
    p.box(x + 0.22, 0.4, z + 0.2, 0.14, 0.22, 0.05, shade(color, 0.6), 0.8);
  }
}

/** A drum on its side (axis along x turned by `ry`), with the same details. */
function drumSide(
  p: Pieces,
  x: number,
  z: number,
  ry: number,
  color: number,
): void {
  const along = (d: number): [number, number] => [
    x + Math.cos(ry) * d,
    z - Math.sin(ry) * d,
  ];

  p.cable(x, 0.29, z, 0.88, 0.58, color, ry);

  for (const d of [-0.43, -0.2, 0.2, 0.43]) {
    const [bx, bz] = along(d);

    p.cable(bx, 0.29, bz, 0.04, 0.605, DRUM_BAND, ry);
  }

  const [sx, sz] = along(0.05);

  p.cable(sx, 0.29, sz, 0.16, 0.585, FADED_WHITE, ry);
}

/** A bundle of black cables laid down in a few bends, from (x, z) towards `heading`. */
function cableRun(
  p: Pieces,
  random: () => number,
  x: number,
  z: number,
  heading: number,
  segments: number,
  strands: number,
): void {
  for (let s = 0; s < strands; s++) {
    let cx = x + between(random, -0.06, 0.06);
    let cz = z + between(random, -0.06, 0.06);
    let angle = heading + between(random, -0.12, 0.12);
    const d = between(random, 0.032, 0.05);
    const color = random() < 0.1 ? 0x4a2a28 : BLACK;

    for (let k = 0; k < segments; k++) {
      const length = between(random, 0.5, 0.9);

      p.cable(
        cx + (Math.cos(angle) * length) / 2,
        d / 2 + 0.003 + s * 0.012,
        cz - (Math.sin(angle) * length) / 2,
        length,
        d,
        color,
        angle,
      );
      cx += Math.cos(angle) * length;
      cz -= Math.sin(angle) * length;
      angle += between(random, -0.55, 0.55);
    }
  }
}

/** How tall the pile's surface is at (x, z): its three boxes, with soft edges. */
interface Heap {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Height of its hidden collision box. */
  top: number;
  /** How high the debris is drawn there (the box is as high or higher). */
  visual: number;
}

function heapHeight(heaps: readonly Heap[], x: number, z: number): number {
  let best = 0;

  for (const h of heaps) {
    const dx = Math.max(h.minX - x, 0, x - h.maxX);
    const dz = Math.max(h.minZ - z, 0, z - h.maxZ);
    const out = Math.hypot(dx, dz);
    const k = Math.max(0, 1 - out / 0.55);

    best = Math.max(best, h.visual * (0.7 + 0.3 * k) * k);
  }

  return best;
}

/** One broken-concrete slab with rebar sticking out of it. */
function slab(
  p: Pieces,
  random: () => number,
  x: number,
  y: number,
  z: number,
): void {
  const w = between(random, 0.6, 1.1);
  const d = between(random, 0.4, 0.7);
  const c = pick(random, CONCRETE);

  p.box(
    x,
    y,
    z,
    w,
    between(random, 0.1, 0.16),
    d,
    c,
    between(random, 0, 3),
    between(random, -0.3, 0.3),
    between(random, -0.35, 0.35),
  );

  for (let k = 0; k < 3; k++) {
    p.bar(
      x + between(random, -w / 3, w / 3),
      y + 0.12,
      z + between(random, -d / 3, d / 3),
      between(random, 0.5, 0.9),
      0.02,
      pick(random, RUSTY),
      between(random, 0, 3),
      between(random, -0.6, 0.6),
      between(random, -0.5, 0.5),
    );
  }
}

/** The big pile: mixed construction debris, concentrated in one corner. */
function heapPieces(
  p: Pieces,
  random: () => number,
  heaps: readonly Heap[],
): void {
  const area = heaps.reduce(
    (a, h) => ({
      minX: Math.min(a.minX, h.minX),
      maxX: Math.max(a.maxX, h.maxX),
      minZ: Math.min(a.minZ, h.minZ),
      maxZ: Math.max(a.maxZ, h.maxZ),
    }),
    { minX: 99, maxX: -99, minZ: 99, maxZ: -99 },
  );
  // A point in the pile (inside the walls) and how high its surface is there.
  const spot = (): { x: number; z: number; h: number } => {
    for (let tries = 0; tries < 20; tries++) {
      const x = between(random, area.minX, area.maxX);
      const z = between(random, area.minZ, area.maxZ);
      const h = heapHeight(heaps, x, z);

      if (h > 0.05 && random() * 1.15 < h + 0.1) {
        return { x, z, h };
      }
    }

    return { x: area.minX + 0.4, z: area.minZ + 0.4, h: 0.3 };
  };

  // Broken concrete: chunks of every size, the biggest low down, some slabs.
  for (let k = 0; k < 85; k++) {
    const { x, z, h } = spot();
    const size = between(random, 0.28, 0.85);
    const buried = random() * 0.35;

    p.elements.push({
      shape: "chunk",
      x,
      y: Math.max(size * 0.25, h * between(random, 0.5, 1.05) - buried),
      z,
      sx: size,
      sy: size * between(random, 0.5, 0.8),
      sz: size * between(random, 0.6, 1),
      rx: between(random, -0.5, 0.5),
      ry: between(random, 0, 6.28),
      rz: between(random, -0.5, 0.5),
      color: pick(random, CONCRETE),
    });
  }

  for (let k = 0; k < 11; k++) {
    const { x, z, h } = spot();

    slab(p, random, x, h * between(random, 0.3, 0.9), z);
  }

  // Bricks, loose and in broken clusters; plaster fragments among them.
  for (let k = 0; k < 160; k++) {
    const { x, z, h } = spot();

    p.elements.push({
      shape: "brick",
      x,
      y: h * between(random, 0.15, 1.0) + 0.04,
      z,
      sx: 0.22,
      sy: 0.07,
      sz: 0.105,
      rx: between(random, -0.6, 0.6),
      ry: between(random, 0, 6.28),
      rz: between(random, -0.6, 0.6),
      color: pick(random, BRICK),
    });
  }

  for (let k = 0; k < 18; k++) {
    const { x, z, h } = spot();

    p.elements.push({
      shape: "chunk",
      x,
      y: h * between(random, 0.3, 1) + 0.05,
      z,
      sx: between(random, 0.14, 0.26),
      sy: 0.07,
      sz: between(random, 0.12, 0.2),
      rx: between(random, -0.3, 0.3),
      ry: between(random, 0, 6.28),
      rz: between(random, -0.3, 0.3),
      color: shade(PLASTER, between(random, 0.8, 1.1)),
    });
  }

  // Rebar and bent steel bars, short pipes and scrap strips, all at angles.
  for (let k = 0; k < 26; k++) {
    const { x, z, h } = spot();

    p.bar(
      x,
      h * between(random, 0.4, 1) + 0.08,
      z,
      between(random, 0.9, 2.0),
      0.022,
      pick(random, RUSTY),
      between(random, 0, 6.28),
      between(random, -0.7, 0.7),
      between(random, -0.6, 0.6),
    );
  }

  for (let k = 0; k < 7; k++) {
    const { x, z, h } = spot();

    p.bar(
      x,
      h * between(random, 0.4, 1) + 0.1,
      z,
      between(random, 0.6, 1.3),
      between(random, 0.05, 0.1),
      pick(random, [PIPE, DARK[0], RUSTY[2], STEEL_BARE]),
      between(random, 0, 6.28),
      between(random, -0.5, 0.5),
      between(random, -0.4, 0.4),
    );
  }

  // Bent sheet metal: two panels joined at a bend.
  for (let k = 0; k < 5; k++) {
    const { x, z, h } = spot();
    const y = h * between(random, 0.4, 1);
    const color = pick(random, [...RUSTY, ...DARK]);
    const ry = between(random, 0, 6.28);

    p.box(x, y, z, 0.95, 0.015, 0.55, color, ry, between(random, 0.1, 0.4));
    p.box(
      x + Math.cos(ry) * 0.45,
      y + 0.1,
      z - Math.sin(ry) * 0.45,
      0.7,
      0.015,
      0.5,
      shade(color, 0.85),
      ry + 0.3,
      between(random, -0.7, -0.3),
    );
  }

  // Broken planks and boards, splintered crate pieces.
  for (let k = 0; k < 22; k++) {
    const { x, z, h } = spot();
    const c = pick(random, WOOD);

    p.box(
      x,
      h * between(random, 0.35, 1),
      z,
      between(random, 0.5, 1.8),
      0.035,
      between(random, 0.08, 0.2),
      c,
      between(random, 0, 6.28),
      between(random, -0.5, 0.5),
      between(random, -0.2, 0.2),
    );
  }

  // Cable bundles and conduit sticking out of the heap.
  for (let k = 0; k < 13; k++) {
    const { x, z, h } = spot();
    const y = h * between(random, 0.4, 1) + 0.05;

    for (let s = 0; s < 3; s++) {
      p.cable(
        x + s * 0.03,
        y + s * 0.03,
        z,
        between(random, 0.7, 1.4),
        between(random, 0.035, 0.055),
        BLACK,
        between(random, 0, 6.28),
        between(random, -0.5, 0.5),
        between(random, -0.4, 0.4),
      );
    }
  }

  // Machine parts and brackets, a couple of damaged containers, some tools.
  for (let k = 0; k < 5; k++) {
    const { x, z, h } = spot();
    const y = h * between(random, 0.5, 1);

    p.cableUp(
      x,
      y,
      z,
      between(random, 0.2, 0.34),
      0.24,
      pick(random, [DRUM_BLUE, DARK[1], RUSTY[2]]),
    );
    p.cableUp(x, y + 0.3, z, 0.03, 0.12, STEEL_BARE);
    p.box(x + 0.18, y, z, 0.1, 0.16, 0.18, DARK[2], between(random, 0, 3));
    p.box(
      x - 0.2,
      y,
      z + 0.05,
      0.18,
      0.04,
      0.05,
      RUSTY[0],
      between(random, 0, 3),
      0,
      0.3,
    );
  }

  for (const c of [DRUM_RED, DARK[3]]) {
    const { x, z, h } = spot();
    const y = h * 0.7;

    p.box(x, y, z, 0.5, 0.03, 0.4, c, 0, 0.4, 0.15);
    p.box(x, y + 0.03, z - 0.19, 0.5, 0.24, 0.02, c, 0, 0.4, 0.15);
    p.box(x + 0.24, y + 0.03, z, 0.02, 0.2, 0.4, c, 0, 0.4, 0.5);
  }

  for (let k = 0; k < 4; k++) {
    const { x, z, h } = spot();
    const y = h * 0.9 + 0.05;
    const ry = between(random, 0, 6.28);

    // A hammer: a handle and a head.
    p.bar(x, y, z, 0.4, 0.03, TIMBER_DARK, ry);
    p.box(
      x + Math.cos(ry) * 0.2,
      y - 0.03,
      z - Math.sin(ry) * 0.2,
      0.07,
      0.06,
      0.1,
      DARK[0],
      ry,
    );
  }
}

/** A cable spool on its side: two flanges, a core, wire wound on it and a loose end. */
function spool(p: Pieces, x: number, z: number, d: number, tall: number): void {
  p.cableUp(x, 0, z, 0.05, d, TIMBER_B);
  p.cableUp(x, tall - 0.05, z, 0.05, d, TIMBER_B);
  p.cableUp(x, 0.05, z, tall - 0.1, d * 0.4, TIMBER_DARK);
  p.cableUp(x, 0.07, z, tall - 0.14, d * 0.7, BLACK);

  for (const y of [0.0, tall - 0.05]) {
    p.bar(x, y + 0.025, z, d * 0.9, 0.02, shade(TIMBER_B, 0.8), 0.9);
  }

  p.cable(x - d / 2 - 0.4, 0.04, z + 0.1, 0.9, 0.04, BLACK, 0.2);
}

/** The ceiling's beams, tray, pipe and lamps, and the walls' conduit and stains. */
function overhead(map: MapBuilder, F: number): void {
  const p = new Pieces();

  // Steel conduit along the north wall (with clamps) and junction boxes,
  // one of them hanging open.
  p.bar(-7.5, 2.65, -23.62, 12.0, 0.05, STEEL_BARE, 0);
  p.bar(-7.5, 2.78, -23.62, 12.0, 0.035, PIPE, 0);

  for (const x of [-13.0, -10.5, -8.0, -5.5, -3.0, -1.9]) {
    p.box(x, 2.6, -23.64, 0.06, 0.14, 0.04, CHARCOAL);
  }

  p.box(-12.2, 1.7, -23.6, 0.3, 0.34, 0.16, 0x3a3f46);
  p.box(-12.2, 1.7, -23.51, 0.26, 0.3, 0.012, BLACK);
  p.post(-12.28, 2.04, -23.62, 0.55, 0.035, STEEL_BARE);
  // (Open, its cover hanging off one hinge and wires out of it.)
  p.box(-2.2, 1.9, -23.6, 0.3, 0.34, 0.16, 0x3a3f46);
  p.box(-2.0, 1.75, -23.47, 0.3, 0.32, 0.012, 0x4a4f55, 0, 0.5, 0.3);

  for (let k = 0; k < 3; k++) {
    p.cable(
      -2.2,
      1.9 - k * 0.1,
      -23.45,
      0.4,
      0.025,
      BLACK,
      0.3,
      0,
      0.6 + k * 0.4,
    );
  }

  // Water stains and rust streaks under the conduit and pipes, cracks.
  for (const [x, w] of [
    [-9.0, 0.7],
    [-4.4, 0.5],
    [-12.0, 0.45],
    [-6.2, 0.35],
  ] as const) {
    p.box(x, 1.3, -23.685, w * 0.8, 1.0, 0.006, DAMP);
    p.box(x + 0.1, 0.4, -23.672, 0.1, 2.2, 0.006, RUSTY[0]);
  }

  for (const [x, y, h, tilt] of [
    [-10.2, 1.6, 1.0, 0.15],
    [-5.0, 0.8, 0.8, -0.2],
    [-1.6, 1.4, 0.9, 0.1],
  ] as const) {
    p.box(x, y, -23.66, 0.012, h, 0.004, BLACK, 0, tilt);
  }

  // A pipe run on the west wall (the door that was there is walled up).
  p.bar(-13.58, 2.4, -20.0, 7.2, 0.09, PIPE, Math.PI / 2);
  p.bar(-13.58, 2.2, -20.0, 7.2, 0.06, STEEL_BARE, Math.PI / 2);

  for (const z of [-22.8, -18.2, -16.9]) {
    p.box(-13.6, 2.15, z, 0.06, 0.4, 0.06, CHARCOAL);
  }

  p.box(-13.685, 0.0, -18.2, 0.01, 1.2, 0.3, DAMP);
  // The crawl hole in the west wall (z -17.9 to -16.3, 1.2 m high), knocked
  // through and left raw: broken concrete along its edges, bent rebar, a
  // crooked plank and a rusty sheet propped over the top, a cable draped
  // across it. Nothing is square or tidy.
  for (const [z, y, size, ry] of [
    [-17.78, 1.12, 0.3, 0.4],
    [-17.45, 1.2, 0.22, 1.7],
    [-17.0, 1.16, 0.34, 2.6],
    [-16.62, 1.2, 0.26, 0.9],
    [-16.38, 1.08, 0.2, 2.1],
    [-17.86, 0.62, 0.24, 1.2],
    [-17.84, 0.1, 0.3, 0.2],
    [-16.4, 0.5, 0.22, 2.9],
    [-16.36, 0.08, 0.26, 1.4],
  ] as const) {
    p.elements.push({
      shape: "chunk",
      x: -13.6,
      y: y + size * 0.3,
      z,
      sx: size,
      sy: size * 0.7,
      sz: size * 0.9,
      rx: 0.3 * Math.sin(z * 9),
      ry,
      rz: 0.35 * Math.cos(z * 7),
      color: CONCRETE[Math.floor(Math.abs(z * 10)) % CONCRETE.length],
    });
  }

  // Rebar, bent out of the broken edge.
  for (const [z, y, len, ry, rz, rx] of [
    [-17.6, 1.22, 0.7, 0.5, 0.4, 0.2],
    [-16.85, 1.25, 0.55, -0.4, -0.3, 0.5],
    [-17.85, 0.4, 0.6, 0.9, 0.1, 0.6],
    [-16.4, 0.3, 0.5, -0.7, 0.2, -0.4],
  ] as const) {
    p.bar(
      -13.5,
      y,
      z,
      len,
      0.022,
      RUSTY[Math.abs(Math.round(z * 3)) % 5],
      ry,
      rz,
      rx,
    );
  }

  // A rusty sheet leaned crooked over the top-left, a plank wedged under it,
  // and a cable looped across the opening.
  p.box(-13.52, 0.95, -17.55, 0.03, 0.5, 0.75, RUSTY[1], 0, 0.3, 0.45);
  p.box(-13.45, 0, -17.3, 0.05, 0.14, 1.3, WOOD[2], 0, 0.9, 0.8);
  p.cable(-13.5, 1.0, -17.1, 1.3, 0.035, BLACK, 0, 0.5, 0.25);

  // Chipped plaster: pale flakes low on the south wall and by the pile.
  p.box(-11.4, 0.0, -16.31, 0.5, 0.35, 0.006, PLASTER, 0, 0, 0.2);
  p.box(-3.5, 0.2, -16.31, 0.4, 0.5, 0.006, PLASTER, 0, 0, -0.3);

  // Ceiling: three I-beams across the room (the lamps hang from them), a
  // cable tray along the north side and a pipe along the south.
  for (const x of [-10.5, -6.0, -2.8]) {
    p.box(x, 3.5, -20.0, 0.22, 0.04, 7.4, GUNMETAL);
    p.box(x, 3.67, -20.0, 0.22, 0.04, 7.4, GUNMETAL);
    p.box(x, 3.54, -20.0, 0.05, 0.13, 7.4, CHARCOAL);
  }

  p.box(-7.5, 3.4, -23.2, 12.0, 0.04, 0.4, 0x4f5f74);

  for (const dz of [-0.2, 0.2]) {
    p.box(-7.5, 3.44, -23.2 + dz, 12.0, 0.1, 0.03, 0x4f5f74);
  }

  for (let k = 0; k < 20; k++) {
    p.bar(-13.2 + k * 0.6, 3.46, -23.2, 0.5, 0.05, k % 3 ? BLACK : 0x6a3a35);
  }

  // Cable hanging in loops out of the tray (a few, short of the floor).
  for (const [x, drop] of [
    [-8.6, 0.9],
    [-4.0, 0.6],
  ] as const) {
    p.cableUp(x, 3.4 - drop, -23.2, drop, 0.035, BLACK);
    p.cable(x + 0.12, 3.4 - drop, -23.2, 0.3, 0.035, BLACK, 0, 0, 0.8);
  }

  p.bar(-7.5, 3.56, -17.2, 12.0, 0.12, PIPE, 0);

  for (const x of [-12.0, -8.0, -4.0, -2.0]) {
    p.bar(x, 3.56, -17.2, 0.05, 0.18, CHARCOAL, 0);
  }

  // Caged lamps on chains over the pile, the middle and the fuel pool.
  for (const [x, z, drop] of [
    [-10.5, -20.5, 0.85],
    [-6.0, -20.5, 0.8],
    [-2.8, -18.4, 0.95],
  ] as const) {
    cagedLamp(p, x, z, drop);
  }

  // The floor: dust on the concrete and oil stains, a split bag of cement.
  p.box(-7.5, 0, -19.4, 1.0, 0.004, 0.7, OIL, 0.3);
  p.box(-9.6, 0, -18.4, 0.7, 0.004, 0.5, DAMP, 1.2);
  p.box(-7.5, 0, -23.65, 12.0, 0.45, 0.01, 0x1b1d1d);
  p.box(-13.65, 0, -20.8, 0.01, 0.45, 5.8, 0x1b1d1d);
  p.chunk(-6.0, 0, -17.0, 0.22, 0x8a8478, 0.4);

  map.createFitting("fittings-junk-wall", F, p.elements, []);
}

/** An old caged lamp on a chain: a steel shade, a bulb, a wire cage. */
function cagedLamp(p: Pieces, x: number, z: number, drop: number): void {
  const top = 3.8 - 0.08;
  const y = top - drop;

  p.cableUp(x, y + 0.34, z, drop - 0.34, 0.012, BLACK);

  for (let k = 0; k < 6; k++) {
    p.box(x, y + 0.34 + k * 0.07, z, 0.03, 0.05, 0.016, GUNMETAL, k * 0.8);
  }

  p.post(x, y + 0.2, z, 0.12, 0.34, 0x3a3f46);
  p.post(x, y + 0.15, z, 0.05, 0.1, 0xe3d6b0);
  p.post(x, y + 0.06, z, 0.12, 0.18, 0xe8dcb0);

  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI;

    p.bar(x, y + 0.1, z, 0.22, 0.012, STEEL_BARE, a, Math.PI / 2 - 0.15);
  }

  p.post(x, y, z, 0.012, 0.22, GUNMETAL);
}

export function furnishJunkRoom(map: MapBuilder, floorY: number): void {
  const F = floorY;
  const random = rng(31337);

  // ----------------------------------- the big pile, north-west (back) corner
  // Its three hidden boxes follow the heap's steps: a high core in the
  // corner, a lower shoulder along the north wall and another down the west.
  // It is a solid mound (the boxes are over 1.45 m, more than anyone can
  // vault or jump onto), so nobody stands on its uneven top or in its corner.
  const heaps: Heap[] = [
    { minX: X0, maxX: -11.5, minZ: Z0, maxZ: -21.5, top: 2.4, visual: 2.0 },
    { minX: -11.5, maxX: -9.9, minZ: Z0, maxZ: -22.2, top: 1.5, visual: 1.35 },
    { minX: X0, maxX: -12.5, minZ: -21.5, maxZ: -21.0, top: 1.5, visual: 1.3 },
  ];
  {
    const p = new Pieces();

    heapPieces(p, random, heaps);
    map.createFitting("junk-pile", F, p.elements, heaps);
  }

  // ------------------------------------------- the fallen rack, west wall
  // Lying on its side (its uprights run east, the shelves' decks stand on
  // end), turned a little, with the low edge on the floor and the other
  // propped up on rubble. It fills x -13.7 to -11.2, z -21.0 to -17.8.
  {
    const p = new Pieces();
    const m = new THREE.Matrix4()
      .makeTranslation(-13.65, 0, -19.4)
      .multiply(new THREE.Matrix4().makeRotationY(0.1))
      .multiply(new THREE.Matrix4().makeRotationZ(0.14))
      .multiply(
        // Local x (length) to world z, local y (up) to world x, local z to world y.
        new THREE.Matrix4().makeBasis(
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(0, 1, 0),
        ),
      );
    const f = new Frame(p, m);

    buildRack(f, random, 2.8, 2.2, 0.8, [0.15, 0.75, 1.35, 1.95], 3, 0.3, 0.55);
    // The frame's lowest side rests on the floor at y = D/2 = 0.4 (its depth);
    // lift everything so the deck of uprights sits on it.
    for (const e of p.elements) {
      e.y += 0.46;
    }

    // Rubble under the raised end and a split box it fell on.
    p.chunk(-13.4, 0, -20.7, 0.4, pick(random, CONCRETE), 0.6);
    p.chunk(-13.3, 0, -17.9, 0.34, pick(random, CONCRETE), 2.1);
    p.box(-11.2, 0, -18.9, 0.42, 0.18, 0.34, TIMBER_B, 0.4, 0, 0.05);

    map.createFitting("rack-junk-fallen", F, p.elements, [
      { minX: X0, maxX: -11.2, minZ: -21.0, maxZ: -17.8, top: 0.95 },
    ]);
  }

  // ---------------------------------- the standing rack, north wall (tall)
  {
    const p = new Pieces();
    const f = new Frame(
      p,
      new THREE.Matrix4().makeTranslation(-5.6, 0, -23.25),
    );

    buildRack(f, random, 3.4, 2.6, 0.8, [0.12, 0.7, 1.28, 1.86, 2.4], 4, 0.95);
    // Spilled to the floor at its foot: a coil, a box, conduit and bricks.
    p.cable(-5.3, 0.04, -22.5, 1.4, 0.04, BLACK, 0.3);
    p.cableUp(-6.8, 0, -22.6, 0.14, 0.5, BLACK);
    p.box(-4.6, 0, -22.55, 0.4, 0.22, 0.3, TIMBER_B, 0.5);
    p.bar(-6.1, 0.04, -22.4, 1.1, 0.04, PIPE, 0.25);

    for (let k = 0; k < 5; k++) {
      p.elements.push({
        shape: "brick",
        x: -4.2 + k * 0.17 + between(random, -0.05, 0.05),
        y: 0.04,
        z: -22.4 + between(random, -0.1, 0.1),
        sx: 0.22,
        sy: 0.07,
        sz: 0.105,
        rx: 0,
        ry: between(random, 0, 3),
        rz: 0,
        color: pick(random, BRICK),
      });
    }

    map.createFitting("rack-junk-standing", F, p.elements, [
      { minX: -7.3, maxX: -3.9, minZ: Z0, maxZ: -22.8, top: 2.45 },
    ]);
  }

  // ---------------------------------------------------------------- drums
  {
    const p = new Pieces();

    // Two by the pile's edge, one upright (a dent), one on its side.
    drumUp(p, -9.5, -23.25, DRUM_BLUE, true);
    drumSide(p, -8.4, -23.4, 0.15, DRUM_RED);
    map.createFitting("drums-junk-pile", F, p.elements, [
      { minX: -9.8, maxX: -9.2, minZ: Z0, maxZ: -22.95, top: 0.9 },
      { minX: -8.84, maxX: -7.96, minZ: Z0, maxZ: -23.1, top: 0.6 },
    ]);
  }

  {
    const p = new Pieces();

    // The leaking drum, on its side in the north-east corner: a dent, a
    // rusty split near its low side, and the oil running out of it.
    drumSide(p, -1.9, -23.3, 0.2, DRUM_GREEN);
    p.box(-2.1, 0.12, -22.98, 0.18, 0.1, 0.03, shade(DRUM_GREEN, 0.45));
    p.box(-2.3, 0.04, -22.97, 0.1, 0.07, 0.035, RUSTY[1]);
    p.box(-1.7, 0.3, -22.97, 0.16, 0.24, 0.04, shade(DRUM_GREEN, 0.7), 0.4);
    map.createFitting("drum-junk-leak", F, p.elements, [
      { minX: -2.4, maxX: -1.4, minZ: Z0, maxZ: -22.93, top: 0.6 },
    ]);
  }

  // ----------------------------------------------- the spool, south-east
  {
    const p = new Pieces();

    spool(p, -2.35, -17.15, 1.05, 0.55);
    map.createFitting("spool-junk", F, p.elements, [
      { minX: -2.9, maxX: -1.8, minZ: -17.7, maxZ: -16.6, top: 0.55 },
    ]);
  }

  // ------------- loose scraps round the edges, cables spilled from the pile
  {
    const p = new Pieces();

    // Cables that spill from the pile along the north wall and from the rack.
    cableRun(p, random, -10.2, -22.9, 0, 4, 4);
    cableRun(p, random, -11.1, -20.5, -1.2, 3, 3);
    cableRun(p, random, -3.4, -21.0, 3.3, 3, 3);
    cableRun(p, random, -11.0, -17.0, 0.35, 3, 3);

    // A big cable coil beside the south wall and a heavy bundle by the door.
    p.cableUp(-10.2, 0, -16.8, 0.18, 0.62, BLACK);
    p.cableUp(-10.2, 0.18, -16.8, 0.12, 0.54, shade(BLACK, 1.5));
    cableRun(p, random, -6.2, -16.7, 0.25, 3, 5);

    // Low scraps along the edges of the middle (nothing over 0.25 m).
    for (const [x, z] of [
      [-10.1, -21.3],
      [-9.6, -17.6],
      [-4.2, -21.3],
      [-4.9, -17.4],
      [-3.4, -19.0],
      [-11.0, -19.1],
      [-8.1, -22.0],
      [-5.0, -21.4],
    ] as const) {
      const roll = random();

      if (roll < 0.4) {
        p.chunk(
          x,
          0,
          z,
          between(random, 0.15, 0.3),
          pick(random, CONCRETE),
          random() * 3,
        );
      } else if (roll < 0.7) {
        for (let k = 0; k < 3; k++) {
          p.elements.push({
            shape: "brick",
            x: x + k * 0.16,
            y: 0.035 + (k === 1 ? 0.07 : 0),
            z: z + between(random, -0.08, 0.08),
            sx: 0.22,
            sy: 0.07,
            sz: 0.105,
            rx: 0,
            ry: between(random, 0, 3),
            rz: 0,
            color: pick(random, BRICK),
          });
        }
      } else {
        p.bar(
          x,
          0.025,
          z,
          between(random, 0.5, 0.9),
          0.025,
          pick(random, RUSTY),
          random() * 3,
        );
      }
    }

    // Wire and a rusty plate along the west wall, bricks under the rack.
    p.box(-11.3, 0, -16.7, 0.7, 0.012, 0.4, RUST, 0.5);
    map.createFitting("scraps-junk", F, p.elements, []);
  }

  overhead(map, F);

  // Dust and grime on the concrete: round the pile and the fallen rack, and
  // a worn path down the middle.
  for (const [id, x, z, w, d, rotation, color, alpha] of [
    ["pile", -11.6, -21.6, 4.4, 3.6, 0.2, 0x4a4842, 0.45],
  ] as const) {
    map.addDecal({
      id: `decal-room-junk-${id}`,
      kind: "dust",
      x,
      z,
      y: F,
      width: w,
      depth: d,
      rotation,
      color,
      alpha,
    });
  }

  map.addFuelSpill({
    id: JUNK_FUEL_SPILL.id,
    x: JUNK_FUEL_SPILL.x,
    y: F,
    z: JUNK_FUEL_SPILL.z,
    radius: JUNK_FUEL_SPILL.radius,
    source: { ...JUNK_FUEL_SPILL.source },
    path: JUNK_FUEL_SPILL.path.map((point) => ({ ...point })),
    lobes: JUNK_FUEL_SPILL.lobes.map((lobe) => ({ ...lobe })),
    fire: { ...JUNK_FUEL_SPILL.fire },
    signs: JUNK_FUEL_SPILL.signs.map((sign) => ({ ...sign })),
  });
}
