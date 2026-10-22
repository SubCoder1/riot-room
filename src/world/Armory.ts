import type { FramePart } from "./ArenaLayout";
import { Pieces, rng } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import {
  BLACK,
  CARDBOARD,
  CHARCOAL,
  Frame,
  GUNMETAL,
  LABEL,
  LED_AMBER,
  LED_GREEN,
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
import { shelving } from "./StorageRoom";

/**
 * The Armory (x -32 to -20.2, z 5 to 12, floor 4; inside x -31.7 to -20.5,
 * z 5.3 to 12): a secure equipment store, drawn from what the game has.
 *
 *   north wall   a lockable ammunition cabinet, a pegboard of handguns above
 *                a cleaning bench, a handgun case locker (one fitting);
 *   west wall    three shelving bays, one for each throwable the game has:
 *                GRENADES (olive), SMOKE (grey) and MOLOTOVS (glass and rags),
 *                each with a coloured header and a tray left for a pick-up;
 *   middle       the maintenance table, and the secure cage by the south-east
 *                corner;
 *   corners      ammunition containers (north-east) and heavy shelving
 *                (south-west).
 *
 * The doors keep their openings: east (z 7 to 9) and south into the Hall
 * (x -27 to -25); both have a steel frame drawn round them, outside the
 * opening. Nothing is a pick-up yet: the trays on the bays mark where the
 * existing grenade pick-ups could go (see the report).
 */

const OLIVE = 0x4a5236;
const OLIVE_DARK = 0x3a4128;
const SMOKE_GREY = 0x7a808a;
const GLASS = 0x2f5a3f;
const RAG = 0xb9b49c;
const WARN_ORANGE = 0x9a5a2a;
const WARN_RED = 0x8a3a30;
const HAZARD = 0x9a8836;

/** A handgun in profile (its slide along x), hung from a peg on a wall facing +z. */
function pistol(p: Pieces, x: number, y: number, z: number, flip = 1): void {
  p.box(x, y, z, 0.18, 0.035, 0.026, STEEL, 0);
  p.box(x + flip * 0.01, y + 0.035, z, 0.17, 0.012, 0.02, GUNMETAL);
  p.box(
    x - flip * 0.065,
    y - 0.075,
    z,
    0.032,
    0.085,
    0.026,
    CHARCOAL,
    0,
    0.25 * flip,
  );
  p.box(x - flip * 0.02, y - 0.012, z, 0.04, 0.02, 0.012, BLACK);
}

/** A steel ammunition can: olive, with a latch and a stencilled plate. */
function ammoCan(
  p: Pieces,
  cx: number,
  bottom: number,
  cz: number,
  ry: number,
  faceX = true,
): void {
  const w = 0.3;
  const d = 0.15;
  const h = 0.18;

  p.box(cx, bottom, cz, w, h, d, OLIVE, ry);
  p.box(cx, bottom + h, cz, w + 0.012, 0.016, d + 0.012, OLIVE_DARK, ry);
  p.box(cx, bottom + h + 0.012, cz, 0.12, 0.016, 0.02, STEEL_BARE, ry);

  if (faceX) {
    // A stencil plate on the front (+z face when unturned).
    p.box(cx, bottom + 0.05, cz + d / 2 + 0.003, 0.14, 0.06, 0.005, HAZARD, ry);
  }
}

/** A grenade on a shelf: an olive body, a collar and a spoon. */
function grenade(p: Pieces, x: number, bottom: number, z: number): void {
  p.post(x, bottom, z, 0.1, 0.07, OLIVE);
  p.post(x, bottom + 0.1, z, 0.02, 0.04, STEEL_BARE);
  p.box(x + 0.03, bottom + 0.05, z, 0.012, 0.07, 0.022, STEEL);
}

/** A smoke grenade: a taller grey canister with a coloured band and a vented top. */
function smoke(
  p: Pieces,
  x: number,
  bottom: number,
  z: number,
  band: number,
): void {
  p.post(x, bottom, z, 0.15, 0.065, SMOKE_GREY);
  p.post(x, bottom + 0.1, z, 0.025, 0.068, band);
  p.post(x, bottom + 0.15, z, 0.02, 0.05, CHARCOAL);
}

/** A bottle with a rag in its neck. */
function molotov(p: Pieces, x: number, bottom: number, z: number): void {
  p.post(x, bottom, z, 0.15, 0.08, GLASS);
  p.post(x, bottom + 0.15, z, 0.07, 0.035, GLASS);
  p.post(x, bottom + 0.22, z, 0.045, 0.026, RAG);
  p.box(x + 0.02, bottom + 0.24, z, 0.04, 0.012, 0.012, RAG, 0, 0.5);
  p.box(x, bottom + 0.06, z + 0.04, 0.05, 0.05, 0.004, LABEL);
}

type Kind = "grenade" | "smoke" | "molotov";

/** One shelving bay against the west wall for one kind of throwable. */
function bay(
  map: MapBuilder,
  floorY: number,
  random: () => number,
  id: string,
  z0: number,
  kind: Kind,
): void {
  const p = new Pieces();
  const f = new Frame(p, -31.7, z0, "+x");
  const len = 1.6;
  const depth = 0.6;
  const header =
    kind === "grenade" ? OLIVE : kind === "smoke" ? SMOKE_GREY : WARN_ORANGE;
  const frame: FramePart[] = [];

  // The shelving: a back, four uprights, five shelves with a front lip.
  f.box(len / 2, 0.1, 0.02, len, 1.9, 0.02, GUNMETAL);

  for (const u of [0.04, len - 0.04]) {
    for (const v of [0.04, depth - 0.04]) {
      f.box(u, 0, v, 0.05, 2.0, 0.05, CHARCOAL);
    }
  }

  const levels = [0.18, 0.64, 1.1, 1.56];

  for (const y of levels) {
    f.box(len / 2, y, depth / 2, len - 0.04, 0.03, depth - 0.02, STEEL);
    f.box(len / 2, y + 0.03, depth - 0.02, len - 0.04, 0.045, 0.02, CHARCOAL);
  }

  f.box(len / 2, 1.96, depth / 2, len, 0.04, depth, CHARCOAL);

  // What lies on each shelf.
  levels.forEach((y, level) => {
    const base = y + 0.03;
    const items = Math.floor(len / 0.19) - (level === 2 ? 3 : 0);

    // The yellow-edged pick-up tray on the third shelf, middle.
    if (level === 2) {
      const tw = 0.62;

      f.box(len / 2, base, depth / 2, tw, 0.012, 0.42, HAZARD);
      f.box(len / 2, base + 0.012, depth / 2, tw - 0.05, 0.006, 0.37, CHARCOAL);

      for (let k = 0; k < 3; k++) {
        const u = len / 2 - 0.18 + k * 0.18;
        const x = f.wx(u, depth / 2);
        const z = f.wz(u, depth / 2);

        if (kind === "grenade") grenade(p, x, base + 0.018, z);
        else if (kind === "smoke")
          smoke(p, x, base + 0.018, z, k === 1 ? WARN_RED : 0x3c5a78);
        else molotov(p, x, base + 0.018, z);
      }
    }

    // A box of spares at one end of the lower shelves.
    if (level === 0) {
      f.box(
        0.4,
        base,
        depth / 2,
        0.55,
        0.3,
        0.42,
        kind === "molotov" ? TIMBER_B : OLIVE_DARK,
      );
      f.box(0.4, base + 0.3, depth / 2, 0.58, 0.02, 0.44, STEEL);
      plate(
        p,
        f.wx(0.4, depth / 2) + 0.215,
        base + 0.1,
        f.wz(0.4, depth / 2),
        0.2,
        0.1,
        "x",
        1,
      );
    }

    for (let k = 0; k < items; k++) {
      const u = (level === 0 ? 0.85 : 0.12) + k * 0.19;

      if (u > len - 0.1) break;
      if (level === 2 && Math.abs(u - len / 2) < 0.4) continue;
      if (random() < 0.12) continue;

      const x = f.wx(u, depth / 2 + (random() - 0.5) * 0.1);
      const z = f.wz(u, depth / 2 + (random() - 0.5) * 0.1);

      if (kind === "grenade") grenade(p, x, base, z);
      else if (kind === "smoke")
        smoke(p, x, base, z, [0x3c5a78, 0x9a8836, WARN_RED][k % 3]);
      else molotov(p, x, base, z);
    }
  });

  // The header: a coloured board with a pictogram, a tally strip below.
  f.box(len / 2, 1.78, depth + 0.012, len - 0.1, 0.16, 0.014, header);
  f.box(len / 2, 1.8, depth + 0.021, 0.5, 0.1, 0.004, LABEL);

  if (kind === "grenade") {
    f.post(len / 2 - 0.04, 1.82, depth + 0.026, 0.004, 0.07, BLACK);
    f.box(len / 2 + 0.04, 1.86, depth + 0.026, 0.02, 0.03, 0.004, BLACK);
  } else if (kind === "smoke") {
    for (let k = 0; k < 3; k++) {
      f.post(
        len / 2 - 0.1 + k * 0.1,
        1.81,
        depth + 0.026,
        0.004,
        0.06 + k * 0.012,
        BLACK,
      );
    }
  } else {
    f.box(len / 2 - 0.04, 1.81, depth + 0.026, 0.04, 0.07, 0.004, BLACK);
    f.box(len / 2 - 0.04, 1.88, depth + 0.026, 0.016, 0.03, 0.004, BLACK);
    f.box(len / 2 + 0.08, 1.81, depth + 0.026, 0.04, 0.07, 0.004, WARN_RED);
  }

  // Tally marks on the lip of the lowest shelf: how many the bay should hold.
  for (let k = 0; k < 6; k++) {
    f.box(0.9 + k * 0.05, 0.22, depth + 0.003, 0.012, 0.03, 0.006, LABEL);
  }

  // A yellow floor edge in front, and a hazard strip across the header.
  f.box(len / 2, 0.0, depth + 0.3, len, 0.004, 0.06, HAZARD);

  // Shots: the uprights, the shelves and the back are solid, the gaps are not.
  const box = (
    minU: number,
    maxU: number,
    minV: number,
    maxV: number,
    minY: number,
    maxY: number,
  ): void => {
    frame.push({
      minX: Math.min(f.wx(minU, minV), f.wx(maxU, maxV)),
      maxX: Math.max(f.wx(minU, minV), f.wx(maxU, maxV)),
      minZ: Math.min(f.wz(minU, minV), f.wz(maxU, maxV)),
      maxZ: Math.max(f.wz(minU, minV), f.wz(maxU, maxV)),
      minY,
      maxY,
    });
  };

  box(0, len, 0, 0.05, 0.1, 2.0);

  for (const y of levels) {
    box(0, len, 0, depth, y, y + 0.08);
  }

  box(0, len, 0, depth, 1.78, 2.0);
  box(0, 0.08, 0, depth, 0, 2.0);
  box(len - 0.08, len, 0, depth, 0, 2.0);

  map.createFitting(id, floorY, p.elements, [
    {
      minX: -31.7,
      maxX: -31.7 + depth,
      minZ: z0,
      maxZ: z0 + len,
      top: 2.0,
      frame,
    },
  ]);
}

export function furnishArmory(map: MapBuilder, floorY: number): void {
  const F = floorY;
  const random = rng(3319);

  // ---------------------------- the north wall: ammunition, handguns, bench
  {
    const p = new Pieces();
    const f = new Frame(p, -31.7, 5.3, "+z");
    const depth = 0.8;

    // The ammunition cabinet: two heavy doors, a lock bar and a padlock on a chain.
    f.box(0.65, 0, depth / 2, 1.3, 2.0, depth, GUNMETAL);
    f.box(0.33, 0.1, depth + 0.005, 0.6, 1.8, 0.016, 0x4a5236);
    f.box(0.98, 0.1, depth + 0.005, 0.6, 1.8, 0.016, 0x44502f);
    f.box(0.65, 0.06, depth + 0.004, 1.26, 0.06, 0.02, STEEL);
    f.box(0.65, 1.88, depth + 0.004, 1.26, 0.06, 0.02, STEEL);

    for (const y of [0.4, 1.0, 1.6]) {
      f.box(0.65, y, depth + 0.016, 0.04, 0.12, 0.014, STEEL_BARE);
    }

    f.box(0.65, 0.98, depth + 0.026, 1.0, 0.07, 0.02, STEEL_BARE);
    f.box(0.9, 0.78, depth + 0.05, 0.08, 0.1, 0.04, 0x7a6a2e);
    f.cableUp(0.9, 0.86, depth + 0.06, 0.12, 0.012, STEEL_LIGHT);
    // The bullet pictogram, and an inventory plate with tally marks.
    f.box(0.5, 1.45, depth + 0.016, 0.34, 0.2, 0.006, LABEL);

    for (let k = 0; k < 4; k++) {
      f.box(0.4 + k * 0.07, 1.48, depth + 0.022, 0.03, 0.12, 0.004, BLACK);
      f.box(0.4 + k * 0.07, 1.6, depth + 0.022, 0.03, 0.03, 0.004, 0x7a6a2e);
    }

    f.box(0.65, 0.2, depth + 0.016, 0.5, 0.1, 0.006, LABEL);

    for (let k = 0; k < 5; k++) {
      f.box(0.45 + k * 0.09, 0.22, depth + 0.021, 0.014, 0.06, 0.004, BLACK);
    }

    // The bench: a steel carcass, a thick top, a lower shelf; pegboard above it.
    f.box(2.35, 0.0, 0.35, 2.1, 0.9, 0.7, GUNMETAL);
    f.box(2.35, 0.9, 0.36, 2.14, 0.05, 0.72, TIMBER_B);
    f.box(2.35, 0.6, 0.36, 2.0, 0.025, 0.66, STEEL);
    f.box(2.35, 1.02, 0.025, 2.0, 0.95, 0.03, 0x2f343b);

    // Peg rails with handguns hung by the trigger guard, a few spaces left bare.
    for (const [y, count] of [
      [1.78, 7],
      [1.34, 6],
    ] as const) {
      f.barAlong(2.35, y, 0.07, 1.9, 0.016, STEEL_BARE);

      for (let k = 0; k < count; k++) {
        const u = 1.45 + k * (1.8 / count);

        if (k === 4 && y > 1.5) {
          // An empty place: a pale outline where one should hang.
          f.box(u, y - 0.12, 0.05, 0.19, 0.003, 0.004, LABEL);
          f.box(u, y - 0.12, 0.05, 0.003, 0.1, 0.004, LABEL);
          continue;
        }

        pistol(p, f.wx(u, 0.06), y - 0.04, f.wz(u, 0.06), k % 2 ? -1 : 1);
      }
    }

    // On the bench: a handgun stripped for cleaning, an oil can, rags, a ledger, a lamp, a vice.
    f.box(1.8, 0.95, 0.42, 0.34, 0.012, 0.22, 0x5a4a38);
    pistol(p, f.wx(1.75, 0.4), 1.0, f.wz(1.75, 0.4), 1);
    f.box(1.98, 0.96, 0.45, 0.08, 0.02, 0.03, STEEL);
    f.box(2.0, 0.96, 0.36, 0.05, 0.03, 0.03, GUNMETAL);
    f.post(2.4, 0.95, 0.35, 0.14, 0.06, 0x8a3a30);
    f.post(2.4, 1.09, 0.35, 0.04, 0.03, STEEL_BARE);
    f.box(2.65, 0.95, 0.45, 0.25, 0.02, 0.2, 0x7a5a48);
    f.box(2.65, 0.97, 0.45, 0.2, 0.012, 0.15, 0x6a4a38);
    f.box(2.95, 0.95, 0.4, 0.3, 0.03, 0.22, 0x2f3a2f);
    f.box(2.95, 0.98, 0.4, 0.27, 0.01, 0.19, PAPER);
    f.post(3.2, 0.95, 0.2, 0.34, 0.025, STEEL);
    f.box(3.2, 1.28, 0.26, 0.1, 0.05, 0.16, GUNMETAL);
    f.box(3.28, 0.95, 0.5, 0.18, 0.12, 0.14, STEEL_LIGHT);
    f.box(3.3, 1.07, 0.5, 0.08, 0.02, 0.05, STEEL_BARE);
    // A cleaning rod and brush leaning on the back.
    f.barAlong(1.55, 1.0, 0.15, 0.4, 0.012, STEEL_BARE);

    // The handgun case locker: open shelves of flat black cases, two with lids up.
    for (const u of [3.45, 4.95]) {
      f.box(u, 0, depth / 2, 0.06, 2.0, depth, CHARCOAL);
    }

    f.box(4.2, 0, 0.03, 1.5, 2.0, 0.04, GUNMETAL);

    for (let level = 0; level < 5; level++) {
      const y = 0.18 + level * 0.38;

      f.box(4.2, y, depth / 2, 1.44, 0.03, depth - 0.04, STEEL);

      for (let k = 0; k < 3; k++) {
        const u = 3.72 + k * 0.45;

        f.box(u, y + 0.03, 0.4, 0.38, 0.07, 0.26, BLACK);
        f.box(u + 0.12, y + 0.065, 0.54, 0.04, 0.02, 0.012, STEEL_BARE);
        f.box(u - 0.12, y + 0.065, 0.54, 0.04, 0.02, 0.012, STEEL_BARE);
      }
    }

    f.box(4.2, 1.98, depth / 2, 1.5, 0.03, depth + 0.02, CHARCOAL);
    f.box(4.2, 1.9, depth + 0.003, 0.5, 0.07, 0.006, LABEL);

    for (let k = 0; k < 3; k++) {
      pistol(
        p,
        f.wx(3.95 + k * 0.28, 0.2),
        1.62 + 0.0,
        f.wz(3.95 + k * 0.28, 0.2),
        1,
      );
    }

    map.createFitting("racks-armory", F, p.elements, [
      { minX: -31.7, maxX: -26.7, minZ: 5.3, maxZ: 6.1, top: 2.0 },
    ]);
  }

  // ------------------------- west wall: grenades, smoke grenades, Molotovs
  bay(map, F, random, "armory-bay-grenade", 6.7, "grenade");
  bay(map, F, random, "armory-bay-smoke", 8.3, "smoke");
  bay(map, F, random, "armory-bay-molotov", 9.9, "molotov");

  // ------------------------------------------- the maintenance table
  {
    const p = new Pieces();
    const x0 = -27.55;
    const x1 = -25.05;
    const z0 = 8.0;
    const z1 = 9.2;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;

    // A steel frame table, a worn timber top, a shelf below, steel-capped corners.
    p.box(cx, 0.86, cz, 2.5, 0.05, 1.2, TIMBER_B);
    p.box(cx, 0.855, cz, 2.52, 0.012, 1.22, STEEL);
    p.box(cx, 0.76, cz, 2.3, 0.1, 1.0, GUNMETAL);

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        p.box(cx + sx * 1.15, 0, cz + sz * 0.5, 0.08, 0.86, 0.08, STEEL);
      }
    }

    p.box(cx, 0.22, cz, 2.3, 0.025, 1.0, STEEL);
    // On it: a steel parts tray with a few small cases, an oil can, a rag, a log book and a pen.
    p.box(cx - 0.8, 0.91, cz - 0.2, 0.5, 0.025, 0.3, STEEL_LIGHT);
    p.box(cx - 0.8, 0.935, cz - 0.2, 0.46, 0.04, 0.26, 0x1e2024);

    for (let k = 0; k < 4; k++) {
      p.box(
        cx - 0.95 + k * 0.1,
        0.94,
        cz - 0.2,
        0.06,
        0.03,
        0.2,
        k % 2 ? STEEL_BARE : STEEL,
      );
    }

    p.post(cx - 0.1, 0.91, cz + 0.3, 0.14, 0.06, 0x8a3a30);
    p.box(cx + 0.3, 0.91, cz + 0.2, 0.3, 0.012, 0.22, 0x8a8f86, 0.3);
    p.box(cx + 0.7, 0.91, cz - 0.15, 0.32, 0.03, 0.24, 0x2f3a2f, -0.1);
    p.box(cx + 0.7, 0.94, cz - 0.15, 0.28, 0.008, 0.2, PAPER, -0.1);
    p.box(cx + 0.95, 0.91, cz + 0.25, 0.012, 0.012, 0.12, 0x1a3a6a, 0.9);
    ammoCan(p, cx + 0.2, 0.91, cz - 0.28, 0.2);
    // A bench vice at the east end.
    p.box(cx + 1.1, 0.91, cz, 0.18, 0.1, 0.16, GUNMETAL);
    p.box(cx + 1.1, 1.01, cz, 0.14, 0.06, 0.12, STEEL_BARE);
    // Oil drips and a work light, dead, on a clamp at the north-west corner.
    p.post(cx - 1.1, 0.91, cz - 0.5, 0.45, 0.025, STEEL);
    p.box(cx - 1.1, 1.3, cz - 0.4, 0.06, 0.06, 0.24, GUNMETAL);
    map.createFitting("table-armory", F, p.elements, [
      { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: 0.95 },
    ]);
  }

  // -------------------------------------------------- the secure cage
  {
    const p = new Pieces();
    const frame: FramePart[] = [];
    const x0 = -23.4;
    const x1 = -20.5;
    const z0 = 10.0;
    const z1 = 12.0;
    const h = 2.2;
    const part = (
      ax: number,
      bx: number,
      az: number,
      bz: number,
      ay: number,
      by: number,
    ): void => {
      frame.push({
        minX: Math.min(ax, bx),
        maxX: Math.max(ax, bx),
        minZ: Math.min(az, bz),
        maxZ: Math.max(az, bz),
        minY: ay,
        maxY: by,
      });
    };

    // Inside: a safe, stacked ammunition crates, a shelf of boxes, a hanging inventory sheet.
    p.box(-22.9, 0, 11.45, 0.8, 1.0, 0.8, 0x2f3338);
    p.box(-22.9, 1.0, 11.45, 0.84, 0.05, 0.84, GUNMETAL);
    p.box(-22.5, 0.4, 11.03, 0.08, 0.2, 0.03, 0x7a6a2e);
    p.post(-22.5, 0.5, 11.0, 0.016, 0.1, STEEL_BARE);
    part(-23.3, -22.5, 11.05, 11.85, 0, 1.05);

    for (let k = 0; k < 2; k++) {
      for (let j = 0; j < 3; j++) {
        p.box(
          -21.45 + k * 0.5,
          j * 0.34,
          11.5,
          0.46,
          0.32,
          0.8,
          j === 1 ? OLIVE_DARK : OLIVE,
        );
        p.box(
          -21.45 + k * 0.5,
          j * 0.34 + 0.15,
          11.1,
          0.22,
          0.07,
          0.01,
          HAZARD,
        );
      }
    }

    part(-21.7, -20.5, 11.1, 11.9, 0, 1.0);
    p.box(-21.2, 1.4, 11.85, 1.5, 0.04, 0.3, STEEL);
    p.box(-21.2, 1.44, 11.85, 1.4, 0.3, 0.26, CARDBOARD);
    p.box(-22.6, 1.3, 11.92, 0.3, 0.4, 0.004, PAPER, 0.04);

    // The mesh: thin uprights every 0.14 m on the north face (z 10) and west face (x -23.4),
    // three rails on each, thick corner posts, a top frame, and a door in the north face.
    const bars = 0.15;

    for (let x = x0 + 0.1; x < x1; x += bars) {
      p.post(x, 0, z0 + 0.02, h, 0.016, STEEL);
      part(x - 0.02, x + 0.02, z0, z0 + 0.04, 0, h);
    }

    for (let z = z0 + 0.1; z < z1; z += bars) {
      p.post(x0 + 0.02, 0, z, h, 0.016, STEEL);
      part(x0, x0 + 0.04, z - 0.02, z + 0.02, 0, h);
    }

    for (const y of [0.1, 1.1, h - 0.06]) {
      p.box((x0 + x1) / 2, y, z0 + 0.02, x1 - x0, 0.05, 0.05, CHARCOAL);
      p.box(x0 + 0.02, y, (z0 + z1) / 2, 0.05, 0.05, z1 - z0, CHARCOAL);
      part(x0, x1, z0, z0 + 0.05, y, y + 0.05);
      part(x0, x0 + 0.05, z0, z1, y, y + 0.05);
    }

    for (const [cx, cz] of [
      [x0 + 0.04, z0 + 0.04],
      [x1 - 0.04, z0 + 0.04],
      [x0 + 0.04, z1 - 0.04],
    ] as const) {
      p.box(cx, 0, cz, 0.08, h, 0.08, CHARCOAL);
      part(cx - 0.04, cx + 0.04, cz - 0.04, cz + 0.04, 0, h);
    }

    // The door in the north face: a frame, a hasp and a padlock on a chain.
    p.box(-22.0, 0.04, z0 + 0.03, 0.9, 0.06, 0.06, STEEL);
    p.box(-22.0, 1.95, z0 + 0.03, 0.9, 0.06, 0.06, STEEL);

    for (const x of [-22.45, -21.55]) {
      p.box(x, 0.04, z0 + 0.03, 0.06, 1.97, 0.06, STEEL);
    }

    p.box(-21.62, 1.0, z0 - 0.02, 0.1, 0.2, 0.05, STEEL_BARE);
    p.box(-21.62, 0.84, z0 - 0.05, 0.08, 0.1, 0.04, 0x7a6a2e);
    p.cableUp(-21.62, 0.95, z0 - 0.05, 0.1, 0.012, STEEL_LIGHT);
    // Hazard-yellow plate on the door and an inventory tag.
    p.box(-22.0, 1.55, z0 - 0.01, 0.4, 0.2, 0.01, HAZARD);
    p.box(-22.0, 1.6, z0 - 0.016, 0.3, 0.04, 0.004, BLACK);
    // A top frame and a bolted base plate.
    p.box((x0 + x1) / 2, h, (z0 + z1) / 2, x1 - x0, 0.04, z1 - z0, CHARCOAL);
    map.createFitting("cage-armory", F, p.elements, [
      { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: h, frame },
    ]);
  }

  // ----------- ammunition containers in the north-east corner, stacked
  {
    const p = new Pieces();
    const x0 = -22.1;
    const x1 = -20.5;
    const z0 = 5.3;
    const z1 = 6.3;

    // A timber pallet, two columns of olive steel cans three high, a wooden crate on top.
    for (let k = 0; k < 4; k++) {
      p.box(x0 + 0.2 + k * 0.42, 0, 5.8, 0.1, 0.1, 0.9, TIMBER_DARK);
    }

    p.box((x0 + x1) / 2, 0.1, 5.8, x1 - x0, 0.03, 0.96, TIMBER);

    for (let k = 0; k < 2; k++) {
      for (let j = 0; j < 3; j++) {
        ammoCan(p, x0 + 0.42 + k * 0.7, 0.13 + j * 0.2, 5.55, 0, true);
        ammoCan(
          p,
          x0 + 0.42 + k * 0.7,
          0.13 + j * 0.2,
          5.98,
          0.04 * (j - 1),
          true,
        );
      }
    }

    p.box(x1 - 0.5, 0.74, 5.8, 0.85, 0.34, 0.7, TIMBER_B);
    p.box(x1 - 0.5, 1.08, 5.8, 0.9, 0.03, 0.74, TIMBER_DARK);
    p.box(x1 - 0.5, 0.86, 6.15, 0.3, 0.1, 0.01, HAZARD);
    // A strap round the stack.
    p.box((x0 + x1) / 2, 0.14, 5.8, x1 - x0 + 0.02, 0.012, 0.98, STEEL_BARE);
    map.createFitting("armory-ammo-stack", F, p.elements, [
      { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: 1.1 },
    ]);
  }

  // ------------------- heavy shelving, south-west corner, stocked with cases
  {
    const p = new Pieces();
    const box = shelving(
      p,
      random,
      -31.7,
      11.5,
      2.8,
      0.5,
      "x",
      [1, 0.9, 1, 0.85],
      "steel",
    );

    map.createFitting("armory-shelving", F, p.elements, [box]);
  }

  // ----------------------------------------- doors, signs and floor marks
  {
    const p = new Pieces();

    // Steel frames round both openings, drawn outside the 2 m of clear width.
    // East door: z 7 to 9 in the east wall (x -20.5 to -20.2).
    for (const z of [6.9, 9.1]) {
      p.box(-20.45, 0, z, 0.5, 2.6, 0.2, CHARCOAL);
      p.box(-20.705, 0.4, z, 0.012, 0.1, 0.2, HAZARD);
      p.box(-20.705, 1.0, z, 0.012, 0.1, 0.2, HAZARD);
      p.box(-20.705, 1.6, z, 0.012, 0.1, 0.2, HAZARD);
    }

    p.box(-20.45, 2.6, 8.0, 0.5, 0.16, 2.4, CHARCOAL);
    // A security sliding gate, drawn parked open against the wall north of the door.
    p.box(-20.58, 0.1, 6.0, 0.05, 2.35, 1.1, 0x44502f);
    p.box(-20.6, 0.1, 6.0, 0.03, 0.06, 1.1, STEEL);
    p.box(-20.6, 1.2, 6.0, 0.03, 0.06, 1.1, STEEL);
    p.box(-20.6, 2.4, 6.0, 0.03, 0.06, 1.1, STEEL);
    p.box(-20.62, 1.0, 6.45, 0.03, 0.14, 0.1, STEEL_BARE);
    // South door into the Hall: x -27 to -25 in the wall z 12 to 12.3.
    for (const x of [-27.1, -24.9]) {
      p.box(x, 0, 12.0, 0.2, 2.6, 0.34, CHARCOAL);
    }

    p.box(-26.0, 2.6, 12.0, 2.4, 0.16, 0.34, CHARCOAL);
    // Signs: AUTHORISED ONLY by the east door, an inventory board, a no-smoking plate.
    p.box(-20.51, 2.1, 9.65, 0.012, 0.3, 0.46, WARN_RED);
    p.box(-20.516, 2.2, 9.65, 0.006, 0.1, 0.34, LABEL);
    p.box(-20.51, 1.5, 10.1, 0.012, 0.6, 0.4, 0x2f3338);

    for (let r = 0; r < 4; r++) {
      p.box(-20.516, 1.56 + r * 0.13, 10.1, 0.006, 0.02, 0.32, LABEL);
      boardLed(p, r);
    }

    extinguisher(p, -20.5, 0.9, 11.4, "x", -1);
    // A conduit down the north wall to the cabinet's lock panel.
    p.post(-31.0, 2.0, 5.34, 1.8, 0.05, STEEL_BARE);
    p.alongX(-31.0, -26.8, 3.75, 5.36, 0.05, STEEL_BARE);
    map.createFitting("fittings-armory-wall", F, p.elements, []);
  }

  // A worn safety line in front of the three bays, and dust round the cage.
  map.addDecal({
    id: "decal-room-armory-line",
    kind: "wear",
    x: -30.5,
    z: 9.1,
    y: F,
    width: 0.1,
    depth: 4.5,
    rotation: 0,
    color: 0x8a7a3a,
    alpha: 0.45,
  });
  map.addDecal({
    id: "decal-room-armory-dust",
    kind: "dust",
    x: -22.0,
    z: 9.2,
    y: F,
    width: 3.4,
    depth: 2.6,
    rotation: 0,
    color: 0x30343a,
    alpha: 0.3,
  });
}

/** A tiny indicator on the inventory board. */
function boardLed(p: Pieces, row: number): void {
  p.box(
    -20.52,
    1.57 + row * 0.13,
    10.3,
    0.012,
    0.025,
    0.025,
    row % 2 ? LED_GREEN : LED_AMBER,
  );
}
