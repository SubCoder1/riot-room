import { stairsToSteps } from "./ArenaLayout";
import { Pieces } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import { furnishSpawnLamps } from "./PowerGrid";

/**
 * The two spawn areas (the sunken yards in the north corners): the entry and
 * staging places where the thugs come in already equipped. Nothing here is a
 * pickup or a restock point.
 *
 *   - tread details on both staircases (pale nosing strips, anti-slip strips,
 *     scuffs), steel floor plates, hazard markings and stains;
 *   - a lamp post in each (see PowerGrid) lighting a facility site plan on the
 *     wall: a large poster drawn from the real room layout;
 *   - stored building materials in clusters along the walls: a stack of rough
 *     logs, stacks of bricks laid course by course, a pallet of cinder blocks,
 *     concrete blocks, a utility cabinet, and wall debris;
 *   - a sealed, opaque security door in the north-west area's west wall: the
 *     way the thugs came in. It is drawn and solid; nothing opens it.
 */

const CHARCOAL = 0x353b46;
const GUNMETAL = 0x2c333d;
const BLACK = 0x14161a;
const STEEL = 0x4f5f74;
const STEEL_BARE = 0x8791a0;
const MAST = 0x383e46;
const MAST_WORN = 0x464d56;
const WORN = 0x464d56;
const GRIME = 0x2b3036;
const RUST = 0x5a4a3c;
const RUST_DARK = 0x46372c;
const TIMBER = 0x5a4632;
const TIMBER_DARK = 0x3e3024;
const BARK = 0x4a3b2c;
const BARK_DARK = 0x382c20;
const GRAIN = 0xb09a76;
const NOSING = 0x7a828e;
const HAZARD = 0x9a8836;
const BRICKS = [0x6a3a30, 0x5a3329, 0x71402f, 0x4f3029, 0x5e3a33];
const CONCRETE = 0x6a6e73;
const CONCRETE_DARK = 0x575b61;
const CABINET = 0x383e46;

/** A deterministic little generator, so the clutter is the same every run. */
function lcg(seed: number): () => number {
  let a = seed >>> 0;

  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;

    return a / 4294967296;
  };
}

/** A stack of bricks laid course by course, staggered, each a bit off. */
function brickStack(
  p: Pieces,
  x0: number,
  z0: number,
  across: number,
  deep: number,
  courses: number,
  seed: number,
): void {
  const r = lcg(seed);
  const bl = 0.24;
  const bh = 0.075;
  const bw = 0.115;

  for (let c = 0; c < courses; c++) {
    // Alternate courses run along x and along z, so the stack ties together.
    const alongX = c % 2 === 0;
    const nx = alongX ? Math.floor(across / bl) : Math.floor(across / bw);
    const nz = alongX ? Math.floor(deep / bw) : Math.floor(deep / bl);
    // A thinner top course, with a few missing: a stack in use.
    const keep = c >= courses - 1 ? 0.55 : 1;

    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        if (r() > keep) {
          continue;
        }

        const x = x0 + (alongX ? bl : bw) * (i + 0.5) + (r() - 0.5) * 0.012;
        const z = z0 + (alongX ? bw : bl) * (j + 0.5) + (r() - 0.5) * 0.012;

        p.box(
          x,
          c * bh,
          z,
          alongX ? bl - 0.004 : bw - 0.004,
          bh - 0.004,
          alongX ? bw - 0.004 : bl - 0.004,
          BRICKS[Math.floor(r() * BRICKS.length)],
          (r() - 0.5) * 0.05,
        );
      }
    }
  }
}

