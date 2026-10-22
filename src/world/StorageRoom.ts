import { Pieces, rng } from "./FittingPieces";
import type { FramePart } from "./ArenaLayout";
import type { MapBuilder } from "./MapParts";
import { GREY, GUN, Network, type Vec3 } from "./WorkshopPipes";

/**
 * The Storage room's contents. The room itself (walls and doors) is made in
 * UpperFloorMap; this fills it:
 *
 * - three steel shelving units (one on the west wall, an island of two back
 *   to back in the middle, one on the north wall) with a curated mix of
 *   bins, boxes and fittings, some shelves left empty;
 * - heavy wooden crates (slatted, corner-braced), singly and in two stacks;
 * - cardboard cartons and packages in loose piles;
 * - steel drums in two groups;
 * - a small storage trolley;
 * - exposed pipes along the north, east and south walls above the doors, with
 *   mitred elbows, brackets, bands and a valve and gauge.
 *
 * Room: x -9 to -1.8, z 15.3 to 23.7 (floor 4). Its doors: the Store's door
 * on the west wall (z 20 to 22), a north door (x -8.2 to -6.2) and two on the
 * east wall (z 16.2 to 18.2 and z 20 to 22). Every doorway has a clear 1.4 m
 * in front of it, and every lane between props is 1.4 m or wider.
 */

const CHARCOAL = 0x353b46;
const STEEL = 0x4f5f74;
const STEEL_LIGHT = 0x66768c;
const STEEL_BARE = 0x8791a0;
const BLACK = 0x14161a;
const TIMBER = 0x7a5c3c;
const TIMBER_B = 0x6a5035;
const TIMBER_DARK = 0x4e3a28;
/** A muted blue-grey accent for edges and bands (yellow is kept for interactive objects). */
const ACCENT = 0x5a667a;
const GUNMETAL = 0x2c333d;
const CARDBOARD_C = 0x6f5d40;
const CARDBOARD_D = 0x866f4f;
const BIN_BLUE = 0x4a5568;
const BIN_PALE = 0x6a727e;
const CARDBOARD = 0x7c694a;
const CARDBOARD_B = 0x8a7656;
const TAPE = 0xb8aa86;
const GREY_BIN = 0x606873;

export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
  /** Solid parts for shots (floor-relative); a line passes between them. */
  frame?: FramePart[];
}

/** Rotates a local offset about a centre (matches a box turned by `ry`). */
export function turn(
  cx: number,
  cz: number,
  ry: number,
  dx: number,
  dz: number,
): [number, number] {
  const c = Math.cos(ry);
  const s = Math.sin(ry);

  return [cx + dx * c + dz * s, cz - dx * s + dz * c];
}

/** The axis-aligned footprint of a w x d box turned by `ry`. */
export function bounds(
  cx: number,
  cz: number,
  w: number,
  d: number,
  ry: number,
  top: number,
): Footprint {
  const hx = (Math.abs(Math.cos(ry)) * w + Math.abs(Math.sin(ry)) * d) / 2;
  const hz = (Math.abs(Math.sin(ry)) * w + Math.abs(Math.cos(ry)) * d) / 2;

  return {
    minX: cx - hx,
    maxX: cx + hx,
    minZ: cz - hz,
    maxZ: cz + hz,
    top,
  };
}

/** A slatted wooden crate with corner posts, battens and steel corner brackets. */
export function crate(
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
  // The body (dark, showing in the gaps), then three slats on each side.
  p.box(cx, bottom, cz, w - 0.02, h, d - 0.02, TIMBER_DARK, ry);

  const slat = (h - 0.06) / 3;

  for (let i = 0; i < 3; i++) {
    const y = bottom + 0.03 + i * slat;
    const shade = i === 1 ? TIMBER_B : tone;

    for (const side of [-1, 1]) {
      const [fx, fz] = turn(cx, cz, ry, 0, side * (d / 2 - 0.006));
      const [gx, gz] = turn(cx, cz, ry, side * (w / 2 - 0.006), 0);

      p.box(fx, y, fz, w - 0.04, slat - 0.02, 0.02, shade, ry);
      p.box(gx, y, gz, 0.02, slat - 0.02, d - 0.04, shade, ry);
    }
  }

  // Corner posts and top battens.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [px, pz] = turn(
        cx,
        cz,
        ry,
        sx * (w / 2 - 0.035),
        sz * (d / 2 - 0.035),
      );

      p.box(px, bottom, pz, 0.07, h, 0.07, TIMBER_B, ry);
    }
  }

  for (const side of [-1, 1]) {
    const [bx, bz] = turn(cx, cz, ry, side * (w / 2 - 0.1), 0);

    p.box(bx, bottom + h, bz, 0.12, 0.025, d - 0.06, TIMBER_B, ry);
  }

  // Steel corner brackets on the top edge, two corners.
  for (const [sx, sz] of [
    [-1, -1],
    [1, 1],
  ] as const) {
    const [kx, kz] = turn(cx, cz, ry, sx * (w / 2 - 0.05), sz * (d / 2 - 0.05));

    p.box(kx, bottom + h - 0.02, kz, 0.1, 0.05, 0.1, STEEL, ry);
  }
}

/** What a unit mostly holds: each one reads differently from the next. */
export type ShelfTheme = "mixed" | "cartons" | "bins" | "steel";

