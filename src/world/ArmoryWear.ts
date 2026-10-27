import { Pieces, rng } from "./FittingPieces";
import type { DecalDefinition, GraffitiDefinition } from "./ArenaLayout";
import type { MapBuilder } from "./MapParts";

/**
 * The Armory's wear: what a damp, neglected, lived-in store looks like beside
 * the furnishings themselves. Floor marks (damp patches, oil, grime along the
 * walls and under the shelving, scuffs and hairline cracks), moisture and
 * soot on the walls, and a little low litter left by whoever uses the room.
 * Every mark is soft and localised; the litter is all flat or under 12 cm, so
 * no walking route, sightline or collision box changes.
 */

/** Muted rust, only for bare steel at joints and feet. */
export const RUST = 0x5a3b2a;
/** The worn, dark timber of the table and bench tops. */
export const WORN_TIMBER = 0x3b2e22;

const GRIME = 0x1a1713;
const DAMP = 0x07090b;

/** The floor marks (ids start `decal-room-`, so they may lie inside the room). */
function floorMarks(map: MapBuilder, F: number): void {
  const mark = (
    id: string,
    kind: DecalDefinition["kind"],
    x: number,
    z: number,
    width: number,
    depth: number,
    rotation: number,
    color: number,
    alpha: number,
  ): void =>
    map.addDecal({
      id: `decal-room-armory-${id}`,
      kind,
      x,
      z,
      y: F,
      width,
      depth,
      rotation,
      color,
      alpha,
    });

  // Damp: under the shutter where rain gets in, and in the low corners.
  mark("damp-shutter", "stain", -21.5, 8.0, 2.6, 2.0, 0.3, DAMP, 0.34);
  mark("damp-south-east", "stain", -21.4, 11.3, 1.8, 1.2, 0.8, DAMP, 0.3);
  mark("damp-north-west", "stain", -30.9, 6.0, 1.6, 1.1, 0.4, DAMP, 0.3);
  // A shallow pool where water collects, a little darker and bluer.
  mark("pool", "stain", -23.6, 10.5, 1.7, 1.2, 0.5, 0x0a1118, 0.4);

  // Grime gathered along the walls and at the bases of the shelving.
  mark("grime-north", "dust", -24.4, 5.6, 4.2, 0.55, 0, GRIME, 0.32);
  mark("grime-bays", "dust", -31.25, 9.1, 0.55, 5.2, 0, GRIME, 0.32);
  mark("grime-east", "dust", -20.8, 10.6, 0.5, 2.6, 0, GRIME, 0.26);

  // Oil and grease round the maintenance table and bench.
  mark("oil-table", "stain", -26.3, 8.6, 1.5, 1.0, 0.2, 0x050505, 0.34);
  mark("oil-table-drip", "stain", -25.0, 9.9, 0.6, 0.45, 1.1, 0x050505, 0.28);
  mark("oil-bench", "stain", -29.3, 6.3, 1.2, 0.7, 0.1, 0x050505, 0.3);

  // Rust runoff under the cabinet.
  mark("rust-cabinet", "stain", -31.0, 6.4, 0.8, 0.5, 0.2, 0x3a2418, 0.22);

  // Foot traffic: scuffs worn pale from the door to the table and bays.
  mark("scuff-door", "wear", -23.3, 8.0, 3.4, 0.7, 0.06, 0x7d8084, 0.16);
  mark("scuff-table", "wear", -26.4, 10.3, 2.2, 0.35, 0.3, 0x6a6e72, 0.18);

  // Hairline cracks.
  mark("crack-a", "wear", -28.0, 10.8, 1.8, 0.07, 0.5, 0x030303, 0.45);
  mark("crack-b", "wear", -27.2, 11.2, 0.9, 0.06, -0.4, 0x030303, 0.4);
  mark("crack-c", "wear", -23.0, 6.9, 1.4, 0.07, 1.2, 0x030303, 0.4);
}