/** A pile of logs running along z, a pyramid of rows, each a bit different. */
function logs(
  p: Pieces,
  x0: number,
  z0: number,
  length: number,
  across: number,
  seed: number,
): void {
  const r = lcg(seed);
  const d = 0.35;
  const n = Math.floor(across / d);

  for (let row = 0; row < n; row++) {
    const count = n - row;

    for (let i = 0; i < count; i++) {
      const lateral = (i + 0.5 + row * 0.5) * d;
      const len = length * (0.84 + r() * 0.16);
      const slip = (r() - 0.5) * 0.2;
      const y = row * d * 0.87 + d / 2;
      const zc = z0 + length / 2 + slip;
      const dd = d * (0.9 + r() * 0.1);
      const x = x0 + lateral;
      const color = r() < 0.5 ? BARK : BARK_DARK;

      // The log: a closed cylinder lying along z, with a pale end-grain disc
      // at each end.
      p.cable(x, y, zc, len, dd, color, Math.PI / 2);

      for (const s of [-1, 1]) {
        p.cable(
          x,
          y,
          zc + s * (len / 2 + 0.004),
          0.012,
          dd * 0.88,
          GRAIN,
          Math.PI / 2,
        );
      }
    }
  }
}

/**
 * A slatted wooden shipping crate: a dark body, three slats a side, corner
 * posts, top battens, steel corner brackets and a faded stencil plate.
 */
function crate(
  p: Pieces,
  cx: number,
  bottom: number,
  cz: number,
  w: number,
  d: number,
  h: number,
  ry: number,
  tone: number,
): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (dx: number, dz: number): [number, number] => [
    cx + dx * c + dz * s,
    cz - dx * s + dz * c,
  ];
  const slat = (h - 0.06) / 3;

  p.box(cx, bottom, cz, w - 0.02, h, d - 0.02, TIMBER_DARK, ry);

  for (let i = 0; i < 3; i++) {
    const y = bottom + 0.03 + i * slat;
    const shade = i === 1 ? TIMBER_DARK : tone;

    for (const side of [-1, 1]) {
      const [fx, fz] = at(0, side * (d / 2 - 0.006));
      const [gx, gz] = at(side * (w / 2 - 0.006), 0);

      p.box(fx, y, fz, w - 0.04, slat - 0.02, 0.02, shade, ry);
      p.box(gx, y, gz, 0.02, slat - 0.02, d - 0.04, shade, ry);
    }
  }

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [px, pz] = at(sx * (w / 2 - 0.035), sz * (d / 2 - 0.035));

      p.box(px, bottom, pz, 0.07, h, 0.07, TIMBER, ry);
      p.box(px, bottom + h - 0.03, pz, 0.1, 0.05, 0.1, STEEL, ry);
    }
  }

  for (const side of [-1, 1]) {
    const [bx, bz] = at(side * (w / 2 - 0.1), 0);

    p.box(bx, bottom + h, bz, 0.12, 0.025, d - 0.06, TIMBER, ry);
  }

  // A stencil plate: faded orange with a dark mark.
  const [sx0, sz0] = at(0.1, d / 2 + 0.004);

  p.box(sx0, bottom + h * 0.45, sz0, 0.26, h * 0.3, 0.008, 0x8a6a2e, ry);
  p.box(sx0, bottom + h * 0.52, sz0, 0.14, h * 0.08, 0.012, BLACK, ry);
}

/**
 * A field console: a steel desk with a sloped panel carrying two cracked
 * monitors with a dim green trace, a keyboard, a relay box below, cables to
 * the floor and a dead lamp: where the thugs check in.
 */
