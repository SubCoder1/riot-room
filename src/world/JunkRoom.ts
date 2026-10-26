import * as THREE from "three";

import type { PileElement } from "./ArenaLayout";
import { Pieces, rng } from "./FittingPieces";
import { halfExtents, type MapBuilder } from "./MapParts";
import { meshExtent } from "./PileMeshes";
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
 *   - the beams, cable tray, pipe and hanging bulbs overhead.
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
  /** 0 for a sound rack; up to 1 for one that has failed: bent and shortened uprights, loose beams and decks. */
  wreck = 0,
): void {
  const bay = length / bays;

  for (let k = 0; k <= bays; k++) {
    const x = -length / 2 + k * bay;

    for (const z of [-depth / 2, depth / 2]) {
      // A failed rack: some uprights snapped short, the rest bowed.
      const snapped = wreck > 0 && random() < 0.5 * wreck;

      f.box(
        x,
        0,
        z,
        0.07,
        snapped ? height * between(random, 0.4, 0.75) : height,
        0.06,
        shade(UPRIGHT, between(random, 0.8, 1.1)),
        wreck * between(random, -0.05, 0.05),
        0,
        wreck * between(random, -0.12, 0.12) * (snapped ? 2 : 1),
      );
      f.box(x, 0, z, 0.16, 0.012, 0.16, DARK[0]);
    }
  }

  for (const y of levels) {
    for (const z of [-depth / 2, depth / 2]) {
      // A beam torn out of its uprights is simply gone.
      if (wreck > 0 && random() < 0.3 * wreck) {
        continue;
      }

      f.box(
        0,
        y,
        z,
        length,
        0.09,
        0.05,
        shade(BEAM, between(random, 0.75, 1.05)),
        0,
        wreck * between(random, -0.06, 0.06),
        wreck * between(random, -0.1, 0.1),
      );
    }

    for (let b = 0; b < bays; b++) {
      const x = -length / 2 + (b + 0.5) * bay;
      const roll = random();

      if (roll < deckLoss) {
        continue;
      }

      // A failed rack's decks have come away: dropped on one side, askew.
      const loose = wreck > 0 && random() < 0.85 * wreck;
      const drop = loose
        ? between(random, 0.2, 0.55) * (random() < 0.5 ? -1 : 1)
        : 0;

      f.box(
        x,
        y + 0.09 - (loose ? between(random, 0, 0.06) : 0),
        loose ? between(random, -0.18, 0.18) : 0,
        bay - 0.05,
        0.025,
        depth - 0.05,
        shade(DECK, between(random, 0.8, 1.2)),
        loose ? drop : roll > 0.85 ? between(random, 0.04, 0.09) : 0,
        loose ? between(random, -0.3, 0.3) : 0,
        loose ? between(random, -0.1, 0.1) : 0,
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
  /** Kept as given (the mound is a solid block, however it is drawn). */
  exact?: boolean;
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

/**
 * Slabs standing on the floor with their top edge against the walls the pile
 * is in the corner of: each is held by the wall and the floor, nothing else.
 * They are set first and registered on the ground map, so the rest of the
 * pile goes round and over them.
 */
function leanSlabs(p: Pieces, random: () => number, ground: Ground): void {
  const lean = (
    wall: "west" | "north",
    along: number,
    width: number,
    length: number,
  ): void => {
    const t = between(random, 0.2, 0.3);
    const a = between(random, 0.5, 0.75);
    const rise = (width / 2) * Math.sin(a) + (t / 2) * Math.cos(a);
    const out = (width / 2) * Math.cos(a) + (t / 2) * Math.sin(a) + 0.03;
    const colour = pick(random, CONCRETE);

    const put = (e: PileElement): void => {
      p.elements.push(e);
      ground.occupy(e);
    };

    if (wall === "west") {
      // Its high end toward the wall (the -x end up): a turn about z.
      put({
        shape: "slab",
        x: X0 + out,
        y: rise,
        z: along,
        sx: width,
        sy: t,
        sz: length,
        rx: 0,
        ry: 0,
        rz: -a,
        color: colour,
      });
    } else {
      put({
        shape: "slab",
        x: along,
        y: rise,
        z: Z0 + out,
        sx: length,
        sy: t,
        sz: width,
        rx: a,
        ry: 0,
        rz: 0,
        color: colour,
      });
    }
  };

  lean("west", -22.9, between(random, 1.2, 1.5), between(random, 0.9, 1.2));
  lean("west", -21.9, between(random, 1.0, 1.3), between(random, 0.7, 1.0));
  lean("north", -12.4, between(random, 1.1, 1.4), between(random, 0.9, 1.2));
}

/**
 * What a pile is made of so far, as a height map, so every new piece is
 * lowered onto it by its real shape: the underside of the turned box over each
 * map cell it covers, not its centre or its origin. A piece comes to rest on
 * the highest thing under any part of it (the floor, a slab, a rock), and
 * then raises the map under itself for the next piece.
 *
 * Long thin pieces (girders, pipes, rods, boards) are laid across: both ends
 * are set to the height of what is under them, and the whole piece is lifted
 * just enough to clear anything between, so each rests on something at each
 * end instead of hanging from where its middle happens to be.
 */
interface LayPlan {
  x: number;
  z: number;
  yaw: number;
  length: number;
  reach: number;
  samples: number;
  dx: number;
  dz: number;
  /** The heights of its two ends (the line it lies along). */
  a: number;
  b: number;
  /** How far it hangs above what is under its ends. */
  lift: number;
  /** Its centre height, and its slope. */
  y: number;
  pitch: number;
  r: number;
}

/** How badly a plan leaves a piece hanging or standing on end (lower is better). */
function layCost(plan: LayPlan): number {
  return (
    plan.lift +
    0.4 * Math.abs(plan.b - plan.a) +
    // Low is better: loose steel and cable lie near the floor, not on the top.
    1.2 * plan.y +
    Math.max(Math.abs(plan.pitch) - 0.12, 0) * 12
  );
}

class Ground {
  private static readonly CELL = 0.05;

  private readonly minX: number;
  private readonly minZ: number;
  private readonly nx: number;
  private readonly nz: number;
  private readonly height: Float32Array;
  /** The walls the pile is in the corner of: nothing pokes through them. */
  private readonly wallX: number;
  private readonly wallZ: number;

  constructor(
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    wallX: number,
    wallZ: number,
  ) {
    this.minX = minX;
    this.minZ = minZ;
    this.nx = Math.ceil((maxX - minX) / Ground.CELL);
    this.nz = Math.ceil((maxZ - minZ) / Ground.CELL);
    this.height = new Float32Array(this.nx * this.nz);
    this.wallX = wallX;
    this.wallZ = wallZ;
  }

  /** The height of the pile at a point (0 on the bare floor). */
  public at(x: number, z: number): number {
    const i = Math.floor((x - this.minX) / Ground.CELL);
    const k = Math.floor((z - this.minZ) / Ground.CELL);

    if (i < 0 || k < 0 || i >= this.nx || k >= this.nz) {
      return 0;
    }

    return this.height[k * this.nx + i];
  }

  /** The slope of the pile's surface at a point: how it rises per metre in x and in z. */
  public slope(x: number, z: number, d: number): [number, number] {
    return [
      (this.at(x + d, z) - this.at(x - d, z)) / (2 * d),
      (this.at(x, z + d) - this.at(x, z - d)) / (2 * d),
    ];
  }

  /** The highest the pile gets within `radius` of a point. */
  public highest(x: number, z: number, radius: number): number {
    let best = 0;

    for (let dx = -radius; dx <= radius + 1e-9; dx += Ground.CELL) {
      for (let dz = -radius; dz <= radius + 1e-9; dz += Ground.CELL) {
        best = Math.max(best, this.at(x + dx, z + dz));
      }
    }

    return best;
  }

  /** The turned box's rows (world x, y, z) and its half sizes. */
  private static frame(
    e: PileElement,
    shrink: number,
  ): { m: number[][]; h: number[] } {
    const ca = Math.cos(e.rx);
    const sa = Math.sin(e.rx);
    const cb = Math.cos(e.ry);
    const sb = Math.sin(e.ry);
    const cc = Math.cos(e.rz);
    const sc = Math.sin(e.rz);

    return {
      m: [
        [cb * cc, -cb * sc, sb],
        [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
        [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
      ],
      h: [(e.sx / 2) * shrink, (e.sy / 2) * shrink, (e.sz / 2) * shrink],
    };
  }

  /**
   * Where the box (centre at height 0) is, vertically, over the column at
   * (dx, dz) from its centre: [underside, top], or null if the column misses.
   */
  private static span(
    m: number[][],
    h: number[],
    dx: number,
    dz: number,
  ): [number, number] | null {
    const top = 100;
    let tMin = -Infinity;
    let tMax = Infinity;

    for (let i = 0; i < 3; i++) {
      // The vertical ray, in the box's own axes.
      const o = m[0][i] * dx + m[1][i] * top + m[2][i] * dz;
      const d = -m[1][i];

      if (Math.abs(d) < 1e-9) {
        if (Math.abs(o) > h[i]) {
          return null;
        }

        continue;
      }

      const t1 = (-h[i] - o) / d;
      const t2 = (h[i] - o) / d;

      tMin = Math.max(tMin, Math.min(t1, t2));
      tMax = Math.min(tMax, Math.max(t1, t2));
    }

    return tMin > tMax ? null : [top - tMax, top - tMin];
  }

  /** The columns a box covers: [cell x, cell z, under, over] for each. */
  private columns(
    e: PileElement,
    shrink: number,
  ): Array<[number, number, number, number]> {
    const { m, h } = Ground.frame(e, shrink);
    const ax =
      Math.abs(m[0][0]) * h[0] +
      Math.abs(m[0][1]) * h[1] +
      Math.abs(m[0][2]) * h[2];
    const az =
      Math.abs(m[2][0]) * h[0] +
      Math.abs(m[2][1]) * h[1] +
      Math.abs(m[2][2]) * h[2];
    const out: Array<[number, number, number, number]> = [];
    const step = Ground.CELL;

    for (let dx = -ax; dx <= ax + 1e-9; dx += step) {
      for (let dz = -az; dz <= az + 1e-9; dz += step) {
        const s = Ground.span(m, h, dx, dz);

        if (s) {
          out.push([e.x + dx, e.z + dz, s[0], s[1]]);
        }
      }
    }

    return out;
  }

  private raise(x: number, z: number, to: number): void {
    const i = Math.floor((x - this.minX) / Ground.CELL);
    const k = Math.floor((z - this.minZ) / Ground.CELL);

    if (i >= 0 && k >= 0 && i < this.nx && k < this.nz) {
      const at = k * this.nx + i;

      this.height[at] = Math.max(this.height[at], to);
    }
  }

  /** Keeps the piece inside the two walls (shifting it in, never turning it). */
  private inside(e: PileElement, shrink: number): void {
    const { m, h } = Ground.frame(e, shrink);
    const ax =
      Math.abs(m[0][0]) * h[0] +
      Math.abs(m[0][1]) * h[1] +
      Math.abs(m[0][2]) * h[2];
    const az =
      Math.abs(m[2][0]) * h[0] +
      Math.abs(m[2][1]) * h[1] +
      Math.abs(m[2][2]) * h[2];

    e.x = Math.max(e.x, this.wallX + ax + 0.02);
    e.z = Math.max(e.z, this.wallZ + az + 0.02);
  }

  /**
   * How high the centre of a lump would come to rest at its place: on the
   * highest thing under any part of it. Nothing is changed.
   */
  public restingHeight(e: PileElement, shrink = 1): number {
    this.inside(e, shrink);

    const heights: number[] = [];

    for (const [x, z, under] of this.columns(e, shrink)) {
      heights.push(this.at(x, z) - under);
    }

    if (heights.length === 0) {
      return this.at(e.x, e.z) + (e.sy / 2) * shrink;
    }

    heights.sort((a, b) => a - b);

    const highest = heights[heights.length - 1];

    // A big, heavy piece does not balance on its one highest point: it settles
    // onto the support under most of it, pressing a little into the high spots
    // (never more than a hand's depth), so no dark gap is left under a slab.
    const share = Math.max(Math.max(e.sx, e.sz) * shrink - 0.5, 0);
    const settle = Math.min(share * 0.12, 0.14);
    const bulk = heights[Math.floor(0.8 * (heights.length - 1))];

    return Math.max(bulk, highest - settle);
  }

  /**
   * Lowers a lump onto the pile and raises the map under it. `sink` is how far
   * it settles into what it rests on (rubble is not flat-faced: a hair of
   * overlap is contact, a gap is a piece in the air).
   */
  public rest(e: PileElement, shrink = 1, sink = 0): void {
    e.y = this.restingHeight(e, shrink) - sink;

    for (const [x, z, , over] of this.columns(e, shrink)) {
      this.raise(x, z, e.y + over);
    }
  }

  /** Records a piece that was set by hand (a leaning slab) so the rest go round it. */
  public occupy(e: PileElement): void {
    for (const [x, z, , over] of this.columns(e, 1)) {
      this.raise(x, z, e.y + over);
    }
  }

  /**
   * Works out how a long piece would lie, its length along `yaw`, centred at
   * (x, z): each end set on what is under it, then lifted just enough to
   * clear anything between. `lift` is how far that left it hanging above the
   * support at its ends (0 is a piece that rests at both). Nothing is changed.
   */
  public plan(
    x: number,
    z: number,
    yaw: number,
    length: number,
    thick: number,
    width: number,
  ): LayPlan {
    // Along local +x after the turn: (cos yaw, -sin yaw).
    const dx = Math.cos(yaw);
    const dz = -Math.sin(yaw);
    const reach = width / 2 + 0.02;
    const samples = Math.max(6, Math.ceil(length / 0.1));
    const profile: number[] = [];

    // Kept inside the walls: slid along if an end is out.
    const cx = Math.max(x, this.wallX + Math.abs(dx) * length * 0.5 + reach);
    const cz = Math.max(z, this.wallZ + Math.abs(dz) * length * 0.5 + reach);

    for (let s = 0; s <= samples; s++) {
      const t = s / samples - 0.5;

      profile.push(
        this.highest(cx + dx * length * t, cz + dz * length * t, reach),
      );
    }

    const r = thick / 2;
    const a0 = profile[0] + r;
    const b0 = profile[samples] + r;
    let lift = 0;

    for (let s = 0; s <= samples; s++) {
      const line = a0 + ((b0 - a0) * s) / samples;

      lift = Math.max(lift, profile[s] + r - line);
    }

    return {
      x: cx,
      z: cz,
      yaw,
      length,
      reach,
      samples,
      dx,
      dz,
      a: a0 + lift,
      b: b0 + lift,
      lift,
      y: (a0 + b0) / 2 + lift,
      pitch: Math.atan2(b0 - a0, length),
      r,
    };
  }

  /** Lays the piece a plan describes: raises the map under it. */
  public commit(plan: LayPlan): void {
    for (let s = 0; s <= plan.samples; s++) {
      const t = s / plan.samples - 0.5;

      this.stamp(
        plan.x + plan.dx * plan.length * t,
        plan.z + plan.dz * plan.length * t,
        plan.reach,
        plan.a + ((plan.b - plan.a) * s) / plan.samples + plan.r,
      );
    }
  }

  private stamp(x: number, z: number, radius: number, to: number): void {
    for (let dx = -radius; dx <= radius + 1e-9; dx += Ground.CELL) {
      for (let dz = -radius; dz <= radius + 1e-9; dz += Ground.CELL) {
        this.raise(x + dx, z + dz, to);
      }
    }
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
      // Clear of the two drums standing by the pile's edge.
      const nearDrum =
        Math.hypot(x + 9.5, z + 23.25) < 0.75 ||
        Math.hypot(x + 8.4, z + 23.4) < 0.75;

      if (!nearDrum && h > 0.05 && random() * 1.15 < h + 0.1) {
        return { x, z, h };
      }
    }

    return { x: area.minX + 0.4, z: area.minZ + 0.4, h: 0.3 };
  };

  // The pile is built from the floor up: every piece is lowered onto what is
  // already there by its real, turned shape (see Ground), largest first.
  const ground = new Ground(
    area.minX - 0.6,
    area.maxX + 0.6,
    area.minZ - 0.6,
    area.maxZ + 0.6,
    X0,
    Z0,
  );
  const lump = (
    shape: "rock" | "slab" | "chunk" | "brick" | "plank",
    x: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    tilt: number,
    color: number,
    shrink = 1,
    yaw = between(random, 0, 6.28),
    /** Other places to try: it settles where it comes to rest lowest (heavy things go to the floor and gaps). */
    tries = 0,
    source: () => number = random,
  ): void => {
    const e: PileElement = {
      shape,
      x,
      y: 0,
      z,
      sx,
      sy,
      sz,
      rx: between(source, -tilt, tilt),
      ry: yaw,
      rz: between(source, -tilt, tilt),
      color,
    };
    // (The small tilt it was given, kept as the way it sits on the surface.)
    const lean = { rx: e.rx, rz: e.rz };

    let lowest = ground.restingHeight(e, shrink);
    const home = { x: e.x, z: e.z };

    for (let n = 0; n < tries; n++) {
      const at = spot();

      e.x = at.x;
      e.z = at.z;

      const y = ground.restingHeight(e, shrink);

      if (y < lowest) {
        lowest = y;
        home.x = e.x;
        home.z = e.z;
      }
    }

    e.x = home.x;
    e.z = home.z;

    // It lies along the surface under it, not flat in the air over a slope: the
    // pile's slope there tips it (a brick on a leaning slab lies on the slab),
    // and the small turn it was given is a fraction of that.
    const d = Math.min(Math.max(Math.max(sx, sz) * 0.3, 0.08), 0.4);
    const [gx, gz] = ground.slope(e.x, e.z, d);
    const steep = Math.hypot(gx, gz);
    // (A big piece only leans a little: a slab stood up on a slope would tower.)
    const limit = Math.max(sx, sz) > 0.5 ? 0.2 : 0.35;
    const k = steep > limit ? limit / steep : 1;
    const normal = new THREE.Vector3(-gx * k, 1, -gz * k).normalize();
    const turn = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      normal,
    );

    turn
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)))
      .multiply(
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(lean.rx * 0.35, 0, lean.rz * 0.35),
        ),
      );

    const euler = new THREE.Euler().setFromQuaternion(turn, "XYZ");

    e.rx = euler.x;
    e.ry = euler.y;
    e.rz = euler.z;
    // Placed by what is drawn, not the box round it: a rounded rock or a
    // chipped slab is smaller than its box, so the box's underside is not
    // where its surface touches. The box is shrunk to the real height first
    // (so what lies on it rests on its true top), and the piece is then set
    // so its lowest drawn point is on the support.
    const real = meshExtent(e);
    let fit = shrink;

    if (real) {
      const box = halfExtents(e)[1];

      fit = Math.min(shrink, Math.max((real.high - real.low) / (2 * box), 0.5));
    }

    ground.rest(e, fit, 0.012);

    if (real) {
      const boxLow = -halfExtents(e)[1] * fit;

      // The gap between the box's underside and the mesh's (and a hair of
      // embedding so no light shows under it).
      e.y -= Math.max(real.low - boxLow, 0) + 0.008;
    }

    p.elements.push(e);
  };

  // ---- Slabs leaning on the two walls (held by the wall and the floor).
  leanSlabs(p, random, ground);

  // ---- The structure: a few big fractured slabs lying on the floor, side by
  // side and overlapping at the edges, then a second layer that comes to rest
  // across the gaps between them (so there are dark pockets underneath).
  const base: Array<{ x: number; z: number }> = [];

  for (let k = 0; k < 6; k++) {
    const { x, z } = spot();
    const t = between(random, 0.2, 0.36);

    base.push({ x, z });
    lump(
      "slab",
      x,
      z,
      between(random, 1.0, 1.6),
      t,
      between(random, 0.8, 1.2),
      0.03,
      pick(random, CONCRETE),
      1,
      between(random, 0, 6.28),
      14,
    );
  }

  for (let k = 0; k < 3; k++) {
    // Across the join of two of the first layer.
    const a = base[k % base.length];
    const b = base[(k + 2) % base.length];

    lump(
      "slab",
      (a.x + b.x) / 2,
      (a.z + b.z) / 2,
      between(random, 0.8, 1.3),
      between(random, 0.16, 0.3),
      between(random, 0.55, 0.9),
      0.1,
      pick(random, CONCRETE),
    );
  }

  // ---- Broken masonry between them: the larger lumps first, then smaller
  // fragments in the gaps. Each is its own shade.
  for (let k = 0; k < 12; k++) {
    const { x, z } = spot();
    const size = between(random, 0.35, 0.7);

    lump(
      "rock",
      x,
      z,
      size,
      size * between(random, 0.55, 0.8),
      size * between(random, 0.6, 1),
      0.4,
      pick(random, CONCRETE),
      0.85,
      between(random, 0, 6.28),
      8,
    );
  }

  for (let k = 0; k < 40; k++) {
    const { x, z } = spot();
    const size = between(random, 0.1, 0.26);

    lump(
      random() < 0.5 ? "rock" : "chunk",
      x,
      z,
      size,
      size * between(random, 0.5, 0.8),
      size * between(random, 0.6, 1),
      0.4,
      pick(random, CONCRETE),
      0.85,
      between(random, 0, 6.28),
      6,
    );
  }

  // ---- Bricks: broken runs of a few still together (a piece of wall), and
  // single loose ones. Muted and dusty: fired clay under plaster dust.
  const BRICKS = [0x6a4a40, 0x765242, 0x5c4038, 0x6b605a, 0x7c5e4c, 0x4f4640];

  for (let k = 0; k < 11; k++) {
    const { x, z } = spot();
    const yaw = between(random, 0, 6.28);
    const run = 3 + Math.floor(random() * 3);

    for (let b = 0; b < run; b++) {
      lump(
        "brick",
        x + Math.cos(yaw) * b * 0.215,
        z - Math.sin(yaw) * b * 0.215,
        0.22,
        0.07,
        0.105,
        0.06,
        pick(random, BRICKS),
        1,
        yaw + between(random, -0.1, 0.1),
      );
    }
  }

  for (let k = 0; k < 22; k++) {
    const { x, z } = spot();

    lump(
      "brick",
      x,
      z,
      0.22,
      0.07,
      0.105,
      0.5,
      pick(random, BRICKS),
      1,
      between(random, 0, 6.28),
      4,
    );
  }

  for (let k = 0; k < 10; k++) {
    const { x, z } = spot();

    lump(
      "chunk",
      x,
      z,
      between(random, 0.12, 0.22),
      0.06,
      between(random, 0.1, 0.18),
      0.3,
      shade(PLASTER, between(random, 0.8, 1.1)),
      0.9,
    );
  }

  // ---- Gaps: where the floor lies in a pit between taller rubble, a stone or
  // two have rolled in, so the pieces around do not float over dark voids.
  // (Its own random stream: what is laid after does not depend on it.)
  const filler = rng(777);
  let filled = 0;

  for (let n = 0; n < 160 && filled < 24; n++) {
    const x = between(filler, area.minX, area.maxX);
    const z = between(filler, area.minZ, area.maxZ);
    const nearDrum =
      Math.hypot(x + 9.5, z + 23.25) < 0.75 ||
      Math.hypot(x + 8.4, z + 23.4) < 0.75;

    if (nearDrum || ground.at(x, z) > 0.15) {
      continue;
    }

    // A pit: the rubble round it is much higher than it.
    if (ground.highest(x, z, 0.45) - ground.at(x, z) < 0.3) {
      continue;
    }

    const size = between(filler, 0.14, 0.3);

    lump(
      filler() < 0.7 ? "rock" : "brick",
      x,
      z,
      size,
      size * between(filler, 0.5, 0.8),
      size * between(filler, 0.6, 1),
      0.3,
      pick(filler, CONCRETE),
      0.85,
      between(filler, 0, 6.28),
      0,
      filler,
    );
    filled++;
  }

  // ---- Steel, laid across the rubble with each end resting on something.

  /** The best of several tries at laying a piece somewhere in the pile. */
  const bestPlan = (
    length: number,
    thick: number,
    width: number,
    start?: { x: number; z: number; yaws: number[] },
  ): LayPlan => {
    let best: LayPlan | null = null;
    const tries = start ? start.yaws.length : 40;

    for (let n = 0; n < tries; n++) {
      const at = start ?? spot();
      const yaw = start ? start.yaws[n] : between(random, 0, 6.28);
      const plan = ground.plan(at.x, at.z, yaw, length, thick, width);

      if (!best || layCost(plan) < layCost(best)) {
        best = plan;
      }
    }

    return best as LayPlan;
  };

  // A girder: an I-section (web and two flanges), bent where it took the load.
  const girder = (plan: LayPlan, colour: number): void => {
    ground.commit(plan);

    const lift = (u: number): [number, number, number] => [
      -u * Math.sin(plan.pitch) * Math.cos(plan.yaw),
      u * Math.cos(plan.pitch),
      u * Math.sin(plan.pitch) * Math.sin(plan.yaw),
    ];

    for (const [u, height, width] of [
      [0, 0.16, 0.025],
      [0.095, 0.025, 0.09],
      [-0.095, 0.025, 0.09],
    ] as const) {
      const [ox, oy, oz] = lift(u);

      p.elements.push({
        shape: "plank",
        x: plan.x + ox,
        y: plan.y + oy,
        z: plan.z + oz,
        sx: plan.length,
        sy: height,
        sz: width,
        rx: 0,
        ry: plan.yaw,
        rz: plan.pitch,
        color: colour,
      });
    }
  };

  const GUNMETAL_STEEL = [0x30353a, 0x2b2f33, 0x383d42];

  for (let k = 0; k < 2; k++) {
    const length = between(random, 1.3, 1.9);
    const colour = pick(random, GUNMETAL_STEEL);
    const first = bestPlan(length, 0.21, 0.09);
    const second = length * 0.5;

    girder(first, colour);

    // Bent where it took the load: turned whichever way rests best. Each try
    // is centred where the first length ends, along its own turn.
    const endX = first.x + first.dx * (length / 2);
    const endZ = first.z + first.dz * (length / 2);
    let tail: LayPlan | null = null;

    for (const turn of [0.35, -0.35, 0.55, -0.55, 0.75, -0.75]) {
      const yaw = first.yaw + turn;
      const plan = ground.plan(
        endX + Math.cos(yaw) * (second / 2),
        endZ - Math.sin(yaw) * (second / 2),
        yaw,
        second,
        0.21,
        0.09,
      );

      if (!tail || layCost(plan) < layCost(tail)) {
        tail = plan;
      }
    }

    girder(tail as LayPlan, colour);
  }

  // A rod, pipe or board lying across the rubble, resting at each end.
  const lie = (
    shape: "pipe" | "cable" | "plank",
    length: number,
    thick: number,
    width: number,
    color: number,
    at?: { x: number; z: number; yaws: number[] },
  ): LayPlan => {
    const plan = bestPlan(length, thick, width, at);

    // A rod that cannot lie down on what is under it (it would stand out at
    // an angle, hanging off one high point) is left out: loose rods are on
    // the floor or lying flat across rubble, never sticking up into the air.
    if (Math.abs(plan.pitch) > 0.2 || plan.lift > 0.12) {
      return plan;
    }

    ground.commit(plan);
    p.elements.push({
      shape,
      x: plan.x,
      y: plan.y,
      z: plan.z,
      sx: length,
      sy: thick,
      sz: width,
      rx: 0,
      ry: plan.yaw,
      rz: plan.pitch,
      color,
    });

    return plan;
  };

  for (let k = 0; k < 3; k++) {
    const d = between(random, 0.06, 0.09);

    lie(
      "pipe",
      between(random, 1.0, 1.8),
      d,
      d,
      pick(random, [PIPE, ...GUNMETAL_STEEL]),
    );
  }

  // Rebar: bars lying across the slabs, some bent (a second length turned
  // from the first one's end); mostly dark, a few with surface rust.
  for (let k = 0; k < 6; k++) {
    const length = between(random, 0.5, 0.9);
    const colour =
      random() < 0.3 ? pick(random, RUSTY) : pick(random, GUNMETAL_STEEL);
    const first = lie("pipe", length, 0.022, 0.022, colour);

    if (random() < 0.6) {
      const second = between(random, 0.3, 0.5);
      const endX = first.x + first.dx * (length / 2);
      const endZ = first.z + first.dz * (length / 2);
      const bend = first.yaw + between(random, 0.4, 0.8);

      lie("pipe", second, 0.022, 0.022, colour, {
        x: endX + Math.cos(bend) * (second / 2),
        z: endZ - Math.sin(bend) * (second / 2),
        yaws: [bend, bend + 0.3, bend - 0.3],
      });
    }
  }

  // ---- Wood: broken boards, dusty and aged, some short and splintered.
  const AGED = [0x5c4b38, 0x6a5a45, 0x4f4030, 0x756450];

  for (let k = 0; k < 8; k++) {
    lie(
      "plank",
      between(random, 0.4, 1.3),
      0.035,
      between(random, 0.08, 0.18),
      pick(random, AGED),
    );
  }

  // Cable ends lying out of the heap.
  for (let k = 0; k < 3; k++) {
    const first = lie("cable", between(random, 0.7, 1.4), 0.045, 0.045, BLACK);

    for (let n = 1; n < 3; n++) {
      lie("cable", between(random, 0.7, 1.4), 0.045, 0.045, BLACK, {
        x: first.x + n * 0.05,
        z: first.z + n * 0.03,
        yaws: [first.yaw + n * 0.04],
      });
    }
  }
}