/** A cardboard carton with a tape strip and a label. */
export function carton(
  p: Pieces,
  cx: number,
  bottom: number,
  cz: number,
  w: number,
  d: number,
  h: number,
  ry: number,
  tone = CARDBOARD,
): void {
  p.box(cx, bottom, cz, w, h, d, tone, ry);
  p.box(cx, bottom + h, cz, 0.08, 0.004, d + 0.002, TAPE, ry);

  const [lx, lz] = turn(cx, cz, ry, w * 0.18, d / 2 + 0.003);

  p.box(lx, bottom + h * 0.4, lz, w * 0.3, h * 0.22, 0.006, 0xc9c6b4, ry);
}

/** A steel drum: ribs, a lid with a bung, and an optional yellow band. */
export function drum(
  p: Pieces,
  x: number,
  z: number,
  color: number,
  band = false,
  bottom = 0,
): void {
  p.post(x, bottom, z, 0.88, 0.58, color);
  p.post(x, bottom + 0.2, z, 0.04, 0.6, CHARCOAL);
  p.post(x, bottom + 0.6, z, 0.04, 0.6, CHARCOAL);
  p.post(x, bottom + 0.88, z, 0.02, 0.5, CHARCOAL);
  p.chunk(x + 0.12, bottom + 0.9, z + 0.08, 0.06, STEEL_BARE);

  if (band) {
    p.post(x, bottom + 0.4, z, 0.1, 0.59, ACCENT);
  }
}

/**
 * A steel shelving unit with four levels and a curated load. `along` is the
 * way it runs; (x0, z0) is its min corner and `len` its length. `bays` fixes
 * how full each level is (1 = full, 0 = empty).
 */
