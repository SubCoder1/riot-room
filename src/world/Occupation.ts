import { BREAK_BULB, JUNK_BULBS, bulbFitting } from "./JunkRoom";
import { Pieces, rng } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import {
  BLACK,
  CARDBOARD,
  CARDBOARD_B,
  CHARCOAL,
  GUNMETAL,
  PAPER,
  STEEL,
  STEEL_BARE,
  TIMBER,
  TIMBER_B,
  TIMBER_DARK,
} from "./RoomKit";
import { pallet } from "./StorageRoom";

/**
 * The marks of the thugs' occupation and of the interrupted work, laid over
 * the rooms that already exist, and the room-by-room practical lights.
 *
 * Everything here is drawn only (no collision): crude paint marks and tallies
 * on the walls, hanging bulbs and work lamps on their cords, a plasterboard
 * stack, a half-framed doorway and partition, an improvised bed, a hand
 * trolley, opened packages and offcuts. Nothing stands in a doorway or a lane.
 *
 * The lights are few and deliberate (about a dozen in all, no shadows): each
 * room has its own colour and strength, and several have none, taking only the
 * spill of the next room.
 */

const CHALK = 0xc9c6b4;
const PAINT_RED = 0x8a2a24;
const PAINT_BLUE = 0x3c5a78;
const PAINT_YELLOW = 0x9a8836;
const STAIN = 0x2a3036;
const DUST = 0x9a9890;

type Axis = "x" | "z";

/** A box on a wall facing along `axis` (towards `sign`), `u` along the wall. */
function onWall(
  p: Pieces,
  axis: Axis,
  sign: 1 | -1,
  at: number,
  u: number,
  y: number,
  a: number,
  h: number,
  color: number,
  turn = 0,
): void {
  // `at` is the wall's face; the mark stands 5 mm off it.
  if (axis === "z") {
    p.box(u, y, at + sign * 0.005, a, h, 0.006, color, 0, turn);
  } else {
    p.box(at + sign * 0.005, y, u, 0.006, h, a, color, 0, 0, turn);
  }
}

/** A crude X: two painted strokes. */
function crudeX(
  p: Pieces,
  axis: Axis,
  sign: 1 | -1,
  at: number,
  u: number,
  y: number,
  size: number,
  color: number,
): void {
  onWall(p, axis, sign, at, u, y, 0.05, size, color, 0.7);
  onWall(p, axis, sign, at, u, y, 0.05, size, color, -0.7);
}

/**
 * A tally scratched or smeared on a wall: uneven, a little faded and few,
 * never a tidy row. (Strokes vary in length, lean and spacing; the colour is
 * a dusty grey, not bright chalk.)
 */
function tally(
  p: Pieces,
  axis: Axis,
  sign: 1 | -1,
  at: number,
  u: number,
  y: number,
  groups: number,
  color = 0x8f8d82,
): void {
  const count = Math.min(groups, 2);
  let seed = Math.floor(Math.abs(u * 17 + y * 31 + at * 7)) + 3;
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

    return seed / 4294967296;
  };

  for (let g = 0; g < count; g++) {
    let x = u + g * 0.4;

    for (let k = 0; k < 4; k++) {
      const h = 0.15 + rnd() * 0.08;

      onWall(
        p,
        axis,
        sign,
        at,
        x,
        y + (rnd() - 0.5) * 0.03,
        0.011,
        h,
        color,
        (rnd() - 0.5) * 0.14,
      );
      x += 0.045 + rnd() * 0.03;
    }

    onWall(
      p,
      axis,
      sign,
      at,
      x - 0.1,
      y + 0.09 + rnd() * 0.03,
      0.2 + rnd() * 0.06,
      0.012,
      color,
      0.5 + rnd() * 0.25,
    );
  }
}

/** A handwritten label: a scrap of pale card with a few dark scrawls. */
function scrawl(
  p: Pieces,
  axis: Axis,
  sign: 1 | -1,
  at: number,
  u: number,
  y: number,
  w: number,
  ink = 0x2a2622,
): void {
  onWall(p, axis, sign, at, u, y, w, w * 0.45, 0xa8a48e, 0.04);

  for (let k = 0; k < 3; k++) {
    onWall(
      p,
      axis,
      sign,
      at + sign * 0.004,
      u - w * 0.1 + k * 0.01,
      y + w * 0.08 + k * w * 0.1,
      w * (0.7 - k * 0.15),
      0.012,
      ink,
      0.03,
    );
  }
}

