import { Pieces, rng } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import {
  BLACK,
  CARDBOARD,
  CARDBOARD_B,
  CHARCOAL,
  Frame,
  GUNMETAL,
  LABEL,
  PAPER,
  STEEL,
  STEEL_BARE,
  STEEL_LIGHT,
  TIMBER,
  TIMBER_B,
  TIMBER_DARK,
  extinguisher,
  plate,
} from "./RoomKit";

/**
 * The Archive (x -14 to -1, z -24 to -16, floor 4; inside x -13.7 to -1.3,
 * z -23.7 to -16.3): the old records room. Four free-standing document
 * shelves of different heights hold archive boxes, binders, ledgers and paper
 * bundles; banks of filing cabinets of mixed sizes stand against the north
 * wall; a plan chest fills the gap between the shelves; a records counter
 * and a sorting desk stand against the south wall, with pigeonholes above
 * the counter. The lanes between the units are 1.4 m or wider, and all three
 * doors (west z -22 to -20, east z -21 to -19, south x -9 to -7) stay clear.
 *
 * The shelves keep the ids and footprints of the graybox shelves they
 * replace (shelf-archive-1 to 4); nothing here is readable text.
 */

const FILE_OLIVE = 0x4a525c;
const FILE_TAN = 0x6a604a;
const FILE_GREEN = 0x3f5a4a;
const BOX_GREY = 0x6a6e63;
const BOX_BLUE = 0x56606c;
const SPINES = [0x6a3a35, 0x3c5a78, 0x3f5a4a, 0x14161a, 0x7a6a2e, 0x56606c];

/** One thing on an archive shelf, in the half of the shelf that faces `s` (along z). */
function shelfItem(
  p: Pieces,
  random: () => number,
  kind: number,
  x: number,
  bottom: number,
  z: number,
  s: 1 | -1,
  room: number,
): number {
  if (kind === 0) {
    // An archive box with a lid, a label plate and a hand-grip slot.
    const w = 0.3;
    const h = Math.min(0.3, room);
    const damp = random() < 0.14;
    const tone = damp
      ? 0x4a463c
      : [CARDBOARD, CARDBOARD_B, BOX_GREY, BOX_BLUE][Math.floor(random() * 4)];

    p.box(x, bottom, z, w, h, 0.34, tone);
    p.box(x, bottom + h, z, w + 0.02, 0.03, 0.36, CARDBOARD_B);
    if (damp) {
      // Water damage: a dark tide-mark up the side and a sagging lid.
      p.box(x, bottom, z + s * 0.172, w - 0.02, h * 0.45, 0.006, 0x2a2e26);
    }

    p.box(x, bottom + h * 0.45, z + s * 0.171, 0.1, 0.045, 0.006, 0x2a2622);
    plate(p, x, bottom + h * 0.1, z + s * 0.171, 0.15, 0.07, "z", s);

    return w + 0.02;
  }

  if (kind === 1) {
    // A run of binders, spines to the aisle, slightly uneven.
    const count = 5 + Math.floor(random() * 3);

    for (let k = 0; k < count; k++) {
      const h = Math.min(room, 0.25 + random() * 0.07);
      const tone = SPINES[Math.floor(random() * SPINES.length)];

      p.box(
        x + k * 0.058,
        bottom,
        z,
        0.052,
        h,
        0.3,
        tone,
        (random() - 0.5) * 0.04,
      );
      p.box(
        x + k * 0.058,
        bottom + h * 0.55,
        z + s * 0.151,
        0.03,
        0.05,
        0.004,
        LABEL,
      );
    }

    return count * 0.058 + 0.02;
  }

  if (kind === 2) {
    // A sheaf of loose paper, tied once with string.
    const h = Math.min(room, 0.1 + random() * 0.1);

    p.box(x, bottom, z, 0.3, h, 0.26, PAPER, (random() - 0.5) * 0.15);
    p.box(x, bottom + h * 0.4, z, 0.31, 0.01, 0.012, 0x7a6a4a);
    p.box(x + 0.02, bottom + h, z, 0.26, 0.006, 0.22, 0xa8a48e, 0.2);

    return 0.34;
  }

  // Two or three heavy ledgers, stacked and a little askew.
  let top = bottom;

  for (let k = 0; k < 3; k++) {
    const h = 0.05 + random() * 0.03;

    if (top - bottom + h > room) break;

    p.box(
      x + (random() - 0.5) * 0.03,
      top,
      z,
      0.3 - k * 0.02,
      h,
      0.24,
      SPINES[Math.floor(random() * 4)],
      (random() - 0.5) * 0.12,
    );
    top += h;
  }

  return 0.34;
}