export function shelving(
  p: Pieces,
  random: () => number,
  x0: number,
  z0: number,
  len: number,
  depth: number,
  along: "x" | "z",
  fill: number[],
  theme: ShelfTheme = "mixed",
): Footprint {
  // Tall: six levels, 3.4 m to the top rail.
  const h = 3.4;
  const levels = [0.14, 0.64, 1.14, 1.64, 2.14, 2.64];
  // (u along the unit, v across it) to the world.
  const wx = (u: number, v: number): number =>
    along === "x" ? x0 + u : x0 + v;
  const wz = (u: number, v: number): number =>
    along === "x" ? z0 + v : z0 + u;
  const sz = (a: number, b: number): [number, number] =>
    along === "x" ? [a, b] : [b, a];
  // Every solid piece of the unit, for shots to be stopped by (not the gaps).
  const frame: FramePart[] = [];
  const box = (
    u: number,
    v: number,
    bottom: number,
    a: number,
    b: number,
    height: number,
    color: number,
    ry = 0,
  ): void => {
    const [sx, sdz] = sz(a, b);

    p.box(wx(u, v), bottom, wz(u, v), sx, height, sdz, color, ry);

    // For shots: every piece (thin ones thickened) except the smallest bits.
    if (Math.max(sx, sdz, height) >= 0.06) {
      const c = Math.abs(Math.cos(ry));
      const sn = Math.abs(Math.sin(ry));
      const hx = Math.max(c * sx + sn * sdz, 0.05) / 2;
      const hz = Math.max(sn * sx + c * sdz, 0.05) / 2;
      const cy = bottom + height / 2;
      const hy = Math.max(height, 0.08) / 2;

      frame.push({
        minX: wx(u, v) - hx,
        maxX: wx(u, v) + hx,
        minZ: wz(u, v) - hz,
        maxZ: wz(u, v) + hz,
        minY: cy - hy,
        maxY: cy + hy,
      });
    }
  };

  // Uprights at each end and between, a top rail, shelves with a front lip.
  const posts = Math.max(2, Math.round(len / 1.4) + 1);
  const postsU = Array.from(
    { length: posts },
    (_, i) => 0.05 + (i * (len - 0.1)) / (posts - 1),
  );

  for (let i = 0; i < posts; i++) {
    const u = 0.05 + (i * (len - 0.1)) / (posts - 1);

    for (const v of [0.05, depth - 0.05]) {
      box(u, v, 0, 0.07, 0.07, h, CHARCOAL);
      box(u, v, 0, 0.14, 0.14, 0.02, CHARCOAL);
    }
  }

  box(len / 2, depth / 2, h - 0.04, len + 0.04, depth + 0.04, 0.05, CHARCOAL);

  levels.forEach((y, level) => {
    box(len / 2, depth / 2, y, len - 0.06, depth - 0.04, 0.04, STEEL);
    box(
      len / 2,
      depth - 0.03,
      y + 0.04,
      len - 0.06,
      0.03,
      0.05,
      random() < 0.3 ? STEEL_LIGHT : CHARCOAL,
    );
    box(0.04, depth - 0.02, y, 0.08, 0.04, 0.05, ACCENT);
    box(len - 0.04, depth - 0.02, y, 0.08, 0.04, 0.05, ACCENT);

    // Load: items laid along the level up to its fill, then left empty.
    let u = 0.12;
    // Now and then a small worn label plate on the shelf's front lip.
    if (level % 2 === 1 && random() < 0.4) {
      box(
        0.3 + random() * (len - 0.6),
        depth - 0.005,
        y + 0.05,
        0.16,
        0.012,
        0.05,
        0xc9c6b4,
      );
    }

    // The upper levels are kept sparser: less is reached for up there.
    const stop =
      (len - 0.16) * fill[level % fill.length] * (level >= 4 ? 0.75 : 1);
    const pick = (list: readonly number[]): number =>
      list[Math.floor(random() * list.length)];

    while (u < stop) {
      // A themed unit holds mostly one kind of thing, with the odd stray.
      const weights: Record<ShelfTheme, number[]> = {
        // bin, carton, crate, steel, parts, stack, tub, case
        mixed: [0.18, 0.26, 0.1, 0.1, 0.06, 0.1, 0.1, 0.1],
        bins: [0.4, 0.1, 0.06, 0.1, 0.08, 0, 0.26, 0],
        cartons: [0.08, 0.42, 0.06, 0, 0.04, 0.3, 0.04, 0.06],
        steel: [0.14, 0.08, 0.1, 0.34, 0.1, 0, 0.06, 0.18],
      };
      const table = random() < 0.12 ? weights.mixed : weights[theme];
      let roll = random();
      let kind = 0;

      while (kind < table.length - 1 && roll > table[kind]) {
        roll -= table[kind];
        kind++;
      }

      const w = 0.2 + random() * (kind === 1 || kind === 5 ? 0.5 : 0.36);
      // Never taller than the space under the next shelf (with a lid on top).
      const hh = 0.12 + random() * (kind === 1 || kind === 5 ? 0.26 : 0.2);

      // Keep clear of the uprights: slide the item past one it would cross.
      for (const pu of postsU) {
        if (u < pu + 0.06 && u + w > pu - 0.06) {
          u = pu + 0.07;
        }
      }

      if (u + w > len - 0.1) {
        break;
      }

      // Now and then a section is left bare.
      if (random() < 0.12) {
        u += 0.3 + random() * 0.5;
        continue;
      }

      const dd = Math.min(depth - 0.14, 0.28 + random() * 0.24);
      // Now and then one is pulled a little toward the aisle, in use.
      const pulled = random() < 0.1 ? Math.min(0.08, depth - 0.06 - dd) : 0;
      const v = depth / 2 - 0.02 + (random() - 0.5) * 0.05 + pulled / 2;
      const at = y + 0.04;
      const cu = u + w / 2;

      if (kind === 0) {
        // A bin: grey, blue-grey or pale, with a dark opening.
        box(cu, v, at, w, dd, hh, pick([GREY_BIN, BIN_BLUE, BIN_PALE]));
        box(cu, v, at + hh - 0.005, w - 0.06, dd - 0.06, 0.012, BLACK);
      } else if (kind === 1) {
        // A carton, turned a little now and then.
        const turn = random() < 0.25 ? (random() - 0.5) * 0.5 : 0;
        const tone = pick([CARDBOARD, CARDBOARD_B, CARDBOARD_C, CARDBOARD_D]);

        box(cu, v, at, w, dd, hh, tone, turn);
        box(cu, v, at + hh, w * 0.08, dd, 0.004, TAPE, turn);

        // A second, smaller carton on top where there is room for it.
        const room = 0.4 - hh;

        if (random() < 0.3 && room > 0.1) {
          box(
            cu,
            v,
            at + hh,
            w * 0.8,
            dd * 0.8,
            Math.min(room, 0.18),
            pick([CARDBOARD_B, CARDBOARD_C]),
            (random() - 0.5) * 0.3,
          );
        }
      } else if (kind === 2) {
        // An open timber crate: a base and four low boards, empty or with a
        // few parts in it.
        const ch = Math.min(0.26, hh + 0.08);

        box(cu, v, at, w, dd, 0.03, TIMBER_DARK);

        for (const side of [-1, 1]) {
          box(cu, v + side * (dd / 2 - 0.012), at + 0.03, w, 0.024, ch, TIMBER);
          box(
            cu + side * (w / 2 - 0.012),
            v,
            at + 0.03,
            0.024,
            dd,
            ch,
            TIMBER_B,
          );
        }

        if (random() < 0.5) {
          box(cu, v, at + 0.03, w * 0.55, dd * 0.5, ch * 0.5, STEEL_BARE);
        }
      } else if (kind === 3) {
        // A lidded metal container.
        box(cu, v, at, w, dd, hh, pick([STEEL_LIGHT, STEEL, ACCENT]));
        box(
          cu,
          v,
          at + hh,
          w + 0.02,
          dd + 0.02,
          0.035,
          pick([GUNMETAL, CHARCOAL]),
        );
      } else if (kind === 4) {
        // Small parts: a couple of short drums or a coil, loose.
        const r = Math.min(0.09, dd / 2 - 0.02);

        p.post(wx(cu - 0.08, v), at, wz(cu - 0.08, v), hh * 0.8, r, STEEL_BARE);
        p.post(
          wx(cu + 0.1, v),
          at,
          wz(cu + 0.1, v),
          hh * 0.6,
          r * 0.8,
          GUNMETAL,
        );
      } else if (kind === 6) {
        // A plastic storage tub: wide and low, with a paler lid, slightly off.
        box(
          cu,
          v,
          at,
          w + 0.08,
          dd,
          hh * 0.8,
          pick([BIN_BLUE, GREY_BIN, BIN_PALE]),
        );
        box(
          cu,
          v,
          at + hh * 0.8,
          w + 0.1,
          dd + 0.02,
          0.03,
          pick([BIN_PALE, STEEL_LIGHT]),
          (random() - 0.5) * 0.12,
        );
      } else if (kind === 7) {
        // A small equipment case: dark, with two light latches and a handle.
        const ch = Math.min(hh, 0.26);

        box(cu, v, at, w, dd, ch, pick([GUNMETAL, CHARCOAL]));
        box(
          cu - w * 0.25,
          v + dd / 2,
          at + ch * 0.6,
          0.05,
          0.015,
          0.05,
          STEEL_BARE,
        );
        box(
          cu + w * 0.25,
          v + dd / 2,
          at + ch * 0.6,
          0.05,
          0.015,
          0.05,
          STEEL_BARE,
        );
        box(cu, v, at + ch, w * 0.35, 0.04, 0.03, STEEL_BARE);
      } else {
        // An uneven stack: three cartons, each a little off the one below.
        let top = at;

        for (let k = 0; k < 3; k++) {
          const sh = Math.min(0.12, (0.4 - (top - at)) / (3 - k));

          if (sh < 0.06) {
            break;
          }

          box(
            cu + (random() - 0.5) * 0.06,
            v,
            top,
            w * (1 - k * 0.1),
            dd * (1 - k * 0.06),
            sh,
            pick([CARDBOARD, CARDBOARD_C, CARDBOARD_D]),
            (random() - 0.5) * 0.25,
          );
          top += sh;
        }
      }

      u += w + 0.06 + random() * 0.1;
    }
  });

  return along === "x"
    ? { minX: x0, maxX: x0 + len, minZ: z0, maxZ: z0 + depth, top: h, frame }
    : { minX: x0, maxX: x0 + depth, minZ: z0, maxZ: z0 + len, top: h, frame };
}

