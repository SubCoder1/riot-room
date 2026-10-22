import { Pieces, rng } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import {
  CARDBOARD,
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
  lockerBank,
} from "./RoomKit";

/**
 * The Barracks (x -32 to -21, z -12 to -3, floor 4; inside x -31.7 to -21.3,
 * z -11.7 to -3.3): where the thugs sleep. Three metal bunk beds along the
 * west wall, each in a different state of use (made, slept in, stripped); two
 * locker banks standing as a half wall across the room, with a gap in line
 * with the east door; a card table and stools in the north-east; a shared
 * bench, a footlocker, a washing line, a wall shelf of personal things and
 * the odd boot and bag on the floor.
 *
 * Doors: east (z -8 to -6) and north (x -29 to -27) keep a clear way in.
 */

const TICKING = 0x56606c;
const TICKING_WORN = 0x6a665a;
const WOOL_GREY = 0x4a4a42;
const WOOL_RED = 0x6a3a35;
const WOOL_GREEN = 0x4d5340;
const SHEET = 0x9a9486;
const SHEET_DIRTY = 0x7a7466;
const BOOT = 0x2a2218;
const DUFFEL = 0x4a5236;

/** A boot, side on: a sole, a shaft and a toe. */
function boot(p: Pieces, x: number, z: number, ry: number): void {
  p.box(x, 0, z, 0.3, 0.05, 0.1, BOOT, ry);
  p.box(
    x - Math.cos(ry) * 0.07,
    0.05,
    z + Math.sin(ry) * 0.07,
    0.12,
    0.2,
    0.09,
    BOOT,
    ry,
  );
  p.box(
    x + Math.cos(ry) * 0.06,
    0.05,
    z - Math.sin(ry) * 0.06,
    0.14,
    0.07,
    0.09,
    0x3a2e20,
    ry,
  );
}

/** A soft duffel bag lying on its side: a round body, two straps and a toggle. */
function duffel(
  p: Pieces,
  x: number,
  bottom: number,
  z: number,
  ry: number,
): void {
  p.bar(x, bottom + 0.11, z, 0.7, 0.22, DUFFEL, ry);
  p.box(x, bottom, z, 0.04, 0.24, 0.16, 0x2f3828, ry);
  p.box(
    x + Math.cos(ry) * 0.22,
    bottom,
    z - Math.sin(ry) * 0.22,
    0.04,
    0.24,
    0.16,
    0x2f3828,
    ry,
  );
  p.box(x, bottom + 0.2, z, 0.3, 0.03, 0.05, STEEL_BARE, ry);
}

type Bunk = "made" | "slept" | "stripped";