/** The ceiling's beams, tray, pipe and lamps, and the walls' conduit and stains. */
function overhead(map: MapBuilder, F: number): void {
  const p = new Pieces();

  // Steel conduit along the north wall (with clamps) and junction boxes,
  // one of them hanging open.
  // The run goes on through the wall into the Generator Room, where it meets
  // the cable tray along its north wall (x -0.75).
  p.bar(-7.1, 2.65, -23.62, 12.8, 0.05, STEEL_BARE, 0);
  p.bar(-7.1, 2.78, -23.62, 12.8, 0.035, PIPE, 0);

  // Where it comes out in the Generator Room: a bush in the wall, and a
  // red and a black cable dropping from the conduit's end onto the tray.
  p.box(-0.98, 2.58, -23.63, 0.06, 0.26, 0.1, CHARCOAL);
  p.cable(-0.84, 2.63, -23.58, 0.3, 0.04, 0x8a2a24, 0, 0, -0.35);
  p.cable(-0.84, 2.61, -23.5, 0.3, 0.04, BLACK, 0, 0, -0.3);

  // Each bulb's supply: its flex up to the ceiling, along the ceiling to the
  // north wall (a flat cable on clips), and down the wall to the conduit.
  for (const bulb of JUNK_BULBS) {
    const run = bulb.z + 23.5;

    p.cable(
      bulb.x,
      3.74,
      bulb.z - run / 2,
      Math.abs(run),
      0.025,
      BLACK,
      Math.PI / 2,
    );

    for (let z = bulb.z - 0.6; z > -23.4; z -= 1.4) {
      p.box(bulb.x, 3.7, z, 0.04, 0.03, 0.05, GUNMETAL);
    }

    p.cableUp(bulb.x, 2.72, -23.56, 3.74 - 2.72, 0.025, BLACK);
    p.box(bulb.x, 2.55, -23.63, 0.07, 0.2, 0.06, CHARCOAL);
  }

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

  // The bulbs' fittings, over the pile, the middle and the fuel pool (each
  // over its light, see Occupation; the glass is `createJunkBulbGlow`).
  for (const bulb of JUNK_BULBS) {
    bulbFitting(p, bulb.x, bulb.z, bulb.y);
  }

  // The floor: dust on the concrete and oil stains, a split bag of cement.
  p.box(-7.5, 0, -19.4, 1.0, 0.004, 0.7, OIL, 0.3);
  p.box(-9.6, 0, -18.4, 0.7, 0.004, 0.5, DAMP, 1.2);
  p.box(-7.5, 0, -23.65, 12.0, 0.45, 0.01, 0x1b1d1d);
  p.box(-13.65, 0, -20.8, 0.01, 0.45, 5.8, 0x1b1d1d);
  p.chunk(-6.0, 0, -17.0, 0.22, 0x8a8478, 0.4);

  map.createFitting("fittings-junk-wall", F, p.elements, []);
}