export function furnishStorageRoom(map: MapBuilder, floorY: number): void {
  const F = floorY;
  const random = rng(2217);
  const W = -9.0;
  const N = 15.3;
  const S = 23.7;

  // ------------------------------------------------------------- shelving
  {
    const p = new Pieces();
    const boxes: Footprint[] = [];

    // West wall, north of the Store's door: a unit 2.8 m long.
    boxes.push(
      shelving(
        p,
        random,
        W,
        16.7,
        2.8,
        0.6,
        "z",
        [1, 0.8, 0.6, 0.35],
        "cartons",
      ),
    );
    // The island in the middle: two units back to back, a stepped load.
    boxes.push(
      shelving(
        p,
        random,
        -6.9,
        18.1,
        2.6,
        0.6,
        "x",
        [0.9, 1, 0.5, 0.0],
        "bins",
      ),
    );
    boxes.push(
      shelving(
        p,
        random,
        -6.9,
        18.7,
        2.6,
        0.6,
        "x",
        [0.7, 0.4, 1, 0.55],
        "cartons",
      ),
    );
    // North wall, east of the column: a short unit.
    boxes.push(
      shelving(p, random, -4.4, N, 1.8, 0.6, "x", [1, 1, 0.7, 0.5], "steel"),
    );

    map.createFitting("fittings-storage-shelves", F, p.elements, boxes);
  }

  // --------------------------------------------------------------- crates
  {
    const p = new Pieces();
    const boxes: Footprint[] = [];
    const add = (
      cx: number,
      cz: number,
      w: number,
      d: number,
      h: number,
      ry: number,
      bottom = 0,
      tone = TIMBER,
    ): void => {
      crate(p, cx, bottom, cz, w, d, h, ry, tone);
    };

    // South-east corner: a stack of three (two below, one on top).
    add(-2.65, 23.2, 1.1, 0.9, 0.85, 0.06);
    add(-3.85, 23.25, 0.95, 0.8, 0.7, -0.05, 0, TIMBER_B);
    add(-2.7, 23.2, 0.9, 0.7, 0.7, 0.3, 0.85, TIMBER_B);
    boxes.push(
      bounds(-2.65, 23.2, 1.1, 0.9, 0.06, 1.55),
      bounds(-3.85, 23.25, 0.95, 0.8, -0.05, 0.7),
    );

    // On the south wall, west of them: one big crate.
    add(-5.3, 23.2, 1.5, 1.0, 1.15, -0.08, 0, TIMBER_DARK);
    carton(p, -5.1, 1.15, 23.15, 0.7, 0.5, 0.3, 0.2, CARDBOARD_B);
    boxes.push(bounds(-5.3, 23.2, 1.5, 1.0, -0.08, 1.45));

    map.createFitting("fittings-storage-crates", F, p.elements, boxes);
  }

  // ---------------------------------------------------------------- drums
  {
    const p = new Pieces();
    const boxes: Footprint[] = [];

    // South-west corner: three drums, one with a band.
    drum(p, -8.55, 23.35, 0x3c5365, true);
    drum(p, -7.85, 23.25, 0x4a5640);
    drum(p, -8.3, 22.65, 0x5a4a38);
    boxes.push({
      minX: -8.85,
      maxX: -7.55,
      minZ: 22.35,
      maxZ: 23.65,
      top: 0.9,
    });

    map.createFitting("fittings-storage-drums", F, p.elements, boxes);
  }

  // --------------------------------------------------------------- trolley
  {
    const p = new Pieces();
    // In the north-west corner, out of the lanes (handle toward the room).
    const cx = -8.65;
    const cz = 15.85;
    const w = 0.55;
    const d = 0.9;

    // A two-deck trolley parked in the north-west corner, handle toward the room.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        p.box(
          cx + sx * (w / 2 - 0.03),
          0.08,
          cz + sz * (d / 2 - 0.03),
          0.045,
          0.62,
          0.045,
          STEEL_BARE,
        );
        p.bar(
          cx + sx * (w / 2 - 0.03),
          0.07,
          cz + sz * (d / 2 - 0.03),
          0.05,
          0.14,
          BLACK,
        );
      }
    }

    for (const y of [0.17, 0.62]) {
      p.box(cx, y, cz, w, 0.035, d, CHARCOAL);
      p.box(cx, y + 0.035, cz - d / 2 + 0.01, w, 0.04, 0.02, CHARCOAL);
      p.box(cx, y + 0.035, cz + d / 2 - 0.01, w, 0.04, 0.02, CHARCOAL);
    }

    p.alongZ(
      cx - w / 2 + 0.03,
      0.96,
      cz + d / 2 - 0.03,
      cz + d / 2 + 0.1,
      0.035,
      STEEL_BARE,
    );
    p.alongZ(
      cx + w / 2 - 0.03,
      0.96,
      cz + d / 2 - 0.03,
      cz + d / 2 + 0.1,
      0.035,
      STEEL_BARE,
    );
    p.alongX(
      cx - w / 2 + 0.03,
      cx + w / 2 - 0.03,
      0.96,
      cz + d / 2 + 0.1,
      0.035,
      STEEL_BARE,
    );
    carton(p, cx, 0.655, cz + 0.1, 0.4, 0.4, 0.3, 0.1);
    carton(p, cx, 0.205, cz - 0.1, 0.4, 0.45, 0.28, -0.1, CARDBOARD_B);

    map.createFitting("fittings-storage-trolley", F, p.elements, [
      {
        minX: cx - w / 2,
        maxX: cx + w / 2,
        minZ: cz - d / 2,
        maxZ: cz + d / 2 + 0.1,
        top: 0.7,
      },
    ]);
  }

  // ----------------------------------------------------------------- pipes
  {
    const p = new Pieces();
    const n = new Network(p);
    // The ceiling is 6.5 m above the floor: the main runs just under it, at
    // the same level as the Workshop's, well above anyone on a shelf.
    const Y = 6.15;
    const ZN = N + 0.16;
    const ZS = S - 0.16;
    const XW = W - 0.12;
    const JOIN = 6.3;
    const X: Vec3 = [1, 0, 0];
    const Z: Vec3 = [0, 0, 1];
    const UP: Vec3 = [0, 1, 0];

    // A 160 mm main along the north wall, down the Store's wall and back along
    // the south wall, above every doorway and bay, to meet the Workshop's main
    // at the partition. It goes into the Store's wall at the west end.
    n.run(
      [
        [JOIN, Y, ZN],
        [XW, Y, ZN],
        [XW, Y, ZS],
        [JOIN, Y, ZS],
      ],
      0.16,
      GUN,
    );

    for (const x of [-7.4, -5.0, -3.0, -0.4, 2.2, 4.6]) {
      n.clamp([x, Y, ZN], X, 0.16, [0, 0, -1], 0.07);
      n.clamp([x, Y, ZS], X, 0.16, [0, 0, 1], 0.07);
    }

    for (const z of [17.0, 19.5, 22.0]) {
      n.clamp([XW, Y, z], Z, 0.16, [-1, 0, 0], 0.07);
    }

    n.collar([-5.9, Y, ZN], X, 0.16, 0.12, GREY, 1.4);
    n.collar([1.6, Y, ZN], X, 0.16, 0.12, GREY, 1.4);
    n.collar([-2.4, Y, ZS], X, 0.16, 0.12, GREY, 1.4);
    n.band([-4.1, Y, ZN], X, 0.16);
    n.band([3.4, Y, ZN], X, 0.16);
    n.band([0.6, Y, ZS], X, 0.16);

    // A branch down the north wall by the short shelf, with a valve and gauge.
    {
      const x = -3.2;

      n.collar([x, Y, ZN], X, 0.16, 0.14, GREY, 1.3);
      n.seg([x, Y - 0.1, ZN], [x, 3.7, ZN], 0.09, GREY);
      n.clamp([x, 5.6, ZN], UP, 0.09, [0, 0, -1], 0.07);
      n.valve(x, 5.0, ZN, 1, 0.09);
      n.gauge(x, 4.3, ZN, 1, 0.09);
      n.collar([x, 3.72, ZN], UP, 0.09, 0.06, GREY, 1.7);
    }

    map.createFitting("fittings-storage-network", F, p.elements, []);
  }
}