function fieldConsole(p: Pieces, cx: number, zBack: number): void {
  const z = zBack + 0.35;

  // Desk body, a thick top, side panels and a kick plate.
  p.box(cx, 0.08, z, 2.16, 0.62, 0.64, MAST);
  p.box(cx, 0.7, z, 2.2, 0.06, 0.7, MAST_WORN);

  for (const sx of [-1, 1]) {
    p.box(cx + sx * 1.04, 0, z, 0.1, 0.8, 0.68, MAST);
  }

  p.box(cx, 0, z, 2.1, 0.08, 0.6, GUNMETAL);

  // The relay box on the left of the desk's face, with a few toggles.
  p.box(cx - 0.62, 0.25, z + 0.33, 0.62, 0.34, 0.04, GRIME);

  for (let i = 0; i < 4; i++) {
    p.box(cx - 0.8 + i * 0.12, 0.34, z + 0.36, 0.03, 0.09, 0.03, STEEL_BARE);
    p.chunk(
      cx - 0.8 + i * 0.12,
      0.2,
      z + 0.36,
      0.025,
      i === 1 ? 0x86322a : 0x3f6a48,
    );
  }

  // The sloped panel: a back board tilted by a stepped wedge, two monitors,
  // each a dark frame with a dim screen and a crack, a keyboard in front.
  p.box(cx, 0.76, zBack + 0.1, 2.1, 0.36, 0.16, GUNMETAL);
  p.box(cx, 0.76, zBack + 0.1, 2.1, 0.5, 0.06, GRIME);

  for (const dx of [-0.52, 0.52]) {
    p.box(cx + dx, 0.82, zBack + 0.2, 0.74, 0.5, 0.1, BLACK);
    p.box(cx + dx, 0.86, zBack + 0.26, 0.62, 0.4, 0.012, 0x23402e);
    p.box(cx + dx - 0.1, 0.9, zBack + 0.27, 0.34, 0.01, 0.006, 0x4c7a50);
    p.box(
      cx + dx + 0.12,
      0.98,
      zBack + 0.27,
      0.01,
      0.2,
      0.006,
      0x5a6a5e,
      0,
      0,
      0.5,
    );
  }

  p.box(cx, 0.76, z + 0.15, 0.9, 0.025, 0.24, CHARCOAL);

  for (let i = 0; i < 8; i++) {
    p.box(cx - 0.35 + i * 0.1, 0.785, z + 0.15, 0.08, 0.012, 0.2, STEEL);
  }

  // Cables from the back down to the floor, and a dead task lamp.
  p.cableUp(cx - 0.9, 0.0, zBack + 0.05, 0.9, 0.04, 0x3a2420);
  p.cableUp(cx + 0.95, 0.0, zBack + 0.05, 0.9, 0.04, 0x1b1d21);
  p.post(cx + 0.9, 0.76, z - 0.05, 0.3, 0.04, MAST_WORN);
  p.box(cx + 0.9, 1.06, z - 0.05, 0.18, 0.06, 0.12, GUNMETAL);
}

/** A utility cabinet or electrical enclosure, door shut, against a north wall. */
function cabinet(p: Pieces, x: number, z: number): void {
  p.box(x, 0, z, 1.0, 1.8, 0.5, CABINET);
  p.box(x, 1.8, z, 1.06, 0.05, 0.56, GUNMETAL);
  p.box(x, 0.3, z + 0.255, 0.012, 1.3, 0.01, BLACK);

  for (const y of [0.45, 1.0, 1.55]) {
    p.box(x - 0.46, y, z + 0.255, 0.05, 0.12, 0.03, STEEL_BARE);
  }

  p.box(x + 0.2, 0.85, z + 0.27, 0.05, 0.26, 0.04, STEEL_BARE);
  p.box(x + 0.25, 0.7, z + 0.28, 0.1, 0.1, 0.05, BLACK);
  p.box(x - 0.2, 1.25, z + 0.26, 0.26, 0.22, 0.01, HAZARD);
  p.box(x - 0.2, 1.3, z + 0.268, 0.1, 0.1, 0.008, BLACK, 0, 0, Math.PI / 4);
  p.box(x, 0, z + 0.02, 1.04, 0.1, 0.54, GUNMETAL);
}