/** The Junk Room's two hanging bulbs: where each sits (the glass's centre height above the floor). */
export const JUNK_BULBS: ReadonlyArray<{ x: number; z: number; y: number }> = [
  { x: -10.9, z: -21.0, y: 2.95 },
  { x: -4.2, z: -20.4, y: 2.95 },
];

/** The Generator Room's bulb, over the middle of the room (see PowerGrid). */
export const POWER_BULB = { x: 3.2, z: -20.5, y: 2.95 } as const;

/** The Break room's bulb (see Occupation). */
export const BREAK_BULB = { x: 27.2, z: 7.3, y: 2.95 } as const;

/** The Barracks' bulb (see Occupation). */
export const BARRACKS_BULB = { x: -24.4, z: -10.0, y: 2.1 } as const;

/** The Yard's bulb (see Occupation). */
export const YARD_BULB = { x: -14.8, z: 22.0, y: 2.4 } as const;

/** Every hanging bulb with a glowing glass (see `createJunkBulbGlow`). */
const GLOWING_BULBS: ReadonlyArray<{ x: number; z: number; y: number }> = [
  ...JUNK_BULBS,
  POWER_BULB,
  BREAK_BULB,
  BARRACKS_BULB,
  YARD_BULB,
];

/**
 * What a bare bulb hangs from: a porcelain ceiling rose, a black flex and a
 * bakelite socket with a brass screw collar. The glass itself glows: see
 * `createJunkBulbGlow`. Each lamp's light hangs a little under its bulb.
 */