/**
 * The middle of the hall: long runs of shelving that carry the storage through
 * it. Rows of double units (back to back) and single units against the south
 * wall, each cut into 3 m runs with 1.5 m cross lanes at staggered positions,
 * so the aisles zig-zag and no route is a straight line or a dead end. Every
 * aisle and every cross lane is 1.5 m or wider. The north door's opening is
 * kept clear.
 */
export function furnishHall(map: MapBuilder, floorY: number): void {
  const F = floorY;
  const random = rng(7311);
  // [id, x0, z0, length, front load, back load (double units only)]
  // Loads run bottom to top over six levels: 1 full, 0.5 half, 0 bare.
  const runs: Array<
    [string, number, number, number, number[], number[] | null]
  > = [
    [
      "a1",
      -2.1,
      17.0,
      3.1,
      [1, 1, 0.8, 0.9, 0.5, 0.2],
      [0.9, 0.6, 1, 0.3, 0, 0.7],
    ],
    [
      "a2",
      2.5,
      17.3,
      2.0,
      [0.7, 1, 0, 0.8, 1, 0.4],
      [1, 0.5, 0.9, 0.6, 0.25, 0],
    ],
    [
      "b1",
      -0.8,
      20.1,
      2.4,
      [1, 0.5, 0.9, 1, 0.3, 0.6],
      [0.4, 1, 0.7, 0, 0.8, 0.5],
    ],
    [
      "b2",
      4.4,
      20.1,
      2.0,
      [0.5, 0.9, 1, 0.2, 0.7, 0],
      [1, 0.8, 0.3, 0.9, 0.5, 1],
    ],
    ["c1", -2.1, 23.1, 3.1, [1, 0.9, 0.6, 1, 0.4, 0.8], null],
    ["c2", 3.4, 23.1, 2.9, [0.6, 1, 0.9, 0.3, 0.8, 0.5], null],
  ];

  // What each run mostly holds (front, back), so neighbours differ.
  const themes: Record<string, [ShelfTheme, ShelfTheme]> = {
    a1: ["cartons", "bins"],
    a2: ["steel", "cartons"],
    b1: ["bins", "mixed"],
    b2: ["cartons", "steel"],
    c1: ["mixed", "mixed"],
    c2: ["steel", "bins"],
  };

  for (const [id, x0, z0, length, front, back] of runs) {
    const p = new Pieces();
    const boxes: Footprint[] = [];

    const [themeF, themeB] = themes[id];

    boxes.push(shelving(p, random, x0, z0, length, 0.6, "x", front, themeF));

    if (back) {
      boxes.push(
        shelving(p, random, x0, z0 + 0.6, length, 0.6, "x", back, themeB),
      );
    }

    map.createFitting(`fittings-maze-${id}`, F, p.elements, boxes);
  }

  // Cartons on a pallet awaiting relocation: against the south wall at the end
  // of the second south run, uneven and a little turned.
  {
    const p = new Pieces();

    p.box(6.7, 0, 23.2, 0.8, 0.1, 1.0, TIMBER_DARK);
    p.box(6.7, 0.1, 23.2, 0.8, 0.025, 1.0, TIMBER);
    p.box(6.65, 0.125, 23.25, 0.7, 0.36, 0.8, CARDBOARD_C, 0.05);
    p.box(6.75, 0.485, 23.15, 0.5, 0.3, 0.55, CARDBOARD_D, -0.12);
    p.box(6.6, 0.485, 23.5, 0.34, 0.2, 0.3, CARDBOARD, 0.2);
    map.createFitting("fittings-hall-pallet", F, p.elements, [
      { minX: 6.3, maxX: 7.1, minZ: 22.7, maxZ: 23.7, top: 0.85 },
    ]);
  }

  // One container group on the floor in the 2.4 m gap between the south row's
  // two runs, against the first run's end and the wall, so the lane left to the
  // second run is 1.5 m.
  {
    const p = new Pieces();

    // A blue-grey bin with a dark opening, and a carton laid on top of it.
    p.box(1.45, 0, 23.35, 0.9, 0.45, 0.7, 0x4a5568);
    p.box(1.45, 0.43, 23.35, 0.8, 0.012, 0.6, BLACK);
    p.box(1.4, 0.45, 23.35, 0.5, 0.17, 0.4, CARDBOARD_D, 0.15);
    map.createFitting("fittings-hall-floor-stock", F, p.elements, [
      { minX: 1.0, maxX: 1.9, minZ: 23.0, maxZ: 23.7, top: 0.62 },
    ]);
  }

  // The roller shutter of the wide north doorway (x -1 to 3), on the hall side
  // of the wall: a housing over the opening, guide rails down both jambs and
  // the curtain fully down, its bottom bar on the floor. It is closed: a solid
  // thin wall in the opening, so this entrance is shut (the hall has four
  // others: the other two north doors, the Store's and the Warehouse's).
  {
    const p = new Pieces();
    const x0 = -1.0;
    const x1 = 3.0;
    const cx = (x0 + x1) / 2;
    const wall = 15.3;

    // The housing (the rolled curtain) with end caps and a lip along its foot.
    p.box(cx, 2.5, wall + 0.14, x1 - x0 + 0.3, 0.45, 0.28, STEEL);
    p.box(x0 - 0.2, 2.48, wall + 0.14, 0.06, 0.49, 0.32, CHARCOAL);
    p.box(x1 + 0.2, 2.48, wall + 0.14, 0.06, 0.49, 0.32, CHARCOAL);
    p.box(cx, 2.46, wall + 0.26, x1 - x0 + 0.34, 0.06, 0.1, CHARCOAL);

    // Guide rails down both jambs, with a yellow cap at the foot of each.
    for (const gx of [x0 - 0.04, x1 + 0.04]) {
      p.box(gx, 0, wall + 0.06, 0.09, 2.5, 0.12, CHARCOAL);
      p.box(gx, 0, wall + 0.06, 0.12, 0.12, 0.15, ACCENT);
    }

    // The curtain: slats from the housing down to the bottom bar.
    const top = 2.46;
    const bottomBar = 0.0;
    const slat = 0.075;
    let i = 0;

    for (let y = top - slat; y > bottomBar + 0.1; y -= slat) {
      p.box(
        cx,
        y,
        wall + 0.1,
        x1 - x0 + 0.02,
        slat - 0.012,
        0.035,
        i % 2 === 0 ? 0x4a5666 : 0x414c5a,
      );
      i++;
    }

    // The bottom bar on the floor, a yellow strip along it and two lift
    // handles with a latch plate between them at hand height.
    p.box(cx, bottomBar, wall + 0.1, x1 - x0 + 0.1, 0.1, 0.07, CHARCOAL);
    p.box(cx, bottomBar + 0.1, wall + 0.14, x1 - x0 + 0.06, 0.03, 0.02, ACCENT);

    for (const px of [cx - 0.55, cx + 0.55]) {
      p.box(px, 0.9, wall + 0.14, 0.05, 0.16, 0.04, ACCENT);
    }

    p.box(cx, 0.94, wall + 0.14, 0.14, 0.1, 0.03, STEEL_BARE);

    map.createFitting("fittings-hall-shutter", F, p.elements, [
      {
        minX: x0 - 0.04,
        maxX: x1 + 0.04,
        minZ: wall,
        maxZ: wall + 0.16,
        top: 2.6,
      },
    ]);
  }
}