/** A pallet carrying a stack of concrete cinder blocks. */
function pallet(p: Pieces, x: number, z: number, seed: number): void {
  const r = lcg(seed);

  for (const dx of [-0.5, 0, 0.5]) {
    p.box(x + dx, 0, z, 0.1, 0.1, 1.0, TIMBER_DARK);
  }

  for (let i = 0; i < 5; i++) {
    p.box(x, 0.1, z - 0.4 + i * 0.2, 1.2, 0.025, 0.17, TIMBER);
  }

  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < 3; i++) {
      p.box(
        x - 0.38 + i * 0.4 + (r() - 0.5) * 0.02,
        0.125 + c * 0.2,
        z + (c % 2 ? 0.14 : -0.14) + (r() - 0.5) * 0.03,
        0.39,
        0.19,
        0.19,
        r() < 0.5 ? CONCRETE : CONCRETE_DARK,
        (r() - 0.5) * 0.04,
      );
    }
  }
}

/** Debris along a wall: broken bricks, an offcut, a rag. Not solid. */
function debris(
  p: Pieces,
  x0: number,
  z: number,
  n: number,
  seed: number,
): void {
  const r = lcg(seed);

  for (let i = 0; i < n; i++) {
    const x = x0 + r() * 2.2;
    const kind = r();

    if (kind < 0.5) {
      p.chunk(x, 0, z + (r() - 0.5) * 0.3, 0.1 + r() * 0.08, BRICKS[i % 5]);
    } else if (kind < 0.8) {
      p.box(x, 0, z + r() * 0.2, 0.4 + r() * 0.3, 0.035, 0.09, TIMBER, r() * 3);
    } else {
      p.box(x, 0, z + r() * 0.25, 0.3, 0.01, 0.22, 0x4a3e3a, r() * 3);
    }
  }
}

/** Faded yellow and black hazard squares laid in a strip on the floor. */
function hazardStrip(
  p: Pieces,
  x: number,
  z: number,
  length: number,
  width: number,
  alongX: boolean,
): void {
  const n = Math.floor(length / (width * 1.2));

  for (let i = 0; i < n; i++) {
    const t = -length / 2 + (i + 0.5) * (width * 1.2);

    p.box(
      alongX ? x + t : x,
      0,
      alongX ? z : z + t,
      width * 0.6,
      0.004,
      width * 0.6,
      i % 2 ? BLACK : HAZARD,
      0.785,
    );
  }
}

/** The tread details on a staircase: nosings, strips and scuffs. */
function treads(map: MapBuilder, id: string): void {
  const stairs = map.getStairs().find((s) => s.id === id);

  if (!stairs) {
    return;
  }

  const p = new Pieces();
  const alongX = stairs.direction.endsWith("x");
  const sign = stairs.direction.startsWith("+") ? 1 : -1;

  stairsToSteps(stairs).forEach((step, i) => {
    const h = step.height ?? 0;
    const edge =
      sign > 0
        ? alongX
          ? step.minX
          : step.minZ
        : alongX
          ? step.maxX
          : step.maxZ;
    const cross0 = alongX ? step.minZ : step.minX;
    const cross1 = alongX ? step.maxZ : step.maxX;
    const cc = (cross0 + cross1) / 2;
    const span = cross1 - cross0 - 0.12;
    const put = (
      along: number,
      depth: number,
      height: number,
      color: number,
    ): void => {
      if (alongX) {
        p.box(along, h, cc, depth, height, span, color);
      } else {
        p.box(cc, h, along, span, height, depth, color);
      }
    };

    put(edge + sign * 0.045, 0.07, 0.012, NOSING);
    put(edge + sign * 0.2, 0.025, 0.008, BLACK);

    if (i % 3 === 1) {
      const off = ((i * 37) % 7) / 7 - 0.5;
      const a = edge + sign * 0.3;
      const x = alongX ? a : cc + off * (span - 0.5);
      const z = alongX ? cc + off * (span - 0.5) : a;

      p.box(x, h, z, alongX ? 0.18 : 0.5, 0.006, alongX ? 0.5 : 0.18, GRIME);
    }
  });

  map.createFitting(`fittings-${id}-treads`, 0, p.elements, []);
}