export function bulbFitting(
  p: Pieces,
  x: number,
  z: number,
  bulbY: number,
): void {
  const ceiling = 3.8;

  p.cableUp(x, ceiling - 0.05, z, 0.05, 0.11, 0xcfc8b6);
  p.cableUp(x, ceiling - 0.07, z, 0.02, 0.06, 0x2a2420);
  p.cableUp(x, bulbY + 0.2, z, ceiling - 0.07 - (bulbY + 0.2), 0.014, BLACK);
  p.cableUp(x, bulbY + 0.1, z, 0.1, 0.055, 0x2a2420);
  p.cableUp(x, bulbY + 0.085, z, 0.025, 0.062, 0x8a7a4a);
}

export interface JunkBulbGlow {
  group: THREE.Group;
  /** Shows or hides one bulb's glass and halo (it breaks, or is whole again). */
  setLit(bulb: { x: number; z: number }, lit: boolean): void;
  dispose(): void;
}

/**
 * The glass of each bulb, lit from inside: a pear-shaped mesh drawn at full
 * brightness (not lit by the scene), with a soft round halo round it. Drawn
 * only: the light is the room lamp over the floor.
 */
export function createJunkBulbGlow(floorY: number): JunkBulbGlow {
  const group = new THREE.Group();
  // A standard bulb: a lathe of (radius, height) points, a narrow neck into
  // the socket, a round belly, a rounded tip.
  const profile = (
    [
      [0.0, 0.09],
      [0.015, 0.09],
      [0.021, 0.07],
      [0.036, 0.048],
      [0.05, 0.02],
      [0.057, -0.015],
      [0.054, -0.05],
      [0.04, -0.08],
      [0.019, -0.099],
      [0.0, -0.104],
    ] as const
  ).map(([r, y]) => new THREE.Vector2(r, y));
  const geometry = new THREE.LatheGeometry(profile, 20);
  // The glass: warm and slightly see-through, and the hot filament inside it.
  const glassMaterial = new THREE.MeshBasicMaterial({
    color: 0xffdf9c,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
    fog: false,
  });
  // The bloom: a smooth gaussian falloff, in a 256 px texture filtered
  // linearly (a small nearest-filtered one shows as square blocks).
  const size = 256;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
      // Gaussian, taken down to zero at the rim so there is no visible edge.
      const a =
        Math.max(0, Math.exp(-d * d * 7) - Math.exp(-7)) / (1 - Math.exp(-7));
      const o = (y * size + x) * 4;

      data[o] = 255;
      data[o + 1] = 200;
      data[o + 2] = 130;
      data[o + 3] = Math.round(255 * a);
    }
  }

  const haloTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);

  haloTexture.magFilter = THREE.LinearFilter;
  haloTexture.minFilter = THREE.LinearMipmapLinearFilter;
  haloTexture.generateMipmaps = true;
  haloTexture.needsUpdate = true;

  // Two layers: a tight bright bloom and a wide faint one.
  const tightMaterial = new THREE.SpriteMaterial({
    map: haloTexture,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.9,
    fog: false,
  });
  const wideMaterial = new THREE.SpriteMaterial({
    map: haloTexture,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.28,
    fog: false,
  });

  const parts = new Map<{ x: number; z: number }, THREE.Object3D[]>();

  for (const bulb of GLOWING_BULBS) {
    const y = floorY + bulb.y;
    const mine: THREE.Object3D[] = [];

    parts.set(bulb, mine);
    const glass = new THREE.Mesh(geometry, glassMaterial);
    const core = new THREE.Mesh(geometry, coreMaterial);

    glass.position.set(bulb.x, y, bulb.z);
    core.position.set(bulb.x, y - 0.005, bulb.z);
    core.scale.setScalar(0.5);
    group.add(glass, core);
    mine.push(glass, core);

    for (const [material, scale] of [
      [tightMaterial, 0.32],
      [wideMaterial, 1.3],
    ] as const) {
      const halo = new THREE.Sprite(material);

      halo.position.set(bulb.x, y - 0.02, bulb.z);
      halo.scale.setScalar(scale);
      halo.renderOrder = 6;
      group.add(halo);
      mine.push(halo);
    }
  }

  return {
    group,
    setLit(bulb, lit): void {
      for (const [known, objects] of parts) {
        if (known.x === bulb.x && known.z === bulb.z) {
          objects.forEach((object) => (object.visible = lit));
        }
      }
    },
    dispose(): void {
      geometry.dispose();
      glassMaterial.dispose();
      coreMaterial.dispose();
      tightMaterial.dispose();
      wideMaterial.dispose();
      haloTexture.dispose();
      group.removeFromParent();
    },
  };
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
    {
      minX: X0,
      maxX: -11.5,
      minZ: Z0,
      maxZ: -21.5,
      top: 2.0,
      visual: 1.7,
    },
    {
      minX: -11.5,
      maxX: -9.9,
      minZ: Z0,
      maxZ: -22.2,
      top: 1.5,
      visual: 1.15,
    },
    {
      minX: X0,
      maxX: -12.5,
      minZ: -21.5,
      maxZ: -21.0,
      top: 1.5,
      visual: 1.1,
    },
  ];
  {
    const p = new Pieces();

    // (Its own random stream: what is laid out after it does not depend on it.)
    heapPieces(p, rng(8128), heaps);
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

    buildRack(
      f,
      rng(4242),
      2.8,
      2.2,
      0.8,
      [0.15, 0.75, 1.35, 1.95],
      3,
      0.3,
      0.55,
      1,
    );
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

  // --------------------------- cement bags and the tools of the trade
  {
    const p = new Pieces();
    const BAG = [0x8f8878, 0x9a927f, 0x7d786a, 0x867f6c];

    // A stack against the south wall, east end: three layers, shrinking.
    for (const [x, z] of [
      [-4.3, -16.6],
      [-3.5, -16.6],
      [-2.7, -16.6],
      [-4.3, -17.15],
      [-3.5, -17.15],
    ] as const) {
      p.bag(x, 0, z, between(random, -0.06, 0.06), pick(random, BAG));
    }

    for (const [x, z] of [
      [-4.0, -16.6],
      [-3.1, -16.6],
      [-3.7, -17.15],
    ] as const) {
      p.bag(x, 0.2, z, between(random, -0.1, 0.1), pick(random, BAG));
    }

    p.bag(-3.6, 0.4, -16.65, 0.08, pick(random, BAG));

    // Two that slid off, one split open and spilling grey powder.
    p.bag(-4.9, 0, -17.9, 0.5, pick(random, BAG));
    p.bag(-6.2, 0, -17.4, 2.2, pick(random, BAG));
    p.box(-6.0, 0, -17.55, 0.7, 0.01, 0.45, 0x7a766d, 0.4);
    p.chunk(-6.0, 0, -17.5, 0.12, 0x6f6c64, 1.1);

    // Tools left lying about the south side and along the pile's edge.
    const WOODEN = 0x6a5238;
    const STEEL = 0x4b4f54;
    const YELLOW = 0xa8821c;
    const along = (x: number, z: number, ry: number, d: number) =>
      [x + Math.cos(ry) * d, z - Math.sin(ry) * d] as const;

    // Sledgehammer: a long haft and a heavy head.
    {
      const [hx, hz] = along(-8.4, -16.75, 0.2, 0.42);

      p.bar(-8.4, 0.025, -16.75, 0.9, 0.035, WOODEN, 0.2);
      p.box(hx, 0, hz, 0.1, 0.1, 0.2, STEEL, 0.2);
    }

    // Shovel: haft and a flat blade.
    {
      const [bx, bz] = along(-7.2, -16.85, -0.15, 0.62);

      p.bar(-7.2, 0.025, -16.85, 1.1, 0.03, WOODEN, -0.15);
      p.box(bx, 0, bz, 0.26, 0.015, 0.22, RUSTY[0], -0.15);
    }

    // Pickaxe: haft with a crossbar head.
    {
      const [hx, hz] = along(-12.7, -17.4, 0.7, 0.4);

      p.bar(-12.7, 0.025, -17.4, 0.9, 0.032, WOODEN, 0.7);
      p.bar(hx, 0.04, hz, 0.55, 0.04, STEEL, 0.7 + Math.PI / 2);
    }

    // Crowbar and a pair of spanners.
    p.bar(-9.4, 0.015, -17.5, 0.8, 0.025, STEEL, 0.4);
    p.bar(-9.0, 0.01, -17.1, 0.3, 0.02, STEEL, 1.1);
    p.bar(-8.7, 0.01, -17.3, 0.26, 0.02, STEEL, 2.4);

    // A toolbox with its lid open and a few things beside it.
    p.box(-6.9, 0, -16.55, 0.46, 0.2, 0.22, 0x7a2a22, 0.1);
    p.box(
      -6.9,
      0.2,
      -16.62,
      0.46,
      0.015,
      0.2,
      shade(0x7a2a22, 0.8),
      0.1,
      0,
      0.9,
    );
    p.box(-7.2, 0, -17.35, 0.22, 0.1, 0.16, STEEL, 0.5);

    // A dented bucket and a hard hat by the pile, a paint can by the rack.
    p.cableUp(-9.9, 0, -22.2, 0.3, 0.3, 0x5a5f63);
    p.cableUp(-9.9, 0.3, -22.2, 0.02, 0.32, 0x2a2c2f);
    p.cableUp(-9.1, 0, -21.5, 0.16, 0.32, YELLOW);
    p.cableUp(-9.1, 0.16, -21.5, 0.04, 0.4, shade(YELLOW, 0.8));
    p.cableUp(-4.4, 0, -21.9, 0.2, 0.18, 0x6a2c24);
    p.cableUp(-4.0, 0, -21.5, 0.2, 0.18, 0x3a4a5e);

    // A wheelbarrow by the south wall: an open steel tub with its sides, a
    // wheel at the front, two legs at the back and a pair of handles.
    {
      const cx = -9.3;
      const cz = -16.65;
      const TUB = 0x3d4650;

      p.box(cx, 0.2, cz, 0.7, 0.04, 0.46, shade(TUB, 0.8));
      p.box(cx, 0.24, cz - 0.23, 0.7, 0.2, 0.03, TUB);
      p.box(cx, 0.24, cz + 0.23, 0.7, 0.2, 0.03, TUB);
      p.box(cx - 0.35, 0.24, cz, 0.03, 0.2, 0.46, TUB);
      p.box(cx + 0.35, 0.24, cz, 0.03, 0.2, 0.46, TUB);
      p.cable(cx + 0.5, 0.17, cz, 0.07, 0.34, 0x16171a, Math.PI / 2);

      for (const side of [-1, 1]) {
        p.post(cx - 0.3, 0, cz + side * 0.2, 0.2, 0.035, STEEL);
        p.bar(cx - 0.7, 0.3, cz + side * 0.18, 0.8, 0.03, WOODEN);
      }
    }

    map.createFitting("junk-supplies", F, p.elements, [
      { minX: -4.75, maxX: -3.1, minZ: -17.45, maxZ: -16.3, top: 0.62 },
      { minX: -3.1, maxX: -2.3, minZ: -16.9, maxZ: -16.3, top: 0.22 },
      // The wheelbarrow tub: a solid object, not a thing to walk through.
      { minX: -9.7, maxX: -8.75, minZ: -16.9, maxZ: -16.4, top: 0.44 },
    ]);
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