/** A bare bulb on a cord from the ceiling, in a wire guard, `drop` metres below the 3.8 m ceiling. */
function bulb(
  p: Pieces,
  x: number,
  z: number,
  drop: number,
  shade = false,
): void {
  const y = 3.8 - drop;

  p.cableUp(x, y, z, drop, 0.016, 0x1d1f23);
  p.post(x, y - 0.12, z, 0.12, 0.07, 0xe8dcb0);

  if (shade) {
    p.post(x, y - 0.02, z, 0.02, 0.34, 0x3a3f46);
    p.post(x, y - 0.1, z, 0.08, 0.24, 0x3a3f46);
  } else {
    for (const a of [0, 1.0, 2.0]) {
      p.bar(x, y - 0.06, z, 0.16, 0.012, STEEL_BARE, a);
    }
  }
}

/** A stack of plasterboard sheets leaning on a wall facing +x (the wall at `wallX`). */
function plasterboard(
  p: Pieces,
  wallX: number,
  z: number,
  sheets: number,
): void {
  for (let k = 0; k < sheets; k++) {
    p.box(
      wallX + 0.28 - k * 0.012,
      0,
      z + k * 0.02,
      0.012,
      2.3,
      1.2,
      k % 3 ? 0xb9b49c : 0x9a9486,
      0,
      0.12 + k * 0.003,
    );
  }

  p.box(wallX + 0.5, 0, z + 0.1, 0.06, 0.1, 1.2, TIMBER_DARK);
  p.box(wallX + 0.54, 0.0, z, 0.5, 0.08, 1.3, TIMBER_DARK);
}

/** A half-framed doorway against a wall facing -z (south wall, z), width `w`. */
function doorFrame(p: Pieces, x: number, z: number, w: number): void {
  for (const dx of [-w / 2, w / 2]) {
    p.box(x + dx, 0, z, 0.09, 2.1, 0.09, TIMBER);
  }

  p.box(x, 2.1, z, w + 0.09, 0.09, 0.09, TIMBER_B);
  p.box(x - w * 0.3, 0.0, z, 0.06, 2.1, 0.06, TIMBER_DARK, 0.0);
  p.box(x, 0.0, z, w, 0.06, 0.09, TIMBER_DARK);
  // A brace nailed across one corner, and the bright raw ends of the cuts.
  p.box(x - w / 2 + 0.3, 1.8, z, 0.06, 0.7, 0.05, TIMBER_B, 0, 0.8);
  p.box(x + w / 2, 2.1, z, 0.1, 0.02, 0.1, 0xb59a6a);
}

/** Studs of a partition, a plate each end, and two sheets hung on the left half. */
function partition(
  p: Pieces,
  x0: number,
  x1: number,
  z: number,
  h: number,
): void {
  p.box((x0 + x1) / 2, 0, z, x1 - x0, 0.06, 0.09, TIMBER_DARK);
  p.box((x0 + x1) / 2, h, z, x1 - x0, 0.06, 0.09, TIMBER_DARK);

  for (let x = x0 + 0.05; x < x1; x += 0.4) {
    p.box(x, 0.06, z, 0.045, h - 0.06, 0.09, TIMBER);
  }

  // Two sheets on the first bay, one hung askew.
  p.box(x0 + 0.5, 0.2, z + 0.06, 0.95, 2.1, 0.012, 0xb9b49c);
  p.box(x0 + 1.5, 0.9, z + 0.062, 0.95, 1.2, 0.012, 0xa8a48e, 0, 0.05);
}