/** Steel floor plates, riveted, on the ground floor of a pit. */
function floorPlates(
  map: MapBuilder,
  name: string,
  plates: Array<[number, number, number]>,
): void {
  const p = new Pieces();

  for (const [x, z, turn] of plates) {
    const c = Math.cos(turn);
    const s = Math.sin(turn);

    p.box(x, 0, z, 1.1, 0.018, 1.1, STEEL, turn);
    p.box(x, 0.018, z, 1.0, 0.004, 1.0, WORN, turn);

    for (const [dx, dz] of [
      [-0.46, -0.46],
      [0.46, -0.46],
      [-0.46, 0.46],
      [0.46, 0.46],
    ] as const) {
      p.chunk(
        x + dx * c + dz * s,
        0.02,
        z - dx * s + dz * c,
        0.035,
        STEEL_BARE,
      );
    }

    for (let i = -2; i <= 2; i++) {
      p.box(
        x + i * 0.18 * c,
        0.022,
        z - i * 0.18 * s,
        0.7,
        0.008,
        0.03,
        0x6a727c,
        turn + 0.78,
      );
    }
  }

  map.createFitting(`fittings-${name}-plates`, 0, p.elements, []);
}

/**
 * A wall-mounted site plan's frame: a steel backing plate and frame with
 * screws (the plan itself is a textured plane added through the layout's
 * `posters`).
 */
function posterFrame(
  p: Pieces,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
): void {
  // The frame stands 0.07 m off the wall (its face is at z + 0.04), one
  // lip over each poster edge, with a mounting plate behind, square corner
  // plates and bolt heads in the corners and along the edges.
  const wall = z - 0.03;
  const mid = wall + 0.035;
  const face = wall + 0.07;
  const t = 0.09;
  const out = 0.065;
  const lip = 0.025;
  const sx = w / 2 + (out - lip) / 2;
  const sy = h / 2 + (out - lip) / 2;

  p.box(x, y - h / 2 - 0.13, mid - 0.0175, w + 0.26, h + 0.26, 0.015, GUNMETAL);

  p.box(x, y + h / 2 - lip, mid, w + 2 * out, t, 0.07, MAST);
  p.box(x, y - h / 2 - out, mid, w + 2 * out, t, 0.07, MAST);

  for (const side of [-1, 1]) {
    p.box(x + side * sx, y - h / 2 - out, mid, t, h + 2 * out, 0.07, MAST_WORN);

    for (const top of [-1, 1]) {
      const cx = x + side * sx;
      const cy = y + top * sy;

      p.box(cx - 0.0075, cy - 0.06, mid + 0.007, 0.12, 0.12, 0.085, MAST_WORN);
      p.bar(cx, cy, face + 0.014, 0.018, 0.05, STEEL_BARE, Math.PI / 2);
    }
  }

  // Bolts along the long edges, and one midway down each side.
  for (const bx of [-w / 4, 0, w / 4]) {
    for (const top of [-1, 1]) {
      p.bar(
        x + bx,
        y + top * sy,
        face + 0.01,
        0.016,
        0.038,
        STEEL_BARE,
        Math.PI / 2,
      );
    }
  }

  for (const side of [-1, 1]) {
    p.bar(x + side * sx, y, face + 0.01, 0.016, 0.038, STEEL_BARE, Math.PI / 2);
  }
}

/**
 * The sealed door: an opaque steel security door in the north-west area's
 * west wall, 4.0 m wide and 3.2 m tall, flush to the wall. Two solid leaves
 * on a floor track, ribbed and bolted; a thick frame; a bar across both
 * leaves with a padlock and chain; hazard markings along the foot, rust where
 * water runs. One solid box over the whole door, never opened.
 */