/** A double bunk against the west wall, running along z, drawn in `state`. */
function bunk(p: Pieces, random: () => number, z0: number, state: Bunk): void {
  const f = new Frame(p, -31.7, z0, "+x");
  const len = 2.0;
  const wid = 0.9;
  const levels: Array<[number, "low" | "high"]> = [
    [0.28, "low"],
    [1.0, "high"],
  ];

  // Four corner posts and top rails.
  for (const u of [0.03, len - 0.03]) {
    for (const v of [0.03, wid - 0.03]) {
      f.box(u, 0, v, 0.05, 1.75, 0.05, STEEL);
    }
  }

  for (const v of [0.03, wid - 0.03]) {
    f.box(len / 2, 1.72, v, len, 0.04, 0.04, STEEL);
  }

  f.box(0.03, 1.72, wid / 2, 0.04, 0.04, wid, STEEL);
  f.box(len - 0.03, 1.72, wid / 2, 0.04, 0.04, wid, STEEL);

  for (const [y, which] of levels) {
    // Side rails, a slatted base, the mattress.
    for (const v of [0.03, wid - 0.03]) {
      f.box(len / 2, y - 0.04, v, len, 0.08, 0.04, STEEL_LIGHT);
    }

    f.box(len / 2, y - 0.02, wid / 2, len - 0.06, 0.02, wid - 0.08, GUNMETAL);

    for (let k = 0; k < 6; k++) {
      f.box(
        0.2 + k * 0.32,
        y - 0.015,
        wid / 2,
        0.05,
        0.016,
        wid - 0.06,
        CHARCOAL,
      );
    }

    const mattress =
      state === "stripped" && which === "high"
        ? TICKING_WORN
        : random() < 0.5
          ? TICKING
          : TICKING_WORN;

    f.box(len / 2 + 0.02, y, wid / 2, len - 0.12, 0.13, wid - 0.12, mattress);

    // A stain and a worn corner on the mattress.
    f.box(
      0.9 + random() * 0.6,
      y + 0.131,
      wid / 2 + (random() - 0.5) * 0.3,
      0.3,
      0.003,
      0.22,
      0x2f3338,
    );

    const made = state === "made" || (state === "slept" && which === "high");

    if (state === "stripped" && which === "high") {
      // Nothing on it but a folded blanket at the foot.
      f.box(len - 0.4, y + 0.13, wid / 2, 0.4, 0.07, wid - 0.2, WOOL_GREEN);
      continue;
    }

    // The pillow at the head (u small), a sheet, a folded blanket at the foot.
    f.box(
      0.28,
      y + 0.13,
      wid / 2,
      0.38,
      0.09,
      wid - 0.28,
      state === "slept" && which === "low" ? SHEET_DIRTY : SHEET,
    );

    if (made) {
      f.box(
        1.1,
        y + 0.13,
        wid / 2,
        1.3,
        0.035,
        wid - 0.14,
        which === "high" ? WOOL_GREY : WOOL_RED,
      );
      f.box(
        1.75,
        y + 0.165,
        wid / 2,
        0.36,
        0.06,
        wid - 0.18,
        which === "high" ? WOOL_RED : WOOL_GREY,
      );
    } else {
      // Thrown back, a heap on the side and a corner trailing off the edge.
      f.box(1.2, y + 0.13, wid / 2 + 0.2, 1.0, 0.1, 0.3, WOOL_GREY);
      f.box(0.8, y + 0.13, wid / 2 - 0.1, 0.5, 0.035, 0.34, SHEET_DIRTY);
      f.box(1.45, y - 0.12, wid - 0.07, 0.4, 0.2, 0.02, WOOL_GREY);
    }
  }

  // The upper bunk's guard rail on the open side, and a ladder at the foot.
  f.box(len / 2 - 0.1, 1.32, wid - 0.03, len - 0.6, 0.03, 0.03, STEEL);
  f.box(0.5, 1.12, wid - 0.03, 0.03, 0.2, 0.03, STEEL);
  f.box(len - 0.5, 1.12, wid - 0.03, 0.03, 0.2, 0.03, STEEL);

  for (const v of [0.2, wid - 0.2]) {
    f.box(len - 0.03, 0, v, 0.03, 1.1, 0.04, STEEL_BARE);
  }

  for (const y of [0.28, 0.56, 0.84]) {
    f.box(len - 0.03, y, wid / 2, 0.03, 0.03, wid - 0.4, STEEL_BARE);
  }

  // A number tag on the head post.
  f.box(0.03, 1.5, wid - 0.003, 0.06, 0.08, 0.005, LABEL);

  // Belongings: boots and a bag under the lower bed, per state.
  if (state === "made") {
    boot(p, f.wx(1.5, 0.3), f.wz(1.5, 0.3), 0.3);
    boot(p, f.wx(1.4, 0.55), f.wz(1.4, 0.55), -0.2);
    f.box(0.9, 0.0, 0.4, 0.7, 0.2, 0.4, DUFFEL);
  } else if (state === "slept") {
    boot(p, f.wx(0.5, wid + 0.25), f.wz(0.5, wid + 0.25), 1.2);
    boot(p, f.wx(0.8, wid + 0.4), f.wz(0.8, wid + 0.4), 2.2);
    f.box(1.0, 0.0, 0.42, 0.9, 0.22, 0.4, 0x5a4a38);
    // A jacket over the upper rail.
    f.box(1.1, 1.05, wid + 0.035, 0.6, 0.5, 0.05, 0x3a4048);
  } else {
    f.box(0.6, 0.0, 0.45, 0.5, 0.3, 0.5, TIMBER);
    f.box(0.6, 0.3, 0.45, 0.54, 0.03, 0.54, TIMBER_B);
    boot(p, f.wx(1.6, 0.4), f.wz(1.6, 0.4), 0.8);
  }
}

