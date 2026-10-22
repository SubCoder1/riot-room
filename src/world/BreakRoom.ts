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
  lockerBank,
} from "./RoomKit";
import { turn } from "./StorageRoom";

/**
 * The Break room (x 22 to 32, z 3 to 12, floor 4; inside x 22.3 to 31.7 and
 * z 3.3 to 12): a neglected staff area. A worn table with mismatched chairs
 * in the middle, a sagging sofa by the north door, a kitchen run with a sink
 * and cupboards along the south wall (a water cooler and a bin at its end),
 * lockers and an old vending machine on the east wall, a notice board and a
 * stopped clock. The west door (z 6.5 to 8.5) and the north door (x 24 to 26)
 * keep a clear way across the room.
 */

const LAMINATE = 0x5d665f;
const LAMINATE_EDGE = 0x8a8f86;
const OLIVE = 0x4d5340;
const OLIVE_DARK = 0x3b4032;
const MUG_BLUE = 0x3c5a78;
const MUG_CREAM = 0xb9b49c;
const MUG_RED = 0x8a3a30;
const GLASS_GREEN = 0x2f5a3f;
const GLASS_BLUE = 0x2f4a68;
const BIN_BLUE = 0x4a5568;
const SNACK_RED = 0x6a3a35;
const SIGN_YELLOW = 0x9a8836;
const RUST_PATCH = 0x4a3a2e;

/** A chair: a seat, four legs and a back, turned by `ry` (its front looks along local +z). */
function chair(
  p: Pieces,
  cx: number,
  cz: number,
  ry: number,
  kind: "plastic" | "wood" | "metal" | "stool",
): void {
  const at = (dx: number, dz: number): [number, number] =>
    turn(cx, cz, ry, dx, dz);
  const seat =
    kind === "plastic"
      ? 0x3f5568
      : kind === "wood"
        ? TIMBER
        : kind === "metal"
          ? 0x7a6a2e
          : 0x5a4a3c;
  const frame = kind === "wood" ? TIMBER_DARK : STEEL;

  if (kind === "stool") {
    p.post(cx, 0.44, cz, 0.05, 0.38, seat);

    for (let a = 0; a < 3; a++) {
      p.bar(cx, 0.3, cz, 0.4, 0.03, frame, a * (Math.PI / 3));
    }

    p.post(cx, 0.05, cz, 0.4, 0.04, frame);
    p.post(cx, 0, cz, 0.05, 0.4, GUNMETAL);

    return;
  }

  const [sx, sz] = at(0, 0);

  p.box(sx, 0.43, sz, 0.44, 0.04, 0.42, seat, ry);

  for (const lx of [-0.18, 0.18]) {
    for (const lz of [-0.17, 0.17]) {
      const [x, z] = at(lx, lz);

      p.post(x, 0, z, 0.43, 0.035, frame);
    }
  }

  // The back: two posts and a panel, set a little back.
  const [bx, bz] = at(0, -0.2);

  p.box(bx, 0.55, bz, 0.42, 0.34, 0.03, seat, ry);

  for (const lx of [-0.19, 0.19]) {
    const [x, z] = at(lx, -0.2);

    p.post(x, 0.43, z, 0.5, 0.035, frame);
  }
}

/** A mug: a short cylinder with a handle, and a dark stain inside. */
function mug(
  p: Pieces,
  x: number,
  bottom: number,
  z: number,
  color: number,
): void {
  p.post(x, bottom, z, 0.1, 0.085, color);
  p.post(x, bottom + 0.097, z, 0.004, 0.065, 0x2a1d14);
  p.box(x + 0.052, bottom + 0.03, z, 0.02, 0.05, 0.012, color);
}

/** A bottle or can standing, with a cap. */
function bottle(
  p: Pieces,
  x: number,
  bottom: number,
  z: number,
  h: number,
  d: number,
  color: number,
): void {
  p.post(x, bottom, z, h, d, color);
  p.post(x, bottom + h, z, 0.03, d * 0.45, STEEL_BARE);
}