function door(map: MapBuilder): void {
  const p = new Pieces();
  const face = -31.7;
  const z0 = -21.8;
  const z1 = -17.8;
  const zc = (z0 + z1) / 2;
  const H = 3.2;
  const g = (
    v: number,
    y: number,
    du: number,
    sv: number,
    h: number,
    color: number,
    off = 0,
  ): void => {
    p.box(face + off + du / 2, y, zc + v, du, h, sv, color);
  };

  // Thick frame: floor sill, head beam, jambs and a centre post.
  g(0, 0, 0.3, 4.0, 0.1, MAST);
  g(0, H - 0.3, 0.3, 4.0, 0.3, MAST);
  g(0, H - 0.34, 0.2, 4.0, 0.04, MAST_WORN);

  for (const v of [-1.9, 1.9]) {
    g(v, 0.1, 0.3, 0.2, H - 0.4, MAST);
    g(v, 0.1, 0.34, 0.1, H - 0.4, MAST_WORN);
  }

  g(0, 0.1, 0.24, 0.12, H - 0.4, MAST);

  // The two leaves: solid sheet with no gaps, each with three horizontal
  // ribs, vertical stiffeners and rows of bolts, over a floor track.
  for (const side of [-1, 1]) {
    const vc = side * 0.93;
    const w = 1.74;

    g(vc, 0.12, 0.12, w, H - 0.46, GUNMETAL, 0.08);

    for (const y of [0.55, 1.4, 2.25]) {
      g(vc, y, 0.04, w - 0.06, 0.16, MAST_WORN, 0.2);
    }

    for (const dv of [-0.55, 0.55]) {
      g(vc + dv, 0.2, 0.04, 0.1, H - 0.66, MAST, 0.2);
    }

    for (const y of [0.63, 1.48, 2.33]) {
      for (let i = 0; i < 7; i++) {
        p.chunk(
          face + 0.26,
          y,
          zc + vc - w / 2 + 0.15 + i * ((w - 0.3) / 6),
          0.035,
          STEEL_BARE,
        );
      }
    }

    for (const dv of [-0.55, 0.55]) {
      g(vc + dv, 0.1, 0.1, 0.14, 0.14, BLACK, 0.12);
    }
  }

  // A hazard band along the foot of both leaves.
  for (let i = 0; i < 16; i++) {
    g(-1.8 + i * 0.235, 0.14, 0.012, 0.15, 0.16, i % 2 ? BLACK : HAZARD, 0.2);
  }

  // The lock: a heavy bar across both leaves in two brackets, a chain and a
  // padlock.
  g(0, 1.6, 0.06, 2.4, 0.1, MAST_WORN, 0.28);

  for (const v of [-1.1, 1.1]) {
    g(v, 1.55, 0.1, 0.16, 0.2, MAST, 0.24);
  }

  for (let i = 0; i < 5; i++) {
    p.chunk(
      face + 0.34,
      1.52 - i * 0.045,
      zc + (i % 2 ? 0.03 : -0.03),
      0.035,
      STEEL_BARE,
    );
  }

  g(0, 1.12, 0.14, 0.12, 0.16, BLACK, 0.3);
  g(0, 1.26, 0.08, 0.06, 0.05, STEEL_BARE, 0.3);

  // Rust runs and chipped paint.
  g(-1.3, 0.2, 0.012, 0.3, 1.0, RUST_DARK, 0.2);
  g(0.6, 0.5, 0.012, 0.2, 0.7, RUST, 0.2);
  g(1.45, 0.15, 0.012, 0.22, 1.2, RUST_DARK, 0.2);
  g(-0.4, 2.55, 0.012, 0.3, 0.35, RUST_DARK, 0.2);

  map.createFitting("fittings-gate-closed", 0, p.elements, [
    { minX: face, maxX: face + 0.34, minZ: z0, maxZ: z1, top: H },
  ]);
}