/** A free-standing document shelf running along x, filled from both sides. */
function documentShelf(
  p: Pieces,
  random: () => number,
  x0: number,
  z0: number,
  len: number,
  depth: number,
  height: number,
  fill: number,
): void {
  const zc = z0 + depth / 2;
  const levels: number[] = [];

  for (let y = 0.1; y + 0.36 <= height - 0.1; y += 0.42) {
    levels.push(y);
  }

  // Uprights at each end and about every 1.2 m, a top rail and a bottom plinth.
  const posts = Math.max(2, Math.round(len / 1.2) + 1);

  for (let i = 0; i < posts; i++) {
    const x = x0 + 0.04 + (i * (len - 0.08)) / (posts - 1);

    for (const z of [z0 + 0.04, z0 + depth - 0.04]) {
      p.box(x, 0, z, 0.06, height, 0.06, CHARCOAL);
    }
  }

  p.box(x0 + len / 2, height - 0.03, zc, len, 0.04, depth, GUNMETAL);
  p.box(x0 + len / 2, 0, zc, len - 0.1, 0.08, depth - 0.1, BLACK);

  // A cross brace on each end, corner to corner of the end frame.
  const span = height - 0.25;
  const across = depth - 0.12;
  const tilt = Math.atan2(across, span);
  const brace = Math.hypot(across, span);

  for (const x of [x0 + 0.02, x0 + len - 0.02]) {
    for (const sign of [1, -1]) {
      p.box(
        x,
        0.12 + (span - brace) / 2 + 0.0,
        zc,
        0.02,
        brace,
        0.02,
        STEEL_LIGHT,
        0,
        0,
        sign * tilt,
      );
    }
  }

  levels.forEach((y, li) => {
    p.box(x0 + len / 2, y, zc, len - 0.04, 0.03, depth - 0.04, STEEL);

    // Items on the two faces, each side its own row.
    for (const s of [1, -1] as const) {
      const z = zc + s * (depth / 4);
      let u = x0 + 0.14;
      const stop = x0 + (len - 0.14) * fill * (li >= 3 ? 0.75 : 1);

      while (u < stop) {
        if (random() < 0.12) {
          u += 0.25 + random() * 0.3;
          continue;
        }

        const post = Array.from(
          { length: posts },
          (_, i) => x0 + 0.04 + (i * (len - 0.08)) / (posts - 1),
        );
        const kind = Math.floor(random() * 4);
        const used = kind === 0 ? 0.32 : kind === 1 ? 0.34 : 0.34;

        // Keep clear of an upright.
        let at = u;

        for (const px of post) {
          if (at < px + 0.05 && at + used > px - 0.05) {
            at = px + 0.06;
          }
        }

        if (at + used > x0 + len - 0.08) break;

        const w = shelfItem(
          p,
          random,
          kind,
          at + used / 2 - 0.02,
          y + 0.03,
          z,
          s,
          0.36,
        );

        u = at + w + 0.03 + random() * 0.05;
      }
    }
  });
}

