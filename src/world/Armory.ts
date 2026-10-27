import type { FramePart } from "./ArenaLayout";
import { Pieces, rng } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import {
  BLACK,
  CHARCOAL,
  Frame,
  GUNMETAL,
  LABEL,
  LED_AMBER,
  LED_GREEN,
  STEEL,
  STEEL_BARE,
  STEEL_LIGHT,
  CARDBOARD,
  PAPER,
  CARDBOARD_B,
  TIMBER,
  TIMBER_B,
  TIMBER_DARK,
  extinguisher,
  plate,
} from "./RoomKit";
import { furnishTubeFixtures, furnishTubeLights } from "./ArmoryLighting";
import {
  HAZARD,
  OLIVE,
  OLIVE_DARK,
  SMOKE_GREY,
  WARN_ORANGE,
  WARN_RED,
  ammoCan,
  furnishArmoryStash,
  grenade,
  molotov,
  registerThrowablePickups,
  resetThrowableCount,
  smoke,
  tableClutter,
} from "./ArmoryStash";
import { furnishArmoryVent } from "./ArmoryVent";
import { RUST, WORN_TIMBER, furnishArmoryWear } from "./ArmoryWear";
import { shelving } from "./StorageRoom";

/**
 * The Armory (x -32 to -20.2, z 5 to 12, floor 4, ceiling 6.5 m up; inside x -31.7 to -20.5,
 * z 5.3 to 12): a secure equipment store, drawn from what the game has.
 *
 *   north wall   a lockable ammunition cabinet, a pegboard of handguns above
 *                a cleaning bench, a handgun case locker (one fitting);
 *   west wall    three shelving bays, one for each throwable the game has:
 *                GRENADES (olive), SMOKE (grey) and MOLOTOVS (glass and rags),
 *                each with a coloured header and a tray left for a pick-up;
 *   middle       the maintenance table; the floor is open;
 *   corners      ammunition containers (north-east) and heavy shelving
 *                (south-west);
 *   overhead     the room is as tall as the Storage room (6.5 m): a high
 *                ventilation duct, steel beams under the ceiling, and a
 *                roll-up security shutter over the east door.
 *
 * The doors keep their openings: east (z 7 to 9) and south into the Hall
 * (x -27 to -25); both have a steel frame drawn round them, outside the
 * opening. Nothing is a pick-up yet: the trays on the bays mark where the
 * existing grenade pick-ups could go (see the report).
 */

