import { Pieces, rng } from "./FittingPieces";
import type { GraffitiDefinition } from "./ArenaLayout";
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
  p.cable(x, bottom + 0.11, z, 0.7, 0.22, DUFFEL, ry);
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

/** A double bunk against a side wall (west by default), running along z, drawn in `state`. */
function bunk(
  p: Pieces,
  random: () => number,
  z0: number,
  state: Bunk,
  wallX = -31.7,
  face: "+x" | "-x" = "+x",
): void {
  const f = new Frame(p, wallX, z0, face);
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

  // Rumpled bedding: uneven lumps and folds on each level, never the same twice.
  for (const [y] of levels) {
    for (let k = 0; k < 3; k++) {
      const u = 0.5 + random() * (len - 1.0);
      const v = 0.2 + random() * (wid - 0.4);
      const lump = [WOOL_GREY, WOOL_GREEN, 0x3f3b36, 0x5a5448, 0x35383c][
        Math.floor(random() * 5)
      ];

      p.box(
        f.wx(u, v),
        y + 0.13,
        f.wz(u, v),
        0.1 + random() * 0.18,
        0.03 + random() * 0.05,
        0.3 + random() * 0.4,
        lump,
        random() * Math.PI,
      );
    }
  }

  // Belongings: boots and a bag under the lower bed, per state.
  if (state === "made") {
    boot(p, f.wx(1.5, 0.3), f.wz(1.5, 0.3), 0.3);
    boot(p, f.wx(1.4, 0.55), f.wz(1.4, 0.55), -0.2);
    f.box(0.9, 0.0, 0.4, 0.7, 0.2, 0.4, DUFFEL);
  } else if (state === "slept") {
    duffel(p, f.wx(1.55, 0.42), 0, f.wz(1.55, 0.42), 0.15);
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

// ------------------------------------------------------------- the hideout
/** The thugs' marks, a mattress on the floor and a few bottles and cans. */
function hideout(map: MapBuilder, F: number): void {
  // Spray paint, painted onto the brick (see WallGraffiti): the gang's tag over
  // the card table with older paint beneath it, a handwritten number beside it,
  // a name crossed out in red, a warning, a crown and a tally.
  type Extra = { text?: string; count?: number; fade?: number };
  const pieces: Array<
    [
      string,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      GraffitiDefinition["kind"],
      number,
      Extra,
    ]
  > = [
    [
      "tag",
      -24.3,
      1.85,
      -11.7,
      0,
      1,
      3.0,
      1.3,
      "tag",
      11,
      { text: "KROW", fade: 0.55 },
    ],
    [
      "crown-n",
      -24.3,
      2.85,
      -11.7,
      0,
      1,
      0.8,
      0.5,
      "crown",
      71,
      { fade: 0.45 },
    ],
    ["skull", -22.6, 1.2, -11.7, 0, 1, 0.75, 0.75, "skull", 83, { fade: 0.6 }],
    [
      "187",
      -22.3,
      2.1,
      -11.7,
      0,
      1,
      0.8,
      0.4,
      "hand",
      23,
      { text: "187", fade: 0.7 },
    ],
    ["claws", -26.4, 2.3, -11.7, 0, 1, 0.6, 0.8, "claws", 97, { fade: 0.6 }],
    [
      "target",
      -30.4,
      2.45,
      -11.7,
      0,
      1,
      0.95,
      0.95,
      "target",
      101,
      { fade: 0.5 },
    ],
    ["cops", -21.3, 2.35, -4.9, -1, 0, 1.7, 0.7, "cross", 37, { text: "COPS" }],
    ["rules", -21.3, 2.3, -10.2, -1, 0, 1.3, 1.0, "rules", 113, { fade: 0.6 }],
    [
      "keepout",
      -29.2,
      1.25,
      -3.3,
      0,
      -1,
      2.2,
      0.55,
      "warning",
      41,
      { text: "KEEPOUT", fade: 0.85 },
    ],
    ["crown", -31.7, 2.3, -10.6, 1, 0, 1.1, 0.8, "crown", 53, { fade: 0.5 }],
    [
      "tally",
      -31.7,
      1.35,
      -9.3,
      1,
      0,
      0.8,
      0.5,
      "tally",
      67,
      { count: 2, fade: 0.7 },
    ],
  ];

  for (const [
    id,
    x,
    y,
    z,
    nx,
    nz,
    width,
    height,
    kind,
    seed,
    extra,
  ] of pieces) {
    map.addGraffiti({
      id: `graffiti-barracks-${id}`,
      x,
      y: F + y,
      z,
      nx,
      nz,
      width,
      height,
      kind,
      seed,
      ...extra,
    });
  }

  const p = new Pieces();

  // On the planning table: papers, a flashlight, a dented mug.
  p.box(-24.7, 0.74, -11.2, 0.3, 0.006, 0.22, 0xa8a48e, 0.3);
  p.box(-24.5, 0.746, -11.15, 0.24, 0.004, 0.18, 0x8a8674, -0.2);
  p.cable(-23.95, 0.775, -10.95, 0.17, 0.035, 0x23262a, 0.6);
  p.cableUp(-24.2, 0.74, -10.7, 0.09, 0.075, 0x4a4f55);

  // A hanging jacket on a hook by the north door, a pinned note and a crude map.
  p.box(-27.3, 1.45, -11.62, 0.5, 0.65, 0.06, 0x2c3238);
  p.box(-27.3, 2.08, -11.64, 0.12, 0.03, 0.05, STEEL_BARE);
  p.box(-30.7, 1.55, -11.68, 0.32, 0.4, 0.008, PAPER, 0.05);
  p.box(-30.3, 1.4, -11.68, 0.22, 0.28, 0.008, 0xa8a48e, -0.1);

  // Conduit and a pipe under the ceiling, along the north wall and the west.
  p.alongX(-31.6, -21.5, 3.2, -11.55, 0.07, 0x3a3f45);
  p.alongX(-31.6, -21.5, 3.05, -11.55, 0.03, 0x1d2024);
  p.alongZ(-31.55, 3.25, -11.6, -3.4, 0.06, 0x3a3f45);
  // Two pipes across the ceiling, over the lockers and over the table.
  p.alongZ(-26.0, 3.12, -11.6, -3.4, 0.08, 0x30353a);
  p.alongZ(-23.4, 3.18, -11.6, -3.4, 0.05, 0x23262a);

  map.createFitting("fittings-barracks-graffiti", F, p.elements, []);

  // A thin stained mattress on the floor by the first bunk, a dark blanket and a flat pillow.
  const q = new Pieces();

  q.box(-30.15, 0, -10.6, 0.85, 0.09, 1.85, TICKING_WORN);
  q.box(-30.3, 0.09, -10.45, 0.7, 0.04, 1.1, WOOL_GREY, 0.12);
  q.box(-30.4, 0.09, -11.3, 0.4, 0.06, 0.3, SHEET_DIRTY, 0.2);
  q.box(-30.0, 0.092, -9.9, 0.3, 0.003, 0.25, 0x2f3338, 0.5);

  // Bottles and cans: two standing and one fallen by the card table, a few
  // cans by the crate, a crushed one by the door.
  q.cableUp(-24.95, 0, -9.85, 0.24, 0.065, 0x2f5a3f);
  q.cableUp(-24.7, 0, -9.7, 0.2, 0.06, 0x5a3f22);
  q.cable(-24.1, 0.03, -9.55, 0.24, 0.06, 0x2f5a3f, 0.9);
  q.cableUp(-25.9, 0, -10.8, 0.12, 0.066, 0x8a8f94);
  q.cable(-25.7, 0.033, -10.4, 0.12, 0.066, 0x7a7e82, 0.4);
  q.cableUp(-22.6, 0, -7.3, 0.04, 0.066, 0x8a8f94);
  // A battered steel trunk and two cardboard boxes by the east lockers.
  q.box(-22.0, 0, -9.2, 0.7, 0.4, 0.4, 0x2f3438, 0.1);
  q.box(-22.0, 0.4, -9.2, 0.74, 0.04, 0.44, 0x23262a, 0.1);
  q.box(-22.4, 0, -10.6, 0.4, 0.3, 0.3, CARDBOARD, 0.3);
  q.box(-22.35, 0.3, -10.6, 0.34, 0.2, 0.26, CARDBOARD, -0.2);
  // A worn dark tarp on the floor between the beds and the table, ammunition
  // boxes and a duffel at the foot of the last bunk, more cans, and boots by the lockers.
  q.box(-26.0, 0, -6.4, 2.1, 0.01, 1.5, 0x25282b, 0.15);
  q.box(-29.9, 0, -4.2, 0.45, 0.26, 0.28, 0x4a5236, 0.2);
  q.box(-29.9, 0.26, -4.2, 0.46, 0.02, 0.29, 0x3a4128, 0.2);
  q.box(-29.4, 0, -4.5, 0.4, 0.22, 0.26, 0x2f3438, -0.3);
  q.cable(-26.6, 0.033, -6.9, 0.12, 0.066, 0x8a8f94, 1.9);
  q.cableUp(-25.2, 0, -5.4, 0.12, 0.066, 0x7a7e82);
  q.cable(-27.1, 0.033, -4.6, 0.12, 0.066, 0x7a7e82, 0.6);
  q.cableUp(-23.6, 0, -8.2, 0.12, 0.066, 0x8a8f94);
  // A restrained cluster by the lockers' south end: boxes, a bag, cans.
  q.box(-28.1, 0, -4.5, 0.42, 0.3, 0.34, CARDBOARD, 0.25);
  q.box(-28.05, 0.3, -4.5, 0.34, 0.22, 0.28, CARDBOARD, -0.3);
  q.cable(-28.6, 0.033, -5.2, 0.12, 0.066, 0x7a7e82, 1.2);
  q.cableUp(-28.4, 0, -5.45, 0.12, 0.066, 0x8a8f94);
  boot(q, -26.2, -5.1, 0.7);
  boot(q, -26.0, -5.35, 2.2);
  map.createFitting("fittings-barracks-hideout", F, q.elements, []);
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

  // ------------------------- a fourth bunk on the east wall, south of the door
  {
    const p = new Pieces();

    bunk(p, random, -5.9, "slept", -21.3, "-x");
    map.createFitting("bunk-barracks-4", F, p.elements, [
      { minX: -22.2, maxX: -21.3, minZ: -5.9, maxZ: -3.9, top: 1.75 },
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
    // Wear: rust patches, dents and chipped paint on the doors.
    for (let k = 0; k < 9; k++) {
      const u = 0.1 + random() * (z1 - z0 - 0.2);
      const y = 0.25 + random() * 1.5;
      const rust = k % 3 === 0;

      f.box(
        u,
        y,
        0.768,
        rust ? 0.1 + random() * 0.12 : 0.07,
        rust ? 0.08 + random() * 0.14 : 0.1,
        0.003,
        rust ? 0x5a3a28 : 0x23272b,
      );
    }

    // Scratches: thin pale scores, up and across the doors.
    for (let k = 0; k < 14; k++) {
      const u = 0.1 + random() * (z1 - z0 - 0.2);
      const y = 0.3 + random() * 1.5;
      const across = k % 2 === 0;

      f.box(
        u,
        y,
        0.769,
        across ? 0.12 + random() * 0.2 : 0.004,
        across ? 0.004 : 0.12 + random() * 0.3,
        0.002,
        0x595e66,
      );
    }

    // A small metal container at the end of the bank's top.
    f.box(z1 - z0 - 0.25, 1.93, 0.4, 0.26, 0.17, 0.2, 0x2f3438);

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
      p.cableUp(
        cx + 0.1 + k * 0.05,
        0.74,
        cz - 0.1 + (k % 2) * 0.04,
        0.008,
        0.035,
        0x9a8836,
      );
    }

    p.cableUp(cx + 0.35, 0.74, cz + 0.3, 0.03, 0.16, STEEL_LIGHT);
    p.cableUp(cx - 0.35, 0.74, cz - 0.3, 0.1, 0.08, 0x3c5a78);
    p.cableUp(cx - 0.05, 0.74, cz - 0.38, 0.22, 0.07, 0x2f5a3f);
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
      p.cableUp(cx, 0.4, cz, 0.04, 0.34, 0x5a4a3c);

      for (const a of [0, 1, 2]) {
        p.cable(cx, 0.2, cz, 0.36, 0.03, STEEL, a * (Math.PI / 3));
      }

      p.cableUp(cx, 0, cz, 0.4, 0.035, STEEL);
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
    p.cableUp(x0 + 0.62, 0.43, cz, 0.04, 0.001, BOOT);
    p.cable(x0 + 1.3, 0.47, cz, 0.3, 0.1, 0xa8a48e);
    p.cableUp(x0 + 1.9, 0.43, cz, 0.22, 0.07, STEEL_LIGHT);
    p.box(x1 - 0.4, 0.43, cz, 0.32, 0.05, 0.28, 0x3a4048, 0.2);
    map.createFitting("bench-barracks", F, p.elements, []);
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
    p.cableUp(-21.55, 1.44, -10.4, 0.1, 0.075, 0x3c5a78);
    p.cableUp(-21.55, 1.44, -10.25, 0.1, 0.075, 0xb9b49c);
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
      p.cableUp(x, lineY - 0.04, -5.0, 0.08, 0.04, STEEL);
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
    p.cableUp(-23.1, 0, -4.8, 0.08, 0.1, STEEL_BARE);
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
    color: 0x1c1e20,
    alpha: 0.42,
  });

  map.addDecal({
    id: "decal-room-barracks-damp-a",
    kind: "stain",
    x: -27.6,
    z: -7.6,
    y: F,
    width: 1.8,
    depth: 1.3,
    rotation: 0.3,
    color: 0x1c1f22,
    alpha: 0.4,
  });
  map.addDecal({
    id: "decal-room-barracks-damp-b",
    kind: "stain",
    x: -23.0,
    z: -5.4,
    y: F,
    width: 1.3,
    depth: 1.0,
    rotation: 1.1,
    color: 0x1c1f22,
    alpha: 0.35,
  });

  hideout(map, F);
}