/** A bank of filing cabinets against a wall, drawers to `+z` (a Frame facing +z). */
function cabinets(
  f: Frame,
  random: () => number,
  heights: number[],
  w: number,
  depth: number,
  tones: number[],
  openDrawer = -1,
): void {
  heights.forEach((h, i) => {
    const u = i * w + w / 2;
    const tone = tones[i % tones.length];
    const drawers = Math.max(2, Math.round(h / 0.34));
    const dh = (h - 0.12) / drawers;

    f.box(u, 0, depth / 2, w - 0.012, h, depth - 0.02, tone);
    f.box(u, 0, depth / 2, w - 0.004, 0.06, depth - 0.006, BLACK);
    f.box(u, h, depth / 2, w, 0.025, depth, CHARCOAL);

    for (let d = 0; d < drawers; d++) {
      const y = 0.07 + d * dh;
      const out = i === openDrawer && d === 1;
      const v = depth - 0.008 + (out ? 0.22 : 0);

      f.box(
        u,
        y,
        v,
        w - 0.06,
        dh - 0.025,
        0.014,
        tone === FILE_TAN ? 0x7a705a : 0x5a626c,
      );
      f.box(u, y + dh * 0.5, v + 0.014, 0.16, 0.022, 0.024, STEEL_BARE);
      f.box(u, y + dh * 0.78, v + 0.008, 0.12, 0.04, 0.006, LABEL);

      if (out) {
        // The drawer pulled out: its sides, a back and the folders standing in it.
        f.box(u, y + 0.03, depth + 0.1, w - 0.07, 0.02, 0.22, GUNMETAL);

        for (let k = 0; k < 7; k++) {
          f.box(
            u - 0.14 + k * 0.045,
            y + 0.05,
            depth + 0.1,
            0.028,
            dh * 0.7,
            0.2,
            k % 3 ? CARDBOARD_B : 0x6a604a,
            (random() - 0.5) * 0.1,
          );
        }
      }
    }
  });
}