/** How tall the throwable bays stand (the room is 6.5 m). */
const TALL = 3.4;
/** The overhead beam flanges: old black steel, like the grates over them. */
const BEAM_BLACK = 0x2a2e34;
/** The shutter casing: old dark steel, and its lighter worn edges. */
const CASING = 0x2d3137;
const CASING_EDGE = 0x4a4f56;
/** The dull tin of a paint or oil can. */
const TIN = 0x6b6f72;

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
  f.box(len / 2, 0.1, 0.02, len, TALL - 0.1, 0.02, GUNMETAL);

  for (const u of [0.04, len - 0.04]) {
    for (const v of [0.04, depth - 0.04]) {
      f.box(u, 0, v, 0.05, TALL, 0.05, CHARCOAL);
      // Rust gathered at each foot where the floor stays damp.
      f.box(u, 0, v, 0.058, 0.09, 0.058, RUST);
    }
  }

  const levels = [0.18, 0.64, 1.1, 1.56];
  // Reserve stock on three more tiers above the header.
  const upper = [2.12, 2.58, 3.04];

  levels.forEach((y, level) => {
    // The smoke bay's second shelf is the broken one (drawn below).
    if (kind === "smoke" && level === 1) {
      return;
    }

    f.box(len / 2, y, depth / 2, len - 0.04, 0.03, depth - 0.02, STEEL);
    f.box(len / 2, y + 0.03, depth - 0.02, len - 0.04, 0.045, 0.02, CHARCOAL);
  });

  f.box(len / 2, 1.96, depth / 2, len, 0.04, depth, CHARCOAL);

  upper.forEach((y, tier) => {
    f.box(len / 2, y, depth / 2, len - 0.04, 0.03, depth - 0.02, STEEL);
    f.box(len / 2, y + 0.03, depth - 0.02, len - 0.04, 0.045, 0.02, CHARCOAL);

    // A few boxes left up here, not a full row: some tiers are half bare and
    // the boxes sit crooked.
    const count = [2, 1, 2][tier];

    for (let k = 0; k < count; k++) {
      const u =
        0.32 + k * 0.62 + (tier === 1 ? 0.45 : 0) + (random() - 0.5) * 0.2;
      const w = 0.34 + random() * 0.12;
      const h = 0.22 + random() * 0.12;
      const color =
        kind === "molotov"
          ? TIMBER_B
          : kind === "smoke"
            ? STEEL_LIGHT
            : OLIVE_DARK;

      f.box(
        u,
        y + 0.03,
        depth / 2 + (random() - 0.5) * 0.06,
        w,
        h,
        0.36,
        color,
        (random() - 0.5) * 0.25,
      );

      if (random() < 0.5) {
        f.box(
          u,
          y + 0.03 + h,
          depth / 2,
          w + 0.03,
          0.02,
          0.39,
          STEEL,
          (random() - 0.5) * 0.2,
        );
      }
    }
  });

  f.box(len / 2, TALL - 0.04, depth / 2, len, 0.04, depth, CHARCOAL);

  // What lies on each shelf: a few spares and odd containers, put down
  // anywhere, most of each shelf bare. The bay's one throwable sits in its tray.
  const tin = (u: number, base: number, v: number): void =>
    f.post(u, base, v, 0.12, 0.11, TIN);
  const carton = (
    u: number,
    base: number,
    v: number,
    w: number,
    h: number,
    ry: number,
  ): void => {
    f.box(u, base, v, w, h, 0.26, CARDBOARD, ry);
    f.box(u, base + h, v, w + 0.01, 0.012, 0.27, CARDBOARD_B, ry);
  };

  levels.forEach((y, level) => {
    const base = y + 0.03;

    if (level === 2) {
      // The yellow-edged tray on the third shelf, middle: one throwable in it.
      const tw = 0.62;
      const x = f.wx(len / 2, depth / 2);
      const z = f.wz(len / 2, depth / 2);

      f.box(len / 2, base, depth / 2, tw, 0.012, 0.42, HAZARD);
      f.box(len / 2, base + 0.012, depth / 2, tw - 0.05, 0.006, 0.37, CHARCOAL);

      if (kind === "grenade") grenade(p, x, base + 0.018, z);
      else if (kind === "smoke") smoke(p, x, base + 0.018, z);
      else molotov(p, x, base + 0.018, z);

      carton(0.2, base, depth / 2 + 0.03, 0.3, 0.14, 0.2);
    } else if (level === 0) {
      // A box of spares at one end; the bay's damaged one has lost its box.
      if (kind !== "smoke") {
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

      tin(1.05 + random() * 0.1, base, depth / 2 - 0.1);
      carton(1.3, base, depth / 2 + 0.02, 0.26, 0.12, -0.35);
    } else if (level === 1 && kind !== "smoke") {
      carton(0.35 + random() * 0.1, base, depth / 2 - 0.04, 0.34, 0.2, 0.15);
      tin(0.68, base, depth / 2 + 0.08);
    } else if (level === 3) {
      tin(1.3, base, depth / 2 + 0.05);
      f.box(0.28, base, depth / 2, 0.24, 0.02, 0.18, 0x6b6a5c, 0.4);
    }
  });

  // Things on the floor in front of the lowest shelf: knocked off, left there.
  tin(0.55, 0, depth + 0.22);
  tin(0.7, 0, depth + 0.38);
  f.box(1.1, 0, depth + 0.3, 0.3, 0.16, 0.15, OLIVE_DARK, 0.6);

  // The smoke bay's second shelf has come away at one end and slumped onto the
  // shelf below, with a carton knocked off beside it.
  if (kind === "smoke") {
    p.box(
      f.wx(len / 2, depth / 2),
      0.465,
      f.wz(len / 2, depth / 2),
      depth - 0.02,
      0.03,
      len - 0.04,
      STEEL,
      0,
      0,
      -0.35,
    );
    carton(1.0, 0.21, depth / 2, 0.34, 0.2, 0.3);
  }

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

  box(0, len, 0, 0.05, 0.1, TALL);

  for (const y of levels) {
    box(0, len, 0, depth, y, y + 0.08);
  }

  for (const y of upper) {
    box(0, len, 0, depth, y, y + 0.08);
  }

  box(0, len, 0, depth, 1.78, 2.0);
  box(0, 0.08, 0, depth, 0, TALL);
  box(len - 0.08, len, 0, depth, 0, TALL);

  map.createFitting(id, floorY, p.elements, [
    {
      minX: -31.7,
      maxX: -31.7 + depth,
      minZ: z0,
      maxZ: z0 + len,
      top: TALL,
      frame,
    },
  ]);
}