/** Moisture, run-off and soot on the walls (the same planes the wall paint uses). */
function wallMarks(map: MapBuilder, F: number): void {
  const mark = (
    id: string,
    kind: GraffitiDefinition["kind"],
    x: number,
    y: number,
    z: number,
    nx: number,
    nz: number,
    width: number,
    height: number,
    seed: number,
  ): void =>
    map.addGraffiti({
      id: `graffiti-armory-${id}`,
      kind,
      x,
      y,
      z,
      nx,
      nz,
      width,
      height,
      fade: 0.5,
      seed,
    });

  // North wall (faces +z): damp at the foot, run-off from above, soot by the beams.
  mark("n-damp-a", "damp", -24.2, F + 0.8, 5.3, 0, 1, 3.6, 1.6, 11);
  mark("n-damp-b", "damp", -30.2, F + 0.5, 5.3, 0, 1, 1.5, 1.0, 12);
  mark("n-streaks", "streaks", -25.5, F + 4.8, 5.3, 0, 1, 2.4, 3.4, 13);
  mark("n-soot", "soot", -22.6, F + 5.6, 5.3, 0, 1, 2.6, 1.8, 14);

  // East wall (faces -x): damp round the shutter, a run beside it.
  mark("e-damp", "damp", -20.5, F + 0.8, 10.9, -1, 0, 2.6, 1.6, 15);
  mark("e-damp-b", "damp", -20.5, F + 0.7, 6.4, -1, 0, 1.3, 1.4, 16);
  mark("e-streaks", "streaks", -20.5, F + 4.9, 9.9, -1, 0, 2.2, 3.2, 17);

  // West wall (faces +x): run-off above the bays, soot under the ceiling.
  mark("w-streaks-a", "streaks", -31.7, F + 5.0, 8.3, 1, 0, 3.0, 3.0, 18);
  mark("w-streaks-b", "streaks", -31.7, F + 5.0, 10.9, 1, 0, 2.2, 3.0, 19);
  mark("w-soot", "soot", -31.7, F + 5.8, 7.0, 1, 0, 2.4, 1.6, 20);
}

/** Low litter and small signs of use: nothing taller than 12 cm. */
function litter(map: MapBuilder, F: number): void {
  const random = rng(7741);
  const p = new Pieces();
  const SLAT = 0x5a4630;
  const SLAT_DARK = 0x44362a;
  const CARD = 0x6a5a40;

  // Broken pallet slats by the ammunition stack in the north-east corner.
  p.box(-23.0, 0, 6.7, 0.95, 0.022, 0.095, SLAT, 0.35);
  p.box(-22.7, 0, 6.35, 0.6, 0.022, 0.095, SLAT_DARK, -0.2);
  p.box(-23.55, 0, 6.5, 0.4, 0.022, 0.09, SLAT, 1.1);

  // Torn cardboard and a crumpled sheet of newspaper.
  p.box(-30.1, 0, 6.2, 0.42, 0.006, 0.3, CARD, 0.5);
  p.box(-23.9, 0, 11.3, 0.5, 0.006, 0.34, CARD, -0.3);
  p.box(-24.2, 0, 10.1, 0.3, 0.012, 0.22, 0x5c584c, 0.9);
  p.box(-28.6, 0, 11.0, 0.36, 0.006, 0.26, 0x56452e, 0.2);

  // Spent brass and a few cigarette ends where someone has stood by the table.
  for (let k = 0; k < 7; k++) {
    p.bar(
      -27.4 + random() * 1.4,
      0.007,
      9.9 + random() * 0.7,
      0.04,
      0.012,
      0x8a6a2e,
      random() * 3,
    );
  }

  for (let k = 0; k < 4; k++) {
    p.bar(
      -25.8 + random() * 0.6,
      0.005,
      10.0 + random() * 0.4,
      0.028,
      0.008,
      0xb6b0a0,
      random() * 3,
    );
  }

  // A couple of empty bottles and tins left on the floor, one tin on its side.
  p.bar(-26.9, 0.035, 10.6, 0.2, 0.07, 0x2b3a2a, 0.7);
  p.bar(-25.2, 0.035, 10.9, 0.2, 0.07, 0x3a2f22, 2.2);
  p.post(-27.8, 0, 10.2, 0.09, 0.075, 0x6b5a48);
  p.bar(-27.55, 0.037, 10.45, 0.09, 0.075, 0x6b5a48, 1.0, Math.PI / 2);

  // A grease rag and a spill of loose rounds by the north wall.
  p.box(-27.2, 0, 6.1, 0.22, 0.03, 0.14, 0x25262a, 0.6);

  for (let k = 0; k < 5; k++) {
    p.bar(
      -26.2 + random() * 0.3,
      0.007,
      6.0 + random() * 0.3,
      0.035,
      0.011,
      0x8a6a2e,
      random() * 3,
    );
  }

  map.createFitting("armory-litter", F, p.elements, []);
}

export function furnishArmoryWear(map: MapBuilder, floorY: number): void {
  floorMarks(map, floorY);
  wallMarks(map, floorY);
  litter(map, floorY);
}