export function furnishArchive(map: MapBuilder, floorY: number): void {
  const F = floorY;
  const random = rng(8123);

  // ------------------------------------------------- the four document shelves
  for (const [id, x0, x1, z0, h, fill] of [
    ["shelf-archive-1", -11.6, -8.6, -22.2, 1.25, 0.9],
    ["shelf-archive-2", -6.8, -3.2, -22.2, 1.42, 0.5],
    ["shelf-archive-3", -12.95, -9.6, -19.6, 1.1, 0.72],
    ["shelf-archive-4", -5.8, -3.0, -19.6, 1.35, 0.38],
  ] as const) {
    const p = new Pieces();

    documentShelf(p, random, x0, z0, x1 - x0, 0.8, h, fill);
    map.createFitting(id, F, p.elements, [
      { minX: x0, maxX: x1, minZ: z0, maxZ: z0 + 0.8, top: h },
    ]);
  }

  // ----------------------------------------- filing cabinets, west wall
  {
    const p = new Pieces();
    const f = new Frame(p, -13.7, -19.9, "+x");
    const heights = [1.35, 1.8, 1.35, 1.0, 1.35];
    const w = 2.4 / heights.length;

    cabinets(
      f,
      random,
      heights,
      w,
      0.75,
      [FILE_OLIVE, FILE_TAN, FILE_GREEN, FILE_TAN, FILE_OLIVE],
      1,
    );

    // Things left on top: a stack of folders, a box, a cold mug.
    f.box(0.3, heights[0] + 0.025, 0.35, 0.3, 0.12, 0.24, PAPER);
    f.box(w * 4 + 0.2, heights[4] + 0.025, 0.4, 0.3, 0.26, 0.34, CARDBOARD);
    p.post(
      f.wx(w * 3 + 0.2, 0.3),
      heights[3] + 0.025,
      f.wz(w * 3 + 0.2, 0.3),
      0.09,
      0.08,
      0xb9b49c,
    );
    map.createFitting("cabinets-archive-west", F, p.elements, [
      { minX: -13.7, maxX: -12.95, minZ: -19.9, maxZ: -17.5, top: 1.8 },
    ]);

    const q = new Pieces();
    const g = new Frame(q, -13.7, -23.7, "+x");

    // Two wide lateral files north of the west door.
    cabinets(g, random, [0.85, 0.85], 0.7, 0.5, [FILE_GREEN, FILE_OLIVE]);
    g.box(0.35, 0.875, 0.25, 0.3, 0.1, 0.22, PAPER);
    map.createFitting("cabinets-archive-lateral", F, q.elements, [
      { minX: -13.7, maxX: -13.2, minZ: -23.7, maxZ: -22.3, top: 0.85 },
    ]);
  }

  // ------------------------------------------------ a plan chest, north wall
  {
    const p = new Pieces();
    const f = new Frame(p, -8.4, -23.7, "+z");
    const w = 1.4;
    const depth = 0.7;

    f.box(w / 2, 0, depth / 2, w - 0.02, 1.0, depth - 0.02, 0x4a4036);
    f.box(w / 2, 1.0, depth / 2, w + 0.02, 0.04, depth + 0.02, TIMBER_DARK);

    for (let d = 0; d < 8; d++) {
      const y = 0.06 + d * 0.115;

      f.box(w / 2, y, depth - 0.005, w - 0.08, 0.1, 0.012, TIMBER_B);
      f.box(w / 2, y + 0.04, depth + 0.008, 0.16, 0.02, 0.014, 0x9a8836);
      f.box(w / 2 + 0.4, y + 0.04, depth + 0.004, 0.08, 0.035, 0.006, LABEL);
    }

    // Rolled plans on top, tied; one unrolled corner.
    for (const [u, y, d] of [
      [0.35, 1.07, 0.1],
      [0.52, 1.07, 0.09],
      [0.7, 1.07, 0.12],
    ] as const) {
      f.barOut(u, y + d / 2, 0.35, 0.55, d, PAPER);
      f.box(u, y, 0.35, 0.02, d + 0.01, 0.03, 0x7a6a4a);
    }

    f.box(1.1, 1.04, 0.3, 0.4, 0.004, 0.3, 0xa8a48e, 0);

    // In front of the chest, filling the lane to the shelves: a steel bin of
    // rolled plans standing on end (so there is no pocket to land in between).
    f.box(0.7, 0.0, 1.1, 1.36, 0.5, 0.76, GUNMETAL);
    f.box(0.7, 0.5, 1.1, 1.4, 0.03, 0.8, CHARCOAL);

    for (let k = 0; k < 9; k++) {
      f.post(
        0.2 + (k % 5) * 0.25,
        0.5,
        0.85 + Math.floor(k / 5) * 0.4,
        0.42 + ((k * 7) % 5) * 0.03,
        0.09 + (k % 3) * 0.015,
        k % 2 ? PAPER : 0xa8a48e,
      );
    }

    f.box(0.7, 0.3, 1.5, 1.2, 0.1, 0.014, 0x9a8836);
    map.createFitting("planchest-archive", F, p.elements, [
      { minX: -8.4, maxX: -7.0, minZ: -23.7, maxZ: -23.0, top: 1.05 },
      { minX: -8.4, maxX: -7.0, minZ: -23.0, maxZ: -22.2, top: 0.95 },
    ]);
  }

  // ------------------------------------ the records counter, south wall
  {
    const p = new Pieces();
    const f = new Frame(p, -13.7, -16.3, "-z");
    const len = 3.5;
    const depth = 0.8;

    // Panelled carcass, a heavy top with a raised back lip, a kick plate.
    f.box(len / 2, 0, depth / 2, len - 0.02, 0.95, depth - 0.1, 0x4a4036);
    f.box(len / 2, 0, depth / 2, len, 0.08, depth - 0.06, BLACK);

    for (let k = 0; k < 7; k++) {
      f.box(
        0.26 + k * 0.5,
        0.12,
        depth - 0.045,
        0.44,
        0.78,
        0.012,
        k % 2 ? TIMBER_B : TIMBER_DARK,
      );
      f.box(
        0.26 + k * 0.5 + 0.17,
        0.5,
        depth - 0.03,
        0.02,
        0.1,
        0.02,
        0x9a8836,
      );
    }

    f.box(len / 2, 0.95, depth / 2, len + 0.04, 0.06, depth, TIMBER);
    f.box(len / 2, 1.01, 0.05, len, 0.12, 0.05, TIMBER_DARK);

    // On the counter: an open ledger, a rubber stamp and ink pad, a bell, in and out trays, a dead lamp, a typewriter and a phone.
    f.box(0.7, 1.01, 0.45, 0.46, 0.03, 0.34, 0x2f3a2f);
    f.box(0.7, 1.04, 0.45, 0.42, 0.01, 0.3, PAPER);
    f.box(0.7, 1.05, 0.45, 0.004, 0.004, 0.3, 0x2a2622);
    f.box(1.25, 1.01, 0.55, 0.14, 0.03, 0.1, 0x2f3338);
    f.post(1.25, 1.04, 0.55, 0.07, 0.04, TIMBER_DARK);
    f.post(1.5, 1.01, 0.6, 0.06, 0.08, 0x9a8836);
    f.box(1.9, 1.01, 0.5, 0.3, 0.04, 0.22, STEEL);
    f.box(1.9, 1.07, 0.5, 0.3, 0.04, 0.22, STEEL);
    f.box(1.9, 1.01, 0.5, 0.26, 0.03, 0.18, PAPER);
    f.box(1.9, 1.07, 0.5, 0.26, 0.015, 0.18, 0xa8a48e);
    f.post(2.35, 1.01, 0.2, 0.34, 0.025, STEEL);
    f.box(2.35, 1.34, 0.28, 0.1, 0.06, 0.18, GUNMETAL);
    f.box(2.8, 1.01, 0.4, 0.34, 0.12, 0.3, CHARCOAL);
    f.box(2.8, 1.13, 0.36, 0.3, 0.02, 0.16, BLACK);

    for (let r = 0; r < 3; r++) {
      f.box(
        2.8,
        1.01 + 0.09 + r * 0.01,
        0.55 - r * 0.04,
        0.26,
        0.012,
        0.03,
        STEEL_LIGHT,
      );
    }

    f.box(3.2, 1.01, 0.55, 0.14, 0.08, 0.12, 0x2f3338);
    f.box(3.2, 1.09, 0.55, 0.08, 0.02, 0.1, BLACK);
    // Pigeonholes on the wall above, papers sticking out of a few.
    f.box(1.75, 1.6, 0.14, 3.2, 0.7, 0.26, 0x4a4036);

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 10; c++) {
        f.box(
          0.2 + c * 0.32,
          1.64 + r * 0.22,
          0.27,
          0.28,
          0.18,
          0.012,
          0x1d1b17,
        );

        if (random() < 0.5) {
          f.box(
            0.2 + c * 0.32,
            1.7 + r * 0.22,
            0.28,
            0.2,
            0.06 + random() * 0.08,
            0.04,
            PAPER,
            (random() - 0.5) * 0.2,
          );
        }
      }
    }

    // The clerk's chair behind the counter, pushed back a little.
    const cx = -12.0;
    const cz = -17.7;

    p.post(cx, 0.45, cz, 0.06, 0.46, 0x4a4036);
    p.box(cx, 0.78, cz - 0.2, 0.42, 0.34, 0.07, 0x4a4036);

    for (const a of [0, 1, 2, 3]) {
      p.bar(cx, 0.08, cz, 0.5, 0.035, GUNMETAL, a * (Math.PI / 4));
    }

    p.post(cx, 0.08, cz, 0.38, 0.05, STEEL);
    map.createFitting("counter-archive", F, p.elements, [
      { minX: -13.7, maxX: -10.2, minZ: -17.1, maxZ: -16.3, top: 1.05 },
    ]);
  }

  // ---------------------------------------------- the sorting desk
  {
    const p = new Pieces();
    const f = new Frame(p, -5.5, -16.3, "-z");
    const len = 2.2;
    const depth = 0.9;

    // A steel desk with a pigeonhole sorter and labelled trays on it.
    f.box(len / 2, 0, depth / 2, len - 0.04, 0.78, depth - 0.1, GUNMETAL);
    f.box(len / 2, 0.78, depth / 2, len + 0.04, 0.05, depth, TIMBER_B);

    for (let d = 0; d < 3; d++) {
      f.box(
        0.4 + d * 0.0,
        0.08 + d * 0.22,
        depth - 0.045,
        0.6,
        0.2,
        0.012,
        0x5a626c,
      );
      f.box(0.4, 0.15 + d * 0.22, depth - 0.02, 0.14, 0.02, 0.02, STEEL_BARE);
    }

    f.box(1.35, 0.83, 0.2, 0.9, 0.5, 0.2, TIMBER_DARK);

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        f.box(
          0.99 + c * 0.24,
          0.86 + r * 0.15,
          0.31,
          0.2,
          0.12,
          0.012,
          0x1d1b17,
        );

        if (random() < 0.6) {
          f.box(
            0.99 + c * 0.24,
            0.9 + r * 0.15,
            0.32,
            0.17,
            0.05 + random() * 0.06,
            0.03,
            PAPER,
          );
        }
      }
    }

    // Sorted piles in front, one half-sorted, a box of unsorted folders.
    for (const [u, h] of [
      [0.35, 0.12],
      [0.6, 0.07],
      [0.85, 0.16],
    ] as const) {
      f.box(u, 0.83, 0.55, 0.22, h, 0.3, PAPER, (random() - 0.5) * 0.15);
      f.box(u, 0.83 + h, 0.55, 0.23, 0.006, 0.31, 0xa8a48e);
    }

    f.box(1.8, 0.83, 0.5, 0.4, 0.3, 0.46, CARDBOARD);
    f.box(1.8, 1.13, 0.5, 0.42, 0.03, 0.48, CARDBOARD_B);

    for (let k = 0; k < 5; k++) {
      f.box(
        1.68 + k * 0.05,
        1.13,
        0.5,
        0.03,
        0.14,
        0.34,
        k % 2 ? 0x6a604a : CARDBOARD_B,
        (random() - 0.5) * 0.15,
      );
    }

    const c = new Pieces();

    // A wooden chair pulled out from the desk.
    c.box(-4.6, 0.43, -17.75, 0.44, 0.04, 0.42, TIMBER);

    for (const dx of [-0.18, 0.18]) {
      for (const dz of [-0.17, 0.17]) {
        c.post(-4.6 + dx, 0, -17.75 + dz, 0.43, 0.035, TIMBER_DARK);
      }
    }

    c.box(-4.6, 0.55, -17.95, 0.42, 0.34, 0.03, TIMBER);
    p.elements.push(...c.elements);
    map.createFitting("desk-archive", F, p.elements, [
      { minX: -5.5, maxX: -3.3, minZ: -17.2, maxZ: -16.3, top: 1.0 },
    ]);
  }

  // ------------- wall details, hanging lamps and the floor (drawn only)
  {
    const p = new Pieces();

    // An index board on the north wall between the cabinet banks and a notice by the south door.
    p.box(-10.2, 1.5, -23.67, 1.5, 0.8, 0.04, TIMBER_DARK);
    p.box(-10.2, 1.54, -23.64, 1.42, 0.72, 0.01, 0x2f3a2f);

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 7; c++) {
        if (random() < 0.25) continue;

        p.box(
          -10.85 + c * 0.2,
          1.62 + r * 0.16,
          -23.628,
          0.15,
          0.1,
          0.004,
          PAPER,
          (random() - 0.5) * 0.1,
        );
      }
    }

    extinguisher(p, -9.4, 0.9, -16.3, "z", -1);
    // Three dead pendant lamps on rods from the ceiling over the aisles.
    for (const [x, z] of [
      [-10.5, -20.5],
      [-6.0, -20.5],
      [-2.8, -17.5],
    ] as const) {
      p.post(x, 3.05, z, 0.75, 0.02, CHARCOAL);
      p.post(x, 2.85, z, 0.2, 0.34, 0x3a3f46);
      p.post(x, 2.83, z, 0.02, 0.36, BLACK);
    }

    // Paper and a few folders on the floor: spilled from a box by the middle aisle.
    p.box(-7.5, 0, -20.0, 0.42, 0.28, 0.34, CARDBOARD, 0.3);
    p.box(-7.35, 0.28, -19.95, 0.4, 0.02, 0.32, CARDBOARD_B, 0.5, 0, -0.6);

    for (let k = 0; k < 9; k++) {
      const a = random() * Math.PI * 2;

      p.box(
        -7.5 + Math.cos(a) * (0.35 + random() * 0.6),
        0,
        -20.0 + Math.sin(a) * (0.3 + random() * 0.5),
        0.22,
        0.004,
        0.3,
        k % 3 ? PAPER : CARDBOARD_B,
        random() * 3,
      );
    }

    // A folding step stool at the end of shelf 1.
    p.box(-12.35, 0.38, -21.2, 0.36, 0.03, 0.3, STEEL);
    p.box(-12.35, 0.19, -21.2, 0.34, 0.025, 0.28, STEEL);

    for (const dz of [-0.13, 0.13]) {
      p.box(-12.25, 0, -21.2 + dz, 0.025, 0.4, 0.025, STEEL_BARE, 0, 0.15);
      p.box(-12.45, 0, -21.2 + dz, 0.025, 0.4, 0.025, STEEL_BARE, 0, -0.15);
    }

    map.createFitting("fittings-archive-wall", F, p.elements, []);
  }
}