export function furnishOccupation(map: MapBuilder, floorY: number): void {
  const F = floorY;
  const random = rng(8801);

  // ============================================================ SERVER ROOM
  // A functioning room kept by someone: its own cool glow, a tally of shifts
  // and a note on the console.
  {
    const p = new Pieces();

    tally(p, "z", 1, -12.0, 29.3, 1.3, 3);
    scrawl(p, "z", 1, -12.0, 30.7, 1.5, 0.3);
    crudeX(p, "z", 1, -12.0, 23.3, 1.5, 0.3, PAINT_RED);
    // A taped warning and a handwritten label on the console's wall panel.
    scrawl(p, "x", -1, 31.7, -7.1, 1.2, 0.26);
    map.createFitting("occupation-server", F, p.elements, []);
    map.addLight({
      id: "light-room-server",
      castShadow: true,
      x: 27.0,
      y: F + 5.2,
      z: -8.7,
      color: 0x7fb0ea,
      intensity: 26,
      distance: 12,
    });
  }

  // =============================================================== ARCHIVE
  // The Industrial Junk Room (see JunkRoom): damp on the
  // west wall and two weak warm hanging bulbs.
  {
    const p = new Pieces();

    // Water damage on the west wall (the door that was there is walled up).
    for (const [z, w, h, y] of [[-22.6, 0.4, 0.5, 0.0]] as const) {
      p.box(-13.69, y, z, 0.006, h, w, STAIN, 0, 0, 0.06);
    }

    map.createFitting("occupation-archive", F, p.elements, []);
    // The hanging bulbs (drawn in JunkRoom): weak amber pools over the pile and the middle.
    // Each bulb is a downward cone of light from just under its glass, with a
    // visible beam like the halogens (see LightGlow); no lamp head, only the bulb.
    [
      ["bulb-junk-a", 0xffc47a, 80, 11],
      ["bulb-junk-b", 0xffbd70, 72, 9],
    ].forEach(([id, color, intensity, distance], n) => {
      const bulb = JUNK_BULBS[n];

      map.addLight({
        id: id as string,
        castShadow: true,
        x: bulb.x,
        y: F + bulb.y - 0.16,
        z: bulb.z,
        color: color as number,
        intensity: intensity as number,
        distance: distance as number,
        target: { x: bulb.x, y: F, z: bulb.z },
        angle: 1.15,
      });
    });
  }

  // ============================================================== BARRACKS
  // An improvised bed on pallets, a bare bulb, tallies and a crude map.
  {
    const p = new Pieces();

    pallet(p, -22.5, -10.6, 1.0, 1.2, 0.1);
    pallet(p, -22.5, -9.5, 1.0, 1.0, -0.05);
    p.box(-22.5, 0.14, -10.05, 0.9, 0.12, 2.0, 0x6a665a, 0.02);
    p.box(-22.5, 0.26, -10.2, 0.8, 0.06, 1.0, 0x6a3a35, 0.05);
    p.box(-22.5, 0.26, -11.0, 0.5, 0.1, 0.3, 0x9a9486, 0.1);
    p.box(-22.0, 0.26, -9.3, 0.4, 0.04, 0.6, 0x4a4a42, 0.4);
    bulb(p, -24.4, -10.0, 1.5, true);
    tally(p, "z", 1, -11.7, -30.2, 1.0, 2);
    crudeX(p, "x", 1, -31.7, -7.4, 1.4, 0.35, PAINT_RED);
    scrawl(p, "x", 1, -31.7, -5.6, 1.5, 0.3);
    map.createFitting("occupation-barracks", F, p.elements, []);
    map.addLight({
      id: "light-room-barracks",
      castShadow: true,
      x: -24.4,
      y: F + 2.25,
      z: -10.0,
      color: 0xffb870,
      intensity: 13,
      distance: 7,
    });
  }

  // =============================================================== ARMORY
  // Opened boxes, a toolbox, marks (the room is lit by tubes: see ArmoryLighting).
  {
    const p = new Pieces();

    // A toolbox on the floor by the bays.
    p.box(-28.2, 0, 9.9, 0.46, 0.2, 0.2, 0x8a2a24, 0.2);
    p.box(-28.2, 0.2, 9.9, 0.4, 0.02, 0.18, STEEL_BARE, 0.2);
    p.box(-28.45, 0.2, 9.95, 0.1, 0.04, 0.2, STEEL, 0.2);
    // A clamp lamp on the table's corner (the light is above it).
    p.post(-25.2, 0.9, 8.1, 0.6, 0.025, STEEL_BARE);
    p.box(-25.2, 1.5, 8.3, 0.1, 0.1, 0.26, GUNMETAL, 0, 0, 0.6);
    // Paint on the west bays and the cage.
    crudeX(p, "x", 1, -31.7, 9.2, 2.35, 0.3, PAINT_RED);
    tally(p, "x", 1, -31.7, 7.0, 2.35, 2);
    scrawl(p, "z", 1, 5.3, -24.3, 1.6, 0.34);
    map.createFitting("occupation-armory", F, p.elements, []);
  }

  // ============================================================ BREAK ROOM
  // One tired bulb in a tin shade and a few marks by the door.
  {
    const p = new Pieces();

    // A bare hanging bulb (its glass is drawn with `createJunkBulbGlow`).
    bulbFitting(p, BREAK_BULB.x, BREAK_BULB.z, BREAK_BULB.y);
    tally(p, "z", 1, 3.3, 23.0, 1.2, 2);
    scrawl(p, "z", 1, 3.3, 30.6, 1.5, 0.3);
    crudeX(p, "x", -1, 31.7, 10.6, 1.4, 0.28, PAINT_RED);
    map.createFitting("occupation-break", F, p.elements, []);
    map.addLight({
      id: "bulb-break-a",
      castShadow: true,
      x: BREAK_BULB.x,
      y: F + BREAK_BULB.y - 0.16,
      z: BREAK_BULB.z,
      color: 0xffd9a0,
      intensity: 70,
      distance: 8,
      target: { x: BREAK_BULB.x, y: F, z: BREAK_BULB.z },
      angle: 1.15,
    });
  }

  // ============================================================== WAREHOUSE
  // (Two tube lights hang from the hoist beam: see HangingTubes.) A hand
  // trolley, opened cartons and offcuts; some of it handwritten.
  {
    const p = new Pieces();

    // A sack truck leaning on the north wall by the middle pillar, a
    // split carton and its spilled contents, offcuts of conduit.
    p.box(23.2, 0.05, 12.55, 0.4, 0.04, 0.3, STEEL);
    p.box(23.1, 0.0, 12.45, 0.03, 1.2, 0.04, STEEL_BARE, 0, 0, -0.18);
    p.box(23.4, 0.0, 12.45, 0.03, 1.2, 0.04, STEEL_BARE, 0, 0, -0.18);
    p.bar(23.0, 0.12, 12.75, 0.05, 0.24, BLACK, 0.0);
    p.bar(23.5, 0.12, 12.75, 0.05, 0.24, BLACK, 0.0);
    p.box(22.0, 0, 20.9, 0.5, 0.3, 0.4, CARDBOARD, 0.3);
    p.box(22.2, 0.3, 20.8, 0.5, 0.01, 0.34, CARDBOARD_B, 0.5, 0, 0.7);

    for (let k = 0; k < 6; k++) {
      p.box(
        21.6 + random() * 1.2,
        0,
        21.3 + random() * 0.8,
        0.14,
        0.12,
        0.1,
        [PAPER, 0x6a6458, 0x8a8f86][k % 3],
        random() * 3,
      );
    }

    for (let k = 0; k < 3; k++) {
      p.bar(
        24.2 + k * 0.2,
        0.02,
        22.4 + k * 0.1,
        0.7,
        0.025,
        0x8a8f86,
        0.4 + k * 0.5,
      );
    }

    scrawl(p, "z", -1, 23.7, 24.0, 1.8, 0.34);
    crudeX(p, "z", -1, 23.7, 29.4, 1.9, 0.34, PAINT_RED);
    tally(p, "x", 1, 18.3, 15.0, 1.6, 2);
    map.createFitting("occupation-warehouse", F, p.elements, []);
  }

  // ========================================================== YARD / STORAGE
  // A half-framed partition, a work lamp over the compressor, offcuts.
  {
    const p = new Pieces();

    partition(p, -11.2, -9.3, 15.4, 2.4);
    bulb(p, -14.8, 22.0, 1.2, true);

    for (let k = 0; k < 5; k++) {
      p.box(
        -12.4 + random() * 1.2,
        0,
        21.0 + random() * 1.0,
        0.5 + random() * 0.4,
        0.04,
        0.1,
        TIMBER_B,
        random() * 3,
      );
    }

    p.chunk(-16.2, 0, 22.4, 0.22, 0x6a6e73, 5);
    p.chunk(-16.0, 0, 22.2, 0.14, 0x575b61, 6);
    scrawl(p, "z", -1, 23.7, -13.0, 1.7, 0.32);
    map.createFitting("occupation-yard", F, p.elements, []);
    map.addLight({
      id: "light-room-yard",
      x: -14.8,
      y: F + 2.7,
      z: 22.0,
      color: 0xffd9a0,
      intensity: 18,
      distance: 8.5,
    });
  }

  // ==================================================================== HALL
  // The way through the unfinished building: conduit, paint marks, a stack of
  // plasterboard, a doorframe with no door, tape round the podium, small light.
  {
    const p = new Pieces();

    // Conduit along the north wall, either side of the doors, with boxes.
    for (const [x0, x1] of [
      [-31.5, -27.3],
      [-24.7, -20.3],
    ] as const) {
      p.alongX(x0, x1, 3.0, 12.4, 0.05, STEEL);

      for (let x = x0 + 0.6; x < x1; x += 1.3) {
        p.box(x, 2.94, 12.37, 0.06, 0.12, 0.05, CHARCOAL);
      }
    }

    p.box(-29.0, 2.85, 12.36, 0.24, 0.3, 0.12, GUNMETAL);
    p.box(-22.0, 2.85, 12.36, 0.24, 0.3, 0.12, GUNMETAL);
    p.post(-22.0, 1.0, 12.4, 1.85, 0.04, STEEL);
    // Level marks round the columns, a levelling line on the west wall.
    for (const [x, z] of [
      [-28, 16],
      [-23, 20],
    ] as const) {
      p.box(x, 1.0, z, 0.84, 0.014, 0.84, PAINT_BLUE);
      p.box(x, 1.5, z, 0.84, 0.01, 0.84, PAINT_RED);
    }

    onWall(p, "x", 1, -31.7, 21.0, 1.0, 5.0, 0.016, PAINT_BLUE);
    scrawl(p, "x", 1, -31.7, 14.4, 1.5, 0.3);
    crudeX(p, "z", -1, 23.7, -22.0, 1.5, 0.4, PAINT_RED);
    onWall(p, "z", 1, 12.3, -23.0, 1.2, 0.5, 0.014, PAINT_YELLOW);
    tally(p, "z", -1, 23.7, -29.4, 1.3, 4);
    // Plasterboard on the west wall's south end; a doorframe with no door.
    plasterboard(p, -31.7, 21.4, 7);
    doorFrame(p, -25.3, 23.6, 1.2);
    // Tape round the podium's open front: two stakes and three strands.
    for (const z of [17.05, 19.95]) {
      p.post(-29.2, 0.4, z, 0.7, 0.04, TIMBER);
    }

    for (let k = 0; k < 10; k++) {
      p.box(
        -29.2,
        0.95,
        17.05 + k * 0.29,
        0.012,
        0.07,
        0.2,
        k % 2 ? CHALK : 0x9a2f27,
        0.1,
      );
    }

    // A bucket and a trowel, a little spilled plaster, a drift of dust.
    p.post(-30.3, 0, 14.0, 0.3, 0.26, 0x6a727e);
    p.box(-29.6, 0, 14.4, 0.4, 0.006, 0.3, DUST, 0.3);
    p.chunk(-20.0, 0, 22.8, 0.2, 0x6a6e73, 7);
    map.createFitting("occupation-hall", F, p.elements, []);
    // (The bare lamp that hung by the Armory door, with its cord and its
    // blown-out streak of light, has been taken down.)
    map.addLight({
      id: "light-room-hall-b",
      x: -21.5,
      y: F + 3.2,
      z: 21.5,
      color: 0xffe0b8,
      intensity: 13,
      distance: 7.5,
    });
  }

  // =============================================== THE WEST TERRACE SCAFFOLD
  {
    const p = new Pieces();

    // A work lamp clamped to the scaffold's deck rail, on a short arm.
    p.box(-26.6, 3.2, -2.35, 0.3, 0.2, 0.2, GUNMETAL);
    p.box(-26.6, 3.2, -2.5, 0.04, 0.04, 0.2, STEEL_BARE);
    map.createFitting("occupation-terrace", F, p.elements, []);
    map.addLight({
      id: "light-site-scaffold",
      x: -26.6,
      y: F + 3.3,
      z: -1.95,
      color: 0xffcf94,
      intensity: 22,
      distance: 16,
      target: { x: -26.0, y: F + 0.2, z: 0.5 },
      angle: 0.9,
    });
  }
}