export function furnishBarracks(map: MapBuilder, floorY: number): void {
  const F = floorY;
  const random = rng(6101);

  // ---------------------------------------------------------- the three bunks
  for (const [id, z0, state] of [
    ["bunk-barracks-1", -11.7, "made"],
    ["bunk-barracks-2", -8.9, "slept"],
    ["bunk-barracks-3", -5.3, "stripped"],
  ] as const) {
    const p = new Pieces();

    bunk(p, random, z0, state);
    map.createFitting(id, F, p.elements, [
      { minX: -31.7, maxX: -30.8, minZ: z0, maxZ: z0 + 2.0, top: 1.75 },
    ]);
  }

  // -------------------------------- the lockers, a half wall facing the beds
  for (const [id, z0, z1, count, open] of [
    ["lockers-barracks-a", -11.7, -8.5, 7, [2]],
    ["lockers-barracks-b", -5.5, -3.3, 5, [3]],
  ] as const) {
    const p = new Pieces();
    const f = new Frame(p, -26.63, z0, "-x");

    lockerBank(
      f,
      random,
      count,
      (z1 - z0) / count,
      0.75,
      [0x4a525c, 0x3f5568, 0x5a5a52, 0x4a525c, 0x3f5a4a],
      [...open],
    );
    // On top: a rolled blanket, a tin box, a duffel and a radio.
    f.box(0.6, 1.93, 0.4, 0.5, 0.14, 0.36, WOOL_GREEN);
    f.box(1.4, 1.93, 0.4, 0.34, 0.14, 0.24, 0x7a5a38);
    duffel(p, f.wx(2.1, 0.4), 1.93, f.wz(2.1, 0.4), 0.4);
    f.box(2.55, 1.93, 0.4, 0.2, 0.12, 0.1, GUNMETAL);
    f.box(2.55, 2.05, 0.4, 0.005, 0.1, 0.005, STEEL_BARE);
    // A photograph and a note taped to one door.
    f.box(0.7, 1.1, 0.766, 0.1, 0.13, 0.004, PAPER);
    f.box(1.6, 1.35, 0.766, 0.07, 0.1, 0.004, 0xa8a48e);
    map.createFitting(id, F, p.elements, [
      { minX: -27.38, maxX: -26.63, minZ: z0, maxZ: z1, top: 1.9 },
    ]);
  }

  // ------------------------------------ the card table and its seats
  {
    const p = new Pieces();
    const x0 = -25.0;
    const x1 = -23.8;
    const z0 = -11.7;
    const z1 = -10.5;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;

    p.box(cx, 0.7, cz, 1.2, 0.04, 1.2, TIMBER_B);
    p.box(cx, 0.66, cz, 1.0, 0.05, 1.0, TIMBER_DARK);

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        p.box(cx + sx * 0.52, 0, cz + sz * 0.52, 0.06, 0.7, 0.06, TIMBER_DARK);
      }
    }

    // Playing cards, a few coins, an overflowing tin ashtray, a mug, a bottle.
    for (let k = 0; k < 5; k++) {
      p.box(
        cx - 0.3 + k * 0.1,
        0.74,
        cz + 0.1 - (k % 2) * 0.05,
        0.065,
        0.004,
        0.09,
        LABEL,
        k * 0.7,
      );
    }

    p.box(cx + 0.3, 0.74, cz - 0.25, 0.1, 0.004, 0.14, 0xb9b49c, 0.6);

    for (let k = 0; k < 4; k++) {
      p.post(
        cx + 0.1 + k * 0.05,
        0.74,
        cz - 0.1 + (k % 2) * 0.04,
        0.008,
        0.035,
        0x9a8836,
      );
    }

    p.post(cx + 0.35, 0.74, cz + 0.3, 0.03, 0.16, STEEL_LIGHT);
    p.post(cx - 0.35, 0.74, cz - 0.3, 0.1, 0.08, 0x3c5a78);
    p.post(cx - 0.05, 0.74, cz - 0.38, 0.22, 0.07, 0x2f5a3f);
    map.createFitting("table-barracks", F, p.elements, [
      { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: 0.75 },
    ]);
  }

  // Three seats round it: a crate, a stool, an ammunition box.
  for (const [id, cx, cz, kind] of [
    ["seat-barracks-1", -25.5, -11.1, "crate"],
    ["seat-barracks-2", -23.3, -11.1, "stool"],
    ["seat-barracks-3", -24.4, -10.0, "box"],
  ] as const) {
    const p = new Pieces();

    if (kind === "crate") {
      p.box(cx, 0, cz, 0.4, 0.4, 0.4, TIMBER);
      p.box(cx, 0.4, cz, 0.42, 0.025, 0.42, TIMBER_B);
      p.box(cx, 0.15, cz + 0.2, 0.3, 0.06, 0.006, TIMBER_DARK);
    } else if (kind === "stool") {
      p.post(cx, 0.4, cz, 0.04, 0.34, 0x5a4a3c);

      for (const a of [0, 1, 2]) {
        p.bar(cx, 0.2, cz, 0.36, 0.03, STEEL, a * (Math.PI / 3));
      }

      p.post(cx, 0, cz, 0.4, 0.035, STEEL);
    } else {
      p.box(cx, 0, cz, 0.45, 0.32, 0.25, 0x4a5236);
      p.box(cx, 0.32, cz, 0.46, 0.02, 0.26, 0x3a4128);
    }

    map.createFitting(id, F, p.elements, []);
  }

  // ---------------------------- the shared bench and the footlocker
  {
    const p = new Pieces();
    const x0 = -25.6;
    const x1 = -22.8;
    const cz = -3.52;

    p.box((x0 + x1) / 2, 0.38, cz, x1 - x0, 0.05, 0.4, TIMBER);

    for (const x of [x0 + 0.15, (x0 + x1) / 2, x1 - 0.15]) {
      p.box(x, 0, cz, 0.06, 0.38, 0.36, TIMBER_DARK);
    }

    // Boots, a rolled towel, a flask and a folded shirt on it.
    boot(p, x0 + 0.5, cz, 0.1);
    p.post(x0 + 0.62, 0.43, cz, 0.04, 0.001, BOOT);
    p.bar(x0 + 1.3, 0.47, cz, 0.3, 0.1, 0xa8a48e);
    p.post(x0 + 1.9, 0.43, cz, 0.22, 0.07, STEEL_LIGHT);
    p.box(x1 - 0.4, 0.43, cz, 0.32, 0.05, 0.28, 0x3a4048, 0.2);
    map.createFitting("bench-barracks", F, p.elements, []);

    const q = new Pieces();

    // A steel-banded footlocker in the south-east corner, lid slightly off.
    q.box(-21.8, 0, -3.75, 0.9, 0.5, 0.8, 0x4a4036);

    for (const dx of [-0.3, 0.3]) {
      q.box(-21.8 + dx, 0, -3.75, 0.05, 0.52, 0.82, STEEL);
    }

    q.box(-21.8, 0.5, -3.75, 0.94, 0.04, 0.84, TIMBER_DARK, 0.08);
    q.box(-21.8, 0.2, -3.34, 0.1, 0.1, 0.02, STEEL_BARE);
    q.box(-21.55, 0.54, -3.8, 0.3, 0.015, 0.2, PAPER, 0.5);
    map.createFitting("footlocker-barracks", F, q.elements, [
      { minX: -22.25, maxX: -21.35, minZ: -4.15, maxZ: -3.35, top: 0.55 },
    ]);
  }

  // ------------- things on the walls, overhead and loose on the floor (drawn)
  {
    const p = new Pieces();

    // A wall shelf north of the east door with a few personal things.
    p.box(-21.55, 1.4, -10.2, 0.28, 0.04, 2.0, TIMBER_B);

    for (const z of [-11.0, -9.4]) {
      p.box(-21.45, 1.25, z, 0.1, 0.15, 0.04, STEEL);
    }

    p.box(-21.55, 1.44, -10.9, 0.2, 0.16, 0.24, 0x5a4a38);
    p.post(-21.55, 1.44, -10.4, 0.1, 0.075, 0x3c5a78);
    p.post(-21.55, 1.44, -10.25, 0.1, 0.075, 0xb9b49c);
    p.box(-21.55, 1.44, -9.8, 0.18, 0.2, 0.012, 0x6a6458, 0, 0, -0.1);
    p.box(-21.62, 1.44, -9.55, 0.2, 0.14, 0.3, CARDBOARD);
    // A washing line across the room above head height, with a few things hung on it.
    const lineY = 2.35;

    p.alongX(-26.55, -21.45, lineY, -5.0, 0.012, 0x9a9486);

    for (const [x, w, h, color] of [
      [-25.8, 0.34, 0.28, 0x6a665a],
      [-25.0, 0.3, 0.3, 0x3a4048],
      [-23.5, 0.36, 0.26, 0x7a7466],
      [-22.8, 0.12, 0.2, 0x4d5340],
      [-22.55, 0.12, 0.2, 0x6a3a35],
    ] as const) {
      p.box(x, lineY - h, -5.0, w, h, 0.012, color, 0, 0, 0);
    }

    for (const x of [-26.55, -21.45]) {
      p.post(x, lineY - 0.04, -5.0, 0.08, 0.04, STEEL);
    }

    // An extinguisher and a rota on the north wall by the door.
    extinguisher(p, -26.4, 0.9, -11.7, "z", 1);
    p.box(-29.95, 1.5, -11.69, 0.4, 0.55, 0.01, PAPER);

    for (let r = 0; r < 5; r++) {
      p.box(-29.95, 1.57 + r * 0.09, -11.683, 0.3, 0.012, 0.004, 0x2a2622);
    }

    // On the floor: boots by the east door, a magazine, a tin, a duffel.
    boot(p, -22.1, -6.6, 0.4);
    boot(p, -22.0, -6.2, -0.3);
    p.box(-24.0, 0, -6.5, 0.28, 0.008, 0.2, 0xa8402a, 0.4);
    p.post(-23.1, 0, -4.8, 0.08, 0.1, STEEL_BARE);
    duffel(p, -29.8, 0, -6.2, 0.2);
    map.createFitting("fittings-barracks-wall", F, p.elements, []);
  }

  map.addDecal({
    id: "decal-room-barracks-dust",
    kind: "dust",
    x: -29.2,
    z: -7.5,
    y: F,
    width: 3.4,
    depth: 6,
    rotation: 0,
    color: 0x30343a,
    alpha: 0.3,
  });
  map.addDecal({
    id: "decal-room-barracks-stain",
    kind: "stain",
    x: -24.2,
    z: -8.3,
    y: F,
    width: 1.4,
    depth: 1.0,
    rotation: 0.5,
    color: 0x2a2a26,
    alpha: 0.3,
  });
}