export function furnishSpawnAreas(map: MapBuilder): void {
  treads(map, "stairs-spawn-nw");
  treads(map, "stairs-spawn-ne");

  // ----------------------------------------------- the detailed furnishings
  // (These replace plain boxes: the same footprints and heights, so cover and
  // walking space are unchanged.)
  {
    const c = new Pieces();

    fieldConsole(c, -29.2, -23.7);
    map.createFitting("console-spawn-nw", 0, c.elements, [
      { minX: -30.3, maxX: -28.1, minZ: -23.7, maxZ: -23.0, top: 1.1 },
    ]);

    const k = new Pieces();

    crate(k, -31.15, 0, -14.35, 1.1, 1.1, 1.0, 0.04, TIMBER);
    map.createFitting("crate-spawn-nw", 0, k.elements, [
      { minX: -31.7, maxX: -30.6, minZ: -14.9, maxZ: -13.8, top: 1.0 },
    ]);

    const s = new Pieces();

    crate(s, 30.2, 0, -23.2, 1.0, 1.0, 0.9, 0.02, TIMBER);
    crate(s, 31.2, 0, -23.2, 1.0, 1.0, 0.9, -0.03, TIMBER_DARK);
    crate(s, 30.75, 0.9, -23.15, 1.0, 1.0, 0.8, 0.14, TIMBER);
    crate(s, 30.7, 0, -22.2, 1.2, 1.0, 0.9, -0.05, TIMBER);
    map.createFitting("stack-spawn-ne", 0, s.elements, [
      { minX: 29.7, maxX: 31.7, minZ: -23.7, maxZ: -21.7, top: 1.7 },
    ]);

    // An ammunition-style steel case on the east wall.
    const m = new Pieces();
    const cx = 31.15;
    const cz = -19.6;

    m.box(cx, 0, cz, 1.06, 0.92, 1.06, 0x3c4a3c);
    m.box(cx, 0.92, cz, 1.1, 0.08, 1.1, 0x2f3a2f);

    for (const dz of [-0.3, 0.3]) {
      m.box(cx - 0.55, 0.3, cz + dz, 0.03, 0.14, 0.2, STEEL_BARE);
    }

    m.box(cx - 0.55, 0.5, cz, 0.012, 0.22, 0.5, 0x9a8836);
    m.box(cx - 0.56, 0.58, cz, 0.008, 0.06, 0.3, BLACK);
    m.box(cx, 0.05, cz, 1.1, 0.06, 1.1, GUNMETAL);
    map.createFitting("crate-spawn-ne-d", 0, m.elements, [
      { minX: 30.6, maxX: 31.7, minZ: -20.15, maxZ: -19.05, top: 1.0 },
    ]);
  }

  // ===================================================== north-west area
  {
    // Logs along the west wall's north end, against the console.
    const p = new Pieces();

    logs(p, -31.7, -23.7, 1.9, 1.4, 71);
    map.createFitting("fittings-spawn-nw-logs", 0, p.elements, [
      { minX: -31.7, maxX: -30.3, minZ: -23.7, maxZ: -21.8, top: 1.1 },
    ]);

    // Brick stacks in the north-east corner: a tall one and a low one.
    const a = new Pieces();

    brickStack(a, -23.04, -23.7, 2.0, 1.2, 11, 5);
    map.createFitting("fittings-spawn-nw-bricks-a", 0, a.elements, [
      { minX: -23.04, maxX: -21.0, minZ: -23.7, maxZ: -22.5, top: 0.84 },
    ]);

    const b = new Pieces();

    brickStack(b, -24.68, -23.7, 1.6, 0.9, 6, 9);
    map.createFitting("fittings-spawn-nw-bricks-b", 0, b.elements, [
      { minX: -24.68, maxX: -23.04, minZ: -23.7, maxZ: -22.8, top: 0.46 },
    ]);

    // Debris along the walls (not solid).
    const d = new Pieces();

    debris(d, -30.0, -23.2, 3, 3);
    debris(d, -27.0, -23.3, 4, 4);
    debris(d, -21.8, -20.5, 2, 5);
    map.createFitting("fittings-spawn-nw-debris", 0, d.elements, []);

    // The site plan on the north wall between the console and the bricks.
    const f = new Pieces();

    posterFrame(f, -26.4, 2.1, -23.67, 3.0, 2.25);
    hazardStrip(f, -28.2, -16.9, 2.0, 0.28, false);
    map.createFitting("fittings-spawn-nw-poster", 0, f.elements, []);
    map.addPoster({
      id: "poster-spawn-nw",
      x: -26.4,
      y: 2.1,
      z: -23.64,
      width: 3.0,
      height: 2.25,
      nx: 0,
      nz: 1,
      here: "nw",
    });
  }

  floorPlates(map, "spawn-nw", [
    [-29.4, -19.6, 0.1],
    [-25.4, -20.4, -0.05],
    [-24.2, -16.9, 0.0],
  ]);

  // ===================================================== north-east area
  {
    // Logs on the west wall's north end and a brick stack beside them.
    const p = new Pieces();

    logs(p, 22.0, -23.7, 1.9, 1.4, 83);
    map.createFitting("fittings-spawn-ne-logs", 0, p.elements, [
      { minX: 22.0, maxX: 23.4, minZ: -23.7, maxZ: -21.8, top: 1.1 },
    ]);

    const q = new Pieces();

    brickStack(q, 23.4, -23.7, 1.7, 1.0, 9, 12);
    map.createFitting("fittings-spawn-ne-bricks", 0, q.elements, [
      { minX: 23.4, maxX: 25.1, minZ: -23.7, maxZ: -22.7, top: 0.7 },
    ]);

    // A utility cabinet on the north wall, clear of the poster.
    const c = new Pieces();

    cabinet(c, 28.7, -23.45);
    map.createFitting("fittings-spawn-ne-cabinet", 0, c.elements, [
      { minX: 28.2, maxX: 29.2, minZ: -23.7, maxZ: -23.2, top: 1.85 },
    ]);

    // A pallet of cinder blocks on the east wall, touching the crate.
    const pl = new Pieces();

    pallet(pl, 31.1, -18.55, 21);
    map.createFitting("fittings-spawn-ne-pallet", 0, pl.elements, [
      { minX: 30.5, maxX: 31.7, minZ: -19.05, maxZ: -18.05, top: 0.7 },
    ]);

    const d = new Pieces();

    debris(d, 26.0, -23.3, 4, 8);
    debris(d, 29.6, -23.0, 2, 9);
    map.createFitting("fittings-spawn-ne-debris", 0, d.elements, []);

    // The information board: a frame on the north wall.
    const f = new Pieces();

    posterFrame(f, 26.6, 2.1, -23.67, 3.0, 2.25);
    hazardStrip(f, 26.0, -15.5, 2.0, 0.28, true);
    map.createFitting("fittings-spawn-ne-poster", 0, f.elements, []);
    map.addPoster({
      id: "poster-spawn-ne",
      x: 26.6,
      y: 2.1,
      z: -23.64,
      width: 3.0,
      height: 2.25,
      nx: 0,
      nz: 1,
      here: "ne",
    });
  }

  floorPlates(map, "spawn-ne", [
    [26.4, -19.8, 0.05],
    [29.3, -17.0, -0.08],
    [24.4, -14.6, 0.0],
  ]);

  for (const [name, x, z, w, d] of [
    ["nw-a", -27.3, -20.2, 1.6, 1.1],
    ["nw-b", -30.2, -16.8, 1.2, 0.9],
    ["ne-a", 27.6, -21.0, 1.5, 1.0],
    ["ne-b", 24.4, -17.4, 1.1, 1.3],
  ] as const) {
    map.addDecal({
      id: `decal-spawn-${name}`,
      kind: "stain",
      x,
      z,
      y: 0,
      width: w,
      depth: d,
      rotation: (x * 7) % 3,
      color: 0x15181c,
      alpha: 0.5,
    });
  }

  // The lamp posts, and the sealed door.
  furnishSpawnLamps(map);
  door(map);
}