/** A timber pallet: three bearers under a deck of boards. */
export function pallet(
  p: Pieces,
  cx: number,
  cz: number,
  w: number,
  d: number,
  ry: number,
): void {
  for (const k of [-1, 0, 1]) {
    const [bx, bz] = turn(cx, cz, ry, k * (w / 2 - 0.06), 0);

    p.box(bx, 0, bz, 0.1, 0.1, d - 0.04, TIMBER_DARK, ry);
  }

  for (let i = 0; i < 5; i++) {
    const [sx, sz] = turn(cx, cz, ry, 0, (i - 2) * (d / 5));

    p.box(sx, 0.1, sz, w, 0.025, d / 5 - 0.03, i % 2 ? TIMBER_B : TIMBER, ry);
  }
}

/**
 * The yard (the old Store, opened up): working stock rather than shelving.
 * Each group is one fitting with one collision box per solid piece, and every
 * lane is 1.4 m or wider. The vent tunnel (x -13.6 to -12.4, z up to 21) and
 * the doorway lines are kept clear. The room is x -18 to -9, z 15.3 to 23.7.
 */
export function furnishYard(map: MapBuilder, floorY: number): void {
  const F = floorY;

  // ------------------------------------------------- pallet load, north-west
  {
    const p = new Pieces();
    const boxes: Footprint[] = [];

    pallet(p, -17.4, 15.82, 1.2, 1.0, 0.04);
    carton(p, -17.65, 0.125, 15.82, 0.55, 0.8, 0.45, 0.04);
    carton(p, -17.05, 0.125, 15.77, 0.5, 0.8, 0.5, 0.04, CARDBOARD_B);
    carton(p, -17.6, 0.575, 15.82, 0.5, 0.7, 0.4, 0.1, CARDBOARD_B);
    carton(p, -17.05, 0.625, 15.77, 0.45, 0.7, 0.35, -0.05);
    // A strap round the load, over the top.
    p.box(-17.4, 0.125, 15.82, 1.14, 0.9, 0.012, STEEL_BARE, 0.04);
    boxes.push(bounds(-17.4, 15.82, 1.2, 1.0, 0.04, 1.0));
    // A stack of cartons filling the rest of the way to the shelving, so there
    // is no pocket between the load and it (a body landing there is thrown out).
    carton(p, -17.45, 0, 16.67, 1.0, 0.6, 0.4, 0.0);
    carton(p, -17.4, 0.4, 16.67, 0.8, 0.5, 0.3, 0.12, CARDBOARD_B);
    boxes.push({
      minX: -18.0,
      maxX: -16.85,
      minZ: 16.34,
      maxZ: 17.0,
      top: 0.72,
    });
    map.createFitting("fittings-yard-pallet", F, p.elements, boxes);
  }

  // ------------------------- stock closing the Hall's opening (x -18, z 17-22)
  {
    const p = new Pieces();
    const boxes: Footprint[] = [];
    const random = rng(4409);

    // A loaded shelving unit across the whole opening, jamb to jamb.
    boxes.push(
      shelving(p, random, -18.0, 17.0, 5.0, 0.6, "z", [1, 0.9, 1, 0.85]),
    );
    map.createFitting("fittings-yard-stock", F, p.elements, boxes);
  }

  // --------------------------------------- wooden barricade (crates, middle)
  {
    const p = new Pieces();
    const boxes: Footprint[] = [];

    crate(p, -15.35, 0, 19.6, 1.2, 0.7, 0.9, 0.03, TIMBER);
    crate(p, -14.2, 0, 19.7, 1.0, 0.7, 0.7, -0.04, TIMBER_B);
    carton(p, -15.4, 0.9, 19.6, 0.5, 0.4, 0.28, 0.2);
    boxes.push(
      bounds(-15.35, 19.6, 1.2, 0.7, 0.03, 0.9),
      bounds(-14.2, 19.7, 1.0, 0.7, -0.04, 0.7),
    );
    map.createFitting("fittings-yard-barricade", F, p.elements, boxes);
  }

  // ------------------------------------- air compressor, south wall (west)
  {
    const p = new Pieces();

    // Base frame and motor on the floor, two upright receivers behind.
    p.box(-15.0, 0.12, 23.2, 1.5, 0.12, 0.9, CHARCOAL);
    p.box(-15.0, 0.24, 23.2, 1.3, 0.5, 0.6, STEEL);
    p.box(-15.0, 0.74, 23.2, 1.2, 0.08, 0.5, CHARCOAL);
    p.post(-15.45, 0.24, 23.2, 1.5, 0.27, 0x4a5640);
    p.post(-14.55, 0.24, 23.2, 1.5, 0.27, 0x4a5640);
    p.post(-15.45, 1.74, 23.2, 0.04, 0.2, STEEL_BARE);
    p.post(-14.55, 1.74, 23.2, 0.04, 0.2, STEEL_BARE);
    p.post(-15.0, 0.8, 23.2, 0.5, 0.05, ACCENT);
    p.chunk(-15.0, 1.4, 22.85, 0.07, STEEL_BARE);
    map.createFitting("fittings-yard-compressor", F, p.elements, [
      { minX: -15.8, maxX: -14.2, minZ: 22.75, maxZ: 23.65, top: 1.8 },
    ]);
  }

  // ----------------------------- steel workbench with a vise, south-east
  {
    const p = new Pieces();
    const x0 = -11;
    const x1 = -9.2;
    const cx = (x0 + x1) / 2;
    const cz = 23.25;

    for (const sx of [x0 + 0.06, x1 - 0.06]) {
      for (const sz of [cz - 0.3, cz + 0.3]) {
        p.box(sx, 0, sz, 0.07, 0.86, 0.07, CHARCOAL);
      }
    }

    p.box(cx, 0.86, cz, x1 - x0, 0.06, 0.74, STEEL_BARE);
    p.box(cx, 0.86, cz - 0.36, x1 - x0, 0.08, 0.03, ACCENT);
    p.box(cx, 0.28, cz, x1 - x0 - 0.1, 0.04, 0.66, STEEL);
    // A drawer unit, a vise and a parts tray.
    p.box(x0 + 0.4, 0.34, cz, 0.7, 0.5, 0.62, CHARCOAL);
    p.box(x0 + 0.4, 0.5, cz - 0.32, 0.6, 0.12, 0.02, STEEL_LIGHT);
    p.box(x0 + 0.4, 0.68, cz - 0.32, 0.6, 0.12, 0.02, STEEL_LIGHT);
    p.box(x1 - 0.25, 0.92, cz + 0.05, 0.22, 0.2, 0.2, STEEL);
    p.box(x1 - 0.25, 1.12, cz + 0.05, 0.16, 0.05, 0.14, STEEL_BARE);
    p.box(cx - 0.1, 0.92, cz, 0.4, 0.06, 0.3, GREY_BIN);
    map.createFitting("fittings-yard-workbench", F, p.elements, [
      { minX: x0, maxX: x1, minZ: cz - 0.37, maxZ: cz + 0.37, top: 1.0 },
    ]);
  }

  // ----------------------------- drums and gas cylinders, east corners
  {
    const p = new Pieces();

    drum(p, -10.05, 15.95, 0x5a4a38, true);
    drum(p, -9.7, 16.7, 0x3c5365);
    // Three gas cylinders chained to a post-less stand: dark with yellow collars.
    for (const z of [17.65, 18, 18.35]) {
      p.post(-9.7, 0, z, 1.35, 0.1, 0x3c4658);
      p.post(-9.7, 1.35, z, 0.06, 0.06, STEEL_BARE);
      p.post(-9.7, 1.2, z, 0.1, 0.11, ACCENT);
    }

    map.createFitting("fittings-yard-drums", F, p.elements, [
      { minX: -10.4, maxX: -9.35, minZ: 15.6, maxZ: 17.1, top: 0.9 },
      { minX: -9.85, maxX: -9.5, minZ: 17.5, maxZ: 18.5, top: 1.4 },
    ]);
  }

  // ----------------------- a service pipe along the north wall, above the door
  {
    const p = new Pieces();
    const n = new Network(p);
    const ZN = 15.3 + 0.16;
    const X: Vec3 = [1, 0, 0];

    n.run(
      [
        [-17.7, 3.3, ZN],
        [-9.4, 3.3, ZN],
      ],
      0.12,
      GUN,
    );

    for (const x of [-16.6, -14.9, -11.2, -9.9]) {
      n.clamp([x, 3.3, ZN], X, 0.12, [0, 0, -1], 0.07);
    }

    n.collar([-13, 3.3, ZN], X, 0.12, 0.1, GREY, 1.4);
    map.createFitting("fittings-yard-pipe", F, p.elements, []);
  }
}