export function furnishArmory(map: MapBuilder, floorY: number): void {
  const F = floorY;
  const random = rng(3319);

  resetThrowableCount();

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
    f.box(2.35, 0.9, 0.36, 2.14, 0.05, 0.72, WORN_TIMBER);
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

    // What stops a body is what is drawn, part by part (it was one 2 m block,
    // so anyone on the bench stood on air at the height of the cabinet):
    //  - the ammunition cabinet, a solid 2 m;
    //  - the bench, its worktop at 0.95 m, which can be climbed onto;
    //  - the pegboard on the wall above it, a thin panel (nothing to stand
    //    on, and open air between it and the worktop's edge);
    //  - the handgun case locker, open shelves: it stops a body, but a shot
    //    passes through the gaps between its shelves, posts and back.
    const lockerX0 = -28.25;
    const lockerX1 = -26.75;
    const lockerFrame: FramePart[] = [
      // The back and the two posts, the top plate and each shelf.
      {
        minX: lockerX0,
        maxX: lockerX1,
        minZ: 5.3,
        maxZ: 5.34,
        minY: 0,
        maxY: 2,
      },
      {
        minX: lockerX0,
        maxX: lockerX0 + 0.06,
        minZ: 5.3,
        maxZ: 6.1,
        minY: 0,
        maxY: 2,
      },
      {
        minX: lockerX1 - 0.06,
        maxX: lockerX1,
        minZ: 5.3,
        maxZ: 6.1,
        minY: 0,
        maxY: 2,
      },
      {
        minX: lockerX0,
        maxX: lockerX1,
        minZ: 5.3,
        maxZ: 6.1,
        minY: 1.96,
        maxY: 2,
      },
      ...[0, 1, 2, 3, 4].map((level) => ({
        minX: lockerX0,
        maxX: lockerX1,
        minZ: 5.3,
        maxZ: 6.1,
        minY: 0.18 + level * 0.38,
        maxY: 0.18 + level * 0.38 + 0.08,
      })),
    ];

    map.createFitting("racks-armory", F, p.elements, [
      { minX: -31.7, maxX: -30.4, minZ: 5.3, maxZ: 6.1, top: 2.0 },
      { minX: -30.4, maxX: -28.3, minZ: 5.3, maxZ: 6.02, top: 0.95 },
      { minX: -30.4, maxX: -28.3, minZ: 5.3, maxZ: 5.35, top: 1.97 },
      {
        minX: lockerX0 - 0.05,
        maxX: lockerX1,
        minZ: 5.3,
        maxZ: 6.1,
        top: 2.0,
        frame: lockerFrame,
      },
    ]);
  }

  // A cable riser filling the 0.6 m gap between the north locker and the first
  // bay (a body-wide pocket there once wedged anyone who jumped into it).
  {
    const p = new Pieces();

    p.box(-31.4, 0, 6.4, 0.6, 3.4, 0.6, GUNMETAL);

    for (const y of [0.3, 1.2, 2.1, 3.0]) {
      p.box(-31.4, y, 6.4, 0.66, 0.08, 0.66, CHARCOAL);
    }

    // Conduit running up its face, and a junction box.
    p.post(-31.12, 0.2, 6.25, 3.1, 0.04, STEEL_BARE);
    p.post(-31.12, 0.2, 6.55, 3.1, 0.04, STEEL_BARE);
    p.box(-31.07, 1.5, 6.4, 0.06, 0.3, 0.26, STEEL);
    map.createFitting("armory-riser", F, p.elements, [
      { minX: -31.7, maxX: -31.1, minZ: 6.1, maxZ: 6.7, top: 3.4 },
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
    p.box(cx, 0.86, cz, 2.5, 0.05, 1.2, WORN_TIMBER);
    // Oil and burn marks worked into the top.
    p.box(cx - 0.45, 0.91, cz + 0.12, 0.55, 0.004, 0.36, 0x1a1611, 0.3);
    p.box(cx + 0.5, 0.91, cz - 0.25, 0.3, 0.004, 0.22, 0x221b14, -0.5);
    p.box(cx, 0.855, cz, 2.52, 0.012, 1.22, STEEL);
    p.box(cx, 0.76, cz, 2.3, 0.1, 1.0, GUNMETAL);

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        p.box(cx + sx * 1.15, 0, cz + sz * 0.5, 0.08, 0.86, 0.08, STEEL);
      }
    }

    p.box(cx, 0.22, cz, 2.3, 0.025, 1.0, STEEL);
    // On it: the guns, magazines, tools and throwables of the work in hand.
    tableClutter(p, cx, cz);
    // A bench vice at the east end.
    p.box(cx + 1.1, 0.91, cz, 0.18, 0.1, 0.16, GUNMETAL);
    p.box(cx + 1.1, 1.01, cz, 0.14, 0.06, 0.12, STEEL_BARE);
    // Oil drips and a work light, dead, on a clamp at the north-west corner.
    // (Every part overlaps the next: the clamp holds the post, the arm is
    // fixed to the post's top, and the hood hangs from the arm's end.)
    p.box(cx - 1.1, 0.88, cz - 0.5, 0.09, 0.07, 0.07, GUNMETAL);
    p.post(cx - 1.1, 0.91, cz - 0.5, 0.46, 0.025, STEEL);
    p.box(cx - 1.1, 1.34, cz - 0.38, 0.03, 0.03, 0.26, STEEL);
    p.box(cx - 1.1, 1.22, cz - 0.27, 0.1, 0.14, 0.1, GUNMETAL);
    map.createFitting("table-armory", F, p.elements, [
      { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: 0.95 },
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
      // Stands 3 cm proud of the wall on both faces and 2 cm into the opening, so
      // no face of it lies in the wall's own plane (they would flicker).
      p.box(-20.44, 0, z, 0.54, 2.6, 0.24, CHARCOAL);
      p.box(-20.715, 0.4, z, 0.012, 0.1, 0.2, HAZARD);
      p.box(-20.715, 1.0, z, 0.012, 0.1, 0.2, HAZARD);
      p.box(-20.715, 1.6, z, 0.012, 0.1, 0.2, HAZARD);
    }

    // A steel soffit lining the underside of the wall over the doorway, so it
    // takes the light like the rest (drawn only; the opening is still 2.6 m).
    p.box(-20.35, 2.555, 8.0, 0.3, 0.045, 2.0, STEEL);
    p.box(-20.35, 2.54, 8.0, 0.3, 0.015, 0.1, GUNMETAL);
    // The roll-up shutter's installation. The curtain runs in the steel frame
    // that lines the opening (x -20.44, the middle of it), between two guide
    // channels, and rolls up into a roller casing built into the wall over the
    // door: its back sunk in the wall, its face standing 10 cm proud of the
    // walkway side and 20 cm into the room, with end plates, mounting plates and
    // bolts. The chain wheel is on the casing's south end.
    const SX = -20.44;

    // Guide rails and heavier channels, down both jambs to the casing.
    for (const z of [7.02, 8.98]) {
      p.box(SX, 0.0, z, 0.1, 2.6, 0.06, STEEL);
    }

    for (const z of [6.96, 9.04]) {
      p.box(SX, 0.0, z, 0.14, 2.6, 0.03, CHARCOAL);

      for (const y of [0.4, 1.3, 2.2, 2.5]) {
        p.box(SX + 0.06, y, z, 0.04, 0.08, 0.06, STEEL_BARE);
      }
    }

    // The roller sits over the opening, half sunk in the wall: the drum and its
    // two end wheels are drawn in ArmoryMechanismView (they turn with the
    // shutter) on the axis x -20.27, y 2.9. Fixed here: a steel lintel angle on
    // each face with the narrow dark slot the slats go up through, a bearing
    // bracket outside each wheel, a slim hood over them, and the gearbox.
    p.box(SX, 2.592, 8.0, 0.1, 0.012, 1.98, BLACK);
    p.box(-20.56, 2.6, 8.0, 0.12, 0.06, 2.44, CASING);
    p.box(-20.15, 2.6, 8.0, 0.1, 0.05, 2.44, CASING);
    p.box(-20.098, 2.62, 8.0, 0.006, 0.012, 2.4, CASING_EDGE);

    for (const z of [6.74, 9.26]) {
      p.box(-20.3, 2.64, z, 0.34, 0.54, 0.1, CASING);
      p.box(-20.12, 2.7, z, 0.02, 0.04, 0.04, STEEL_BARE);
      p.box(-20.12, 3.1, z, 0.02, 0.04, 0.04, STEEL_BARE);
    }

    p.box(-20.12, 3.19, 8.0, 0.22, 0.03, 2.5, GUNMETAL);
    p.box(-20.178, 2.64, 7.1, 0.006, 0.18, 0.05, 0x6a4a38);

    // The gearbox beyond the south bracket: the drum's shaft runs into it, and
    // the chain wheel is on its outer face, held by a bearing plate.
    p.box(-20.38, 2.78, 9.45, 0.4, 0.52, 0.3, 0x3a3226);
    p.box(-20.38, 3.3, 9.45, 0.42, 0.02, 0.32, GUNMETAL);
    p.bar(-20.27, 2.9, 9.3, 0.2, 0.07, STEEL_BARE, Math.PI / 2);
    p.bar(-20.16, 3.12, 9.45, 0.1, 0.05, STEEL_BARE, 0);
    p.box(-20.17, 2.95, 9.45, 0.02, 0.34, 0.3, GUNMETAL);
    // Grease, a rust weep and a stamped maker's plate on the gearbox.
    // A warning plate by the wheel, outside: the shutter drops when the chain
    // is let go.
    p.box(-20.19, 1.9, 10.05, 0.012, 0.28, 0.36, HAZARD);
    p.box(-20.186, 1.95, 10.05, 0.006, 0.05, 0.3, BLACK);
    p.box(-20.186, 2.06, 10.05, 0.006, 0.05, 0.22, BLACK);
    // The pin the shutter's bottom bar rests its stops on at the floor.
    p.box(SX, 0.0, 8.0, 0.1, 0.02, 1.96, 0x2c3036);
    // The steel hatch's frame, in the passage into the Hall (x -27 to -25, 2.6 m
    // high, in the wall z 12 to 12.3). A lining of dark steel narrows the
    // opening to 1.86 x 2.53 m, and stands 2 cm proud of the wall on both faces
    // (so they do not fight); a heavier trim runs round it on each face.
    const FRAME = 0x2f343b;

    for (const x of [-26.965, -25.035]) {
      p.box(x, 0, 12.15, 0.07, 2.53, 0.34, FRAME);
    }

    p.box(-26.0, 2.53, 12.15, 2.0, 0.07, 0.34, FRAME);
    p.box(-26.0, 0, 12.15, 1.86, 0.015, 0.34, 0x24282d);

    // The door leaf is a little smaller than its opening (so it can swing):
    // steel closes what is left, so nobody can look through the crack when it
    // is shut: a strip against the hinge side, one down the latch side, one
    // over the top and a low sill. Each is as thick as the door.
    for (const [x, y, w, h] of [
      [-26.965, 0, 0.08, 2.6],
      [-25.05, 0, 0.12, 2.6],
      [-26.0, 2.47, 2.0, 0.13],
      [-26.0, 0, 2.0, 0.04],
    ] as const) {
      p.box(x, y, 12.15, w, h, 0.1, 0x24282d);
    }

    // A plain trim round the opening on each face: rust-brown flat steel, no
    // bolts, no stripes.
    for (const z of [11.975, 12.325]) {
      for (const x of [-27.07, -24.93]) {
        p.box(x, 0, z, 0.1, 2.7, 0.04, 0x2a2420);
      }

      p.box(-26.0, 2.62, z, 2.2, 0.1, 0.04, 0x2a2420);
    }

    // The receiver the latch bar runs into, on the east jamb (inside), with
    // its slot, and a stop plate on the sill.
    p.box(-25.035, 0.86, 11.99, 0.1, 0.3, 0.03, STEEL);
    p.box(-25.04, 1.0, 11.985, 0.07, 0.09, 0.02, 0x0c0d0f);
    p.box(-25.035, 0, 11.99, 0.1, 0.06, 0.03, STEEL);
    // A stamped plate by the hatch.
    p.box(-24.6, 1.55, 11.99, 0.5, 0.18, 0.012, 0x2f3338);
    p.box(-24.6, 1.6, 11.985, 0.4, 0.04, 0.006, LABEL);
    // Signs: AUTHORISED ONLY by the east door, an inventory board, a no-smoking plate.
    p.box(-20.51, 2.1, 10.75, 0.012, 0.3, 0.46, WARN_RED);
    p.box(-20.516, 2.2, 10.75, 0.006, 0.1, 0.34, LABEL);
    p.box(-20.51, 1.5, 10.1, 0.012, 0.6, 0.4, 0x2f3338);

    for (let r = 0; r < 4; r++) {
      p.box(-20.516, 1.56 + r * 0.13, 10.1, 0.006, 0.02, 0.32, LABEL);
      boardLed(p, r);
    }

    extinguisher(p, -20.5, 0.9, 11.4, "x", -1);
    map.createFitting("fittings-armory-wall", F, p.elements, []);
  }

  // ------------------------------------------------ overhead: beams and duct
  {
    const p = new Pieces();
    const ceiling = 6.5;

    // Steel I-beams across the room under the ceiling, every 3.1 m, with a
    // pair of hanger rods to the ceiling at each end.
    for (const x of [-30.2, -27.1, -24.0, -21.1]) {
      p.box(x, ceiling - 0.6, 8.65, 0.3, 0.05, 6.5, BEAM_BLACK);
      p.box(x, ceiling - 0.32, 8.65, 0.3, 0.05, 6.5, BEAM_BLACK);
      p.box(x, ceiling - 0.55, 8.65, 0.06, 0.23, 6.4, CHARCOAL);
    }

    // The ventilation duct along the north wall, lying over the beams right up
    // under the ceiling (a low, wide section), with flanges, a damper and an
    // open louvred end over the door.
    const ductY = 6.14;

    p.box(-26.1, ductY, 5.95, 10.8, 0.28, 0.8, GUNMETAL);

    for (let x = -30.8; x < -21; x += 1.8) {
      p.box(x, ductY - 0.01, 5.95, 0.07, 0.3, 0.86, STEEL);
    }

    p.box(-27.5, ductY + 0.28, 5.95, 0.5, 0.02, 0.5, CHARCOAL);
    p.box(-20.8, ductY + 0.02, 5.95, 0.06, 0.24, 0.64, STEEL_BARE);

    for (let k = 0; k < 4; k++) {
      p.box(-20.74, ductY + 0.04 + k * 0.06, 5.95, 0.02, 0.025, 0.6, CHARCOAL);
    }

    map.createFitting("armory-overhead", F, p.elements, []);
  }

  // The crates, locker and clutter of the stash.
  furnishArmoryStash(map, F);
  furnishArmoryVent(map, F);
  registerThrowablePickups(map, F);

  // The dynamite: one bundle on the maintenance table's near edge, taken for
  // the mission (it is not a throwable, and stays gone until the next round).
  // It lies in the free corner by the table's west end, clear of the pistol
  // and the tray (see tableClutter).
  map.addPickup({
    id: "armory-dynamite-1",
    type: "DYNAMITE",
    x: -27.36,
    y: F + 0.91,
    z: 9.04,
    amount: 1,
    respawn: 1e9,
  });

  // The tube lighting under the beams, and its lamps.
  furnishTubeFixtures(map, F);
  furnishTubeLights(map);

  // Damp, grime, soot, rust marks and a little litter.
  furnishArmoryWear(map, F);

  // A worn safety line in front of the three bays, and dust on the floor.
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