export function furnishBreakRoom(map: MapBuilder, floorY: number): void {
  const F = floorY;
  const random = rng(5203);

  // --------------------------------------------------- the table and its things
  {
    const p = new Pieces();
    const x0 = 26.0;
    const x1 = 28.4;
    const z0 = 6.1;
    const z1 = 7.3;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;

    // A laminate top with a worn edge, an apron and four steel legs.
    p.box(cx, 0.76, cz, 2.4, 0.04, 1.2, LAMINATE);
    p.box(cx, 0.755, cz, 2.42, 0.012, 1.22, LAMINATE_EDGE);
    p.box(cx, 0.68, cz, 2.2, 0.08, 1.0, GUNMETAL);

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        p.post(cx + sx * 1.1, 0, cz + sz * 0.5, 0.68, 0.05, STEEL);
      }
    }

    p.alongX(cx - 1.1, cx + 1.1, 0.2, cz - 0.5, 0.025, STEEL);
    p.alongX(cx - 1.1, cx + 1.1, 0.2, cz + 0.5, 0.025, STEEL);

    // Stains and burns on the top.
    p.box(cx - 0.5, 0.8, cz + 0.2, 0.3, 0.003, 0.22, 0x3d3a30, 0.4);
    p.box(cx + 0.7, 0.8, cz - 0.3, 0.16, 0.003, 0.16, 0x2a2622, 0.2);

    // Mugs, one still with something in it, and a spoon beside it.
    mug(p, cx - 0.8, 0.8, cz - 0.3, MUG_BLUE);
    mug(p, cx - 0.1, 0.8, cz + 0.35, MUG_CREAM);
    mug(p, cx + 0.95, 0.8, cz + 0.1, MUG_RED);
    p.box(cx - 0.68, 0.8, cz - 0.28, 0.12, 0.006, 0.014, STEEL_BARE, 0.3);

    // A pizza box with its lid up and a few crusts, a newspaper, a card pack.
    p.box(cx + 0.3, 0.8, cz - 0.05, 0.4, 0.035, 0.4, CARDBOARD, 0.3);
    p.box(
      cx + 0.32,
      0.835,
      cz - 0.28,
      0.4,
      0.01,
      0.4,
      CARDBOARD_B,
      0.3,
      0,
      -1.1,
    );
    p.box(cx + 0.32, 0.836, cz - 0.04, 0.3, 0.012, 0.32, 0xa8402a, 0.3);
    p.box(cx - 0.55, 0.8, cz + 0.28, 0.42, 0.008, 0.3, PAPER, -0.25);
    p.box(cx - 0.55, 0.808, cz + 0.28, 0.4, 0.002, 0.04, 0x2a2622, -0.25);
    p.box(cx + 0.55, 0.8, cz + 0.32, 0.07, 0.025, 0.1, 0x8a3a30, 0.5);

    // Two bottles, one lying down, an ashtray with butts.
    bottle(p, cx - 0.35, 0.8, cz - 0.1, 0.22, 0.07, GLASS_GREEN);
    p.bar(cx + 1.0, 0.835, cz - 0.38, 0.2, 0.065, GLASS_BLUE, 0.6);
    p.post(cx + 0.55, 0.8, cz - 0.3, 0.03, 0.12, STEEL_LIGHT);

    for (let k = 0; k < 4; k++) {
      p.box(
        cx + 0.52 + k * 0.02,
        0.83,
        cz - 0.3 + (k % 2) * 0.03,
        0.02,
        0.006,
        0.006,
        0xb9b49c,
        k,
      );
    }

    map.createFitting("table-break", F, p.elements, [
      { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: 0.8 },
    ]);
  }

  // ------------------------------------ the chairs: no two the same
  for (const [id, cx, cz, ry, kind] of [
    ["chair-break-1", 26.75, 5.95, 0, "plastic"],
    ["chair-break-2", 27.75, 5.98, 0.25, "wood"],
    ["chair-break-3", 26.9, 7.45, Math.PI - 0.1, "metal"],
    ["chair-break-4", 28.62, 6.7, -Math.PI / 2 + 0.2, "stool"],
  ] as const) {
    const p = new Pieces();

    chair(p, cx, cz, ry, kind);
    map.createFitting(id, F, p.elements, [
      {
        minX: cx - 0.24,
        maxX: cx + 0.24,
        minZ: cz - 0.24,
        maxZ: cz + 0.24,
        top: 0.9,
      },
    ]);
  }

  // A chair knocked over by the lockers (low, drawn and stoppable).
  {
    const p = new Pieces();
    const cx = 30.0;
    const cz = 9.6;

    p.box(cx, 0.0, cz, 0.04, 0.44, 0.42, 0x3f5568, 0.4);
    p.box(cx + 0.22, 0.06, cz - 0.05, 0.42, 0.34, 0.04, 0x3f5568, 0.4);

    for (const dz of [-0.17, 0.17]) {
      p.bar(cx + 0.2, 0.2, cz + dz, 0.42, 0.035, STEEL, 0.4);
    }

    map.createFitting("chair-break-fallen", F, p.elements, []);
  }

  // ---------------------------------------------------------- the sofa
  {
    const p = new Pieces();
    const x0 = 22.4;
    const x1 = 24.0;
    const z0 = 3.3;
    const z1 = 4.15;
    const f = new Frame(p, x0, z0, "+z");

    // Seen from the south: a frame, a back, two arms, two sagging cushions.
    f.box(0.8, 0, 0.42, 1.6, 0.18, 0.84, OLIVE_DARK);
    f.box(0.8, 0.18, 0.46, 1.5, 0.2, 0.7, OLIVE);
    f.box(0.8, 0.38, 0.14, 1.6, 0.46, 0.2, OLIVE_DARK);

    for (const s of [0.1, 1.5]) {
      f.box(s, 0.18, 0.42, 0.2, 0.42, 0.84, OLIVE_DARK);
    }

    // The cushions: one flattened, one with a dent and a split seam.
    f.box(0.45, 0.38, 0.5, 0.58, 0.07, 0.58, OLIVE);
    f.box(1.1, 0.38, 0.5, 0.6, 0.12, 0.58, 0x575d46);
    f.box(0.8, 0.5, 0.5, 0.012, 0.004, 0.5, 0x2a2622);
    // A stained patch and a folded blanket on one arm.
    f.box(1.1, 0.5, 0.45, 0.2, 0.004, 0.16, 0x2b2c24);
    f.box(0.1, 0.6, 0.42, 0.18, 0.06, 0.4, 0x6a4a38);
    // Feet.
    for (const u of [0.08, 1.52]) {
      for (const v of [0.08, 0.76]) {
        f.post(u, 0, v, 0.05, 0.05, BLACK);
      }
    }

    map.createFitting("sofa-break", F, p.elements, [
      { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: 0.85 },
    ]);
  }

  // -------------------------- the kitchen run along the south wall
  {
    const p = new Pieces();
    // The run's back is the south wall (z 12), its front looks north.
    const f = new Frame(p, 22.3, 12.0, "-z");
    const len = 3.0;
    const depth = 0.9;

    // Base cabinets: a plinth, a body, doors with handles, a worktop.
    f.box(len / 2, 0, depth / 2, len - 0.02, 0.1, depth - 0.1, BLACK);
    f.box(len / 2, 0.1, depth / 2 - 0.02, len, 0.78, depth - 0.1, GUNMETAL);

    for (let i = 0; i < 5; i++) {
      const u = 0.3 + i * 0.58;

      f.box(
        u,
        0.14,
        depth - 0.07,
        0.54,
        0.7,
        0.02,
        i % 3 === 1 ? 0x6a604a : 0x4a525c,
      );
      f.box(u + 0.2, 0.56, depth - 0.045, 0.02, 0.13, 0.03, STEEL_BARE);
    }

    f.box(len / 2, 0.88, depth / 2, len + 0.04, 0.05, depth, 0x7a766a);
    f.box(len / 2, 0.93, 0.04, len, 0.1, 0.04, 0x7a766a);

    // The sink: a steel basin and a tap, a dish rack, a draining board.
    f.box(0.8, 0.9, depth / 2 + 0.02, 0.7, 0.016, 0.5, STEEL_BARE);
    f.box(0.8, 0.906, depth / 2 + 0.02, 0.6, 0.002, 0.4, 0x2a2e34);
    f.post(0.8, 0.93, 0.1, 0.28, 0.03, STEEL_BARE);
    f.barOut(0.8, 1.2, 0.2, 0.2, 0.025, STEEL_BARE);
    f.box(1.35, 0.93, depth / 2, 0.4, 0.03, 0.36, STEEL_LIGHT);

    for (let k = 0; k < 4; k++) {
      f.box(1.2 + k * 0.08, 0.96, depth / 2, 0.02, 0.14, 0.3, CHARCOAL);
    }

    // On the worktop: a kettle, mugs, a bread bin, a toaster, a microwave, cleaning bottles.
    f.post(1.8, 0.93, 0.5, 0.2, 0.17, 0x8a2a24);
    f.box(1.8, 1.1, 0.5, 0.1, 0.02, 0.1, BLACK);
    f.post(2.02, 0.93, 0.35, 0.1, 0.08, MUG_BLUE);
    f.post(2.15, 0.93, 0.6, 0.1, 0.08, MUG_CREAM);
    f.box(0.2, 0.93, 0.4, 0.34, 0.2, 0.26, TIMBER_B);
    f.box(2.6, 0.93, 0.45, 0.5, 0.32, 0.4, 0x8a8f86);
    f.box(2.55, 0.99, 0.66, 0.3, 0.2, 0.01, GUNMETAL);
    f.box(2.82, 1.0, 0.66, 0.08, 0.2, 0.012, STEEL);
    bottle(p, f.wx(0.55, 0.8), 0.93, f.wz(0.55, 0.8), 0.2, 0.06, 0x5a8aa0);
    bottle(p, f.wx(0.66, 0.8), 0.93, f.wz(0.66, 0.8), 0.17, 0.055, 0xa8402a);

    // Wall cupboards: shallow, mismatched, one door hanging.
    for (let i = 0; i < 4; i++) {
      const u = 0.35 + i * 0.7;

      f.box(u, 1.55, 0.17, 0.66, 0.72, 0.32, i === 2 ? 0x6a604a : 0x4a525c);
      f.box(u + 0.2, 1.6, 0.335, 0.02, 0.16, 0.025, STEEL_BARE);
    }

    f.box(1.4, 1.55, 0.2, 0.012, 0.7, 0.26, 0x4a525c);
    // A leak stain down the wall under the cupboards.
    f.box(2.5, 1.0, 0.012, 0.5, 0.5, 0.004, 0x2a2e34);
    map.createFitting("counter-break", F, p.elements, [
      {
        minX: 22.3,
        maxX: 22.3 + len,
        minZ: 12.0 - depth,
        maxZ: 12.0,
        top: 0.95,
      },
    ]);
  }

  // ------------------------------------ water cooler and a full bin
  {
    const p = new Pieces();
    const f = new Frame(p, 25.3, 12.0, "-z");

    // The cooler: a pale body, two taps, a drip tray and a blue jug.
    f.box(0.275, 0, 0.28, 0.5, 0.95, 0.52, 0xa8aeb4);
    f.box(0.275, 0.95, 0.28, 0.52, 0.06, 0.54, 0x8a9096);
    f.box(0.275, 0.55, 0.55, 0.3, 0.035, 0.1, STEEL_BARE);
    f.box(0.2, 0.72, 0.55, 0.04, 0.05, 0.05, 0x3c5a78);
    f.box(0.34, 0.72, 0.55, 0.04, 0.05, 0.05, 0x8a3a30);
    f.post(0.275, 1.01, 0.28, 0.42, 0.34, 0x3c6a8a);
    f.post(0.275, 1.43, 0.28, 0.03, 0.1, STEEL_BARE);
    f.box(0.275, 0.45, 0.55, 0.12, 0.08, 0.02, 0x2a2e34);
    map.createFitting("cooler-break", F, p.elements, [
      { minX: 25.3, maxX: 25.85, minZ: 11.45, maxZ: 12.0, top: 1.45 },
    ]);

    const b = new Pieces();

    // The bin: a steel drum with the lid off and rubbish heaped over the top.
    b.post(28.35, 0, 11.75, 0.7, 0.46, BIN_BLUE);
    b.post(28.35, 0.7, 11.75, 0.03, 0.5, CHARCOAL);
    b.post(28.35, 0.2, 11.75, 0.04, 0.48, CHARCOAL);
    b.chunk(28.35, 0.72, 11.75, 0.34, 0x6a6458, 1);
    b.chunk(28.27, 0.8, 11.7, 0.18, 0x8a8f86, 2);
    b.box(28.55, 0.78, 11.8, 0.2, 0.01, 0.14, CARDBOARD, 0.5);
    b.post(28.75, 0, 11.75, 0.02, 0.46, 0x2a2622);
    map.createFitting("bin-break", F, b.elements, [
      { minX: 28.1, maxX: 28.6, minZ: 11.5, maxZ: 12.0, top: 0.8 },
    ]);
  }

  // ----------------------------------- the lockers, east wall, mismatched
  {
    const p = new Pieces();
    const f = new Frame(p, 31.7, 5.0, "-x");

    lockerBank(
      f,
      random,
      7,
      0.5,
      0.6,
      [0x4a525c, 0x3f5a4a, 0x5a5a52, 0x4a525c, 0x3f5568],
      [3],
    );
    // A poster scrap and a coat hung over a door.
    f.box(1.0, 1.0, 0.614, 0.2, 0.22, 0.004, PAPER);
    f.box(2.5, 1.2, 0.62, 0.1, 0.5, 0.02, 0x4a4036);
    map.createFitting("lockers-break", F, p.elements, [
      { minX: 31.1, maxX: 31.7, minZ: 5.0, maxZ: 8.5, top: 1.9 },
    ]);
  }

  // ------------------------------------------ an old vending machine
  {
    const p = new Pieces();
    const f = new Frame(p, 31.7, 9.1, "-x");
    const w = 1.1;
    const d = 0.9;

    f.box(w / 2, 0, d / 2, w, 0.1, d - 0.04, BLACK);
    f.box(w / 2, 0.1, d / 2, w, 1.75, d - 0.04, SNACK_RED);
    // A faded sign panel across the top, off.
    f.box(w / 2, 1.7, d - 0.02, w - 0.06, 0.14, 0.03, LABEL);
    f.box(w / 2, 1.73, d - 0.004, w - 0.3, 0.05, 0.008, 0x8a3a30);
    // The window, cracked, with product rows behind it.
    f.box(0.4, 0.45, d - 0.01, 0.7, 1.15, 0.02, 0x1d242e);

    for (let r = 0; r < 5; r++) {
      f.box(0.4, 0.55 + r * 0.22, d - 0.04, 0.66, 0.012, 0.16, STEEL);

      for (let c = 0; c < 5; c++) {
        if ((r + c) % 4 === 3) continue;

        f.box(
          0.14 + c * 0.13,
          0.57 + r * 0.22,
          d - 0.07,
          0.09,
          0.14,
          0.05,
          [0x8a3a30, 0x3c5a78, 0x9a8836, 0x4a6a4a][(r * 3 + c) % 4],
        );
      }
    }

    // A crack across the glass.
    f.box(0.45, 0.9, d + 0.003, 0.012, 0.5, 0.004, 0xa8aeb4);
    f.box(0.5, 0.75, d + 0.003, 0.2, 0.01, 0.004, 0xa8aeb4);
    // The control column: a coin slot, buttons, a dead display, the delivery flap.
    f.box(0.93, 0.5, d - 0.01, 0.22, 1.1, 0.02, 0x3a3f46);
    f.box(0.93, 1.35, d + 0.004, 0.14, 0.06, 0.008, 0x1a1a14);
    f.box(0.93, 1.1, d + 0.004, 0.06, 0.1, 0.008, STEEL_BARE);

    for (let k = 0; k < 6; k++) {
      f.box(
        0.88 + (k % 2) * 0.1,
        0.75 + Math.floor(k / 2) * 0.1,
        d + 0.004,
        0.05,
        0.04,
        0.008,
        k === 4 ? 0x9a8836 : STEEL_LIGHT,
      );
    }

    f.box(0.4, 0.14, d - 0.02, 0.62, 0.18, 0.04, BLACK);
    f.box(0.4, 0.2, d + 0.004, 0.5, 0.06, 0.008, 0x2a2e34);
    // Scuffs near the foot, rust at the base.
    f.box(0.2, 0.1, d + 0.006, 0.3, 0.1, 0.004, RUST_PATCH);
    map.createFitting("vending-break", F, p.elements, [
      { minX: 30.8, maxX: 31.7, minZ: 9.1, maxZ: 10.2, top: 1.85 },
    ]);
  }

  // -------------------- on the walls, and small things on the floor
  {
    const p = new Pieces();

    // The notice board and a stopped clock, on the north wall east of the door.
    p.box(28.2, 1.3, 3.33, 1.7, 0.9, 0.04, TIMBER_DARK);
    p.box(28.2, 1.34, 3.36, 1.6, 0.82, 0.012, 0x7a5c3c);

    for (const [x, y, w, h, tone, ry] of [
      [27.6, 1.8, 0.3, 0.4, PAPER, 0.05],
      [28.1, 1.75, 0.42, 0.3, 0xa8a48e, -0.04],
      [28.6, 1.7, 0.26, 0.38, LABEL, 0.1],
      [27.75, 1.45, 0.34, 0.24, 0x8a8f86, 0],
      [28.75, 1.45, 0.24, 0.3, PAPER, -0.08],
    ] as const) {
      p.box(x, y, 3.375, w, h, 0.004, tone, ry);
      p.chunk(x, y + h - 0.03, 3.382, 0.025, 0x8a3a30);
    }

    p.post(30.3, 2.1, 3.4, 0.04, 0.4, STEEL);
    p.post(30.3, 2.12, 3.405, 0.01, 0.34, LABEL);
    p.box(30.3, 2.3, 3.41, 0.012, 0.15, 0.003, BLACK);
    p.box(30.34, 2.31, 3.41, 0.1, 0.012, 0.003, BLACK);
    // A hazard sign and an extinguisher by the west door.
    extinguisher(p, 22.3, 0.9, 9.2, "x", 1);
    p.box(22.31, 1.7, 5.6, 0.012, 0.3, 0.3, SIGN_YELLOW);
    // Rubbish and cans on the floor: crushed cans, a food wrapper, a few papers.
    p.post(29.4, 0, 8.1, 0.12, 0.065, 0x8a3a30);
    p.bar(29.9, 0.03, 7.6, 0.12, 0.065, 0x3c5a78, 0.8);
    p.box(30.2, 0, 8.9, 0.24, 0.006, 0.18, 0x9a8836, 0.5);
    p.box(25.7, 0, 9.4, 0.3, 0.004, 0.22, PAPER, 0.3);
    p.box(27.4, 0, 10.4, 0.22, 0.004, 0.3, PAPER, -0.6);
    p.chunk(24.6, 0, 8.2, 0.12, 0x6a6458, 3);
    // A mop bucket in the south-west, yellow and chipped, with a mop.
    p.post(23.2, 0, 10.4, 0.34, 0.34, 0x9a8836);
    p.post(23.2, 0.34, 10.4, 0.01, 0.3, 0x1f2328);
    p.post(23.28, 0.34, 10.45, 0.9, 0.025, TIMBER_B);
    p.chunk(23.2, 0.35, 10.4, 0.2, 0x6a6458, 4);
    map.createFitting("fittings-break-wall", F, p.elements, []);
  }

  map.addDecal({
    id: "decal-room-break-spill",
    kind: "stain",
    x: 27.3,
    z: 8.1,
    y: F,
    width: 1.3,
    depth: 0.9,
    rotation: 0.4,
    color: 0x2a2a26,
    alpha: 0.4,
  });
  map.addDecal({
    id: "decal-room-break-dust",
    kind: "dust",
    x: 29.0,
    z: 5.6,
    y: F,
    width: 3.4,
    depth: 1.6,
    rotation: 0,
    color: 0x30343a,
    alpha: 0.3,
  });
}
