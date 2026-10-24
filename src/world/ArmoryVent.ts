import { Pieces } from "./FittingPieces";
import { ROOF_HIGH, ROOF_THICKNESS } from "./ArenaLayout";
import { bounds, type Bounds, type MapBuilder } from "./MapParts";
/** The frame, curb and hinges: black steel, like the grating. */
const BLACK_STEEL = 0x08090b;

/**
 * The Armory overhead vents: one row of grates in the ceiling along the south
 * wall, in the south-west of the roof, away from the tube lights. Each runs full
 * length from one tube line to the next (the beams the lights hang from), with
 * solid concrete left on every tube line between two vents, and is the floor
 * vents' own grating. Everything else overhead is the solid concrete roof. The grates are solid to
 * walk on from the roof, and open to rain; one of them is the hatch: E on the
 * roof lifts it on its west hinge and it stays up, a clear drop into the room.
 * Water drips from gaps in every grate (VentDrips).
 */

export const VENT_HATCH_ID = "hatch-armory-vent";
/** The fixed grates of the row carry this prefix: `vent-grating-armory-<n>`. */
export const VENT_GRATING_PREFIX = "vent-grating-";

/** The tube lines: the beams (and the lights hung from them) run along z at these x. */
const TUBE_LINES = [-30.2, -27.1, -24.0, -21.1];
/** Half the concrete left on each tube line, between two vents (m). */
const LINE_GAP = 0.35;
const ROW_X0 = -31.5;
const ROW_Z0 = 10.6;
const ROW_DEPTH = 1.2;
/** The hatch is this wide: a 1.2 m square cut from one of the long vents. */
const HATCH_WIDTH = 1.2;

/**
 * The row, west to east: a vent fills each stretch between two tube lines,
 * full length, with a gap of solid concrete on every line. The stretch over
 * the open floor is cut in two, the west half being the hatch.
 */
function ventSpans(): Array<{ minX: number; maxX: number; hatch: boolean }> {
  const edges: Array<[number, number]> = [[ROW_X0, TUBE_LINES[0] - LINE_GAP]];

  for (let i = 0; i < TUBE_LINES.length - 1; i++) {
    edges.push([TUBE_LINES[i] + LINE_GAP, TUBE_LINES[i + 1] - LINE_GAP]);
  }

  const spans: Array<{ minX: number; maxX: number; hatch: boolean }> = [];

  edges.forEach(([minX, maxX], i) => {
    // The stretch between the 2nd and 3rd lines: the hatch and its mate.
    if (i === 2) {
      spans.push({ minX, maxX: minX + HATCH_WIDTH, hatch: true });
      spans.push({ minX: minX + HATCH_WIDTH, maxX, hatch: false });
    } else {
      spans.push({ minX, maxX, hatch: false });
    }
  });

  return spans;
}

/** The vents, west to east, each from one tube line to the next. */
export const ARMORY_VENT_BLOCKS: Bounds[] = ventSpans().map((span) =>
  bounds(span.minX, span.maxX, ROW_Z0, ROW_Z0 + ROW_DEPTH),
);

const HATCH_INDEX = ventSpans().findIndex((span) => span.hatch);

/** The whole row: the opening cut in the roof (the concrete on the tube lines is put back). */
export const ARMORY_VENT_ROW: Bounds = bounds(
  ARMORY_VENT_BLOCKS[0].minX,
  ARMORY_VENT_BLOCKS[ARMORY_VENT_BLOCKS.length - 1].maxX,
  ROW_Z0,
  ROW_Z0 + ROW_DEPTH,
);

/** The solid concrete between the vents, on the tube lines: roof put back into the row's opening. */
export function ventRoofGaps(): Bounds[] {
  const gaps: Bounds[] = [];

  for (let i = 0; i < ARMORY_VENT_BLOCKS.length - 1; i++) {
    const a = ARMORY_VENT_BLOCKS[i];
    const b = ARMORY_VENT_BLOCKS[i + 1];

    // (Between the hatch and its mate there is only a seam.)
    if (b.minX - a.maxX > 0.1) {
      gaps.push(bounds(a.maxX, b.minX, ROW_Z0, ROW_Z0 + ROW_DEPTH));
    }
  }

  return gaps;
}

/** The hatch grate. */
export const ARMORY_VENT_HOLE: Bounds = ARMORY_VENT_BLOCKS[HATCH_INDEX];

/** The grates are level with the ceiling (10.5 m): their tops just under it. */
export const ARMORY_VENT_TOP = ROOF_HIGH - ROOF_THICKNESS + 0.02;
/** How thick they are: their undersides are flush. */
export const ARMORY_VENT_THICKNESS = 0.07;

/** The fixed grates: every one of the row but the hatch. */
export function fixedVentBlocks(): Array<{ id: string; area: Bounds }> {
  return ARMORY_VENT_BLOCKS.map((area, i) => ({
    id: `${VENT_GRATING_PREFIX}armory-${i + 1}`,
    area,
  })).filter((_, i) => i !== HATCH_INDEX);
}

/** The panel is a little smaller than its hole, hinged on the west edge. */
const PANEL_SCALE = 0.96;
const RIM = 0.05;
const PITCH = 0.12;

/** A grating, as boxes [x, y, z, sx, sy, sz] about its west hinge (see ArenaBuilder). */
export function grilleBars(
  hole: Bounds,
): Array<[number, number, number, number, number, number]> {
  const w = (hole.maxX - hole.minX) * PANEL_SCALE;
  const d = (hole.maxZ - hole.minZ) * PANEL_SCALE;
  const bars: Array<[number, number, number, number, number, number]> = [];

  // The frame.
  bars.push([w / 2, -0.04, -d / 2 + RIM / 2, w, 0.06, RIM]);
  bars.push([w / 2, -0.04, d / 2 - RIM / 2, w, 0.06, RIM]);
  bars.push([RIM / 2, -0.04, 0, RIM, 0.06, d - RIM * 2]);
  bars.push([w - RIM / 2, -0.04, 0, RIM, 0.06, d - RIM * 2]);

  // Narrow bars along x, gaps between.
  for (let z = -d / 2 + RIM + PITCH / 2; z < d / 2 - RIM; z += PITCH) {
    bars.push([w / 2, -0.04, z, w - RIM * 2, 0.06, 0.03]);
  }

  // Straps under them, across: it reads as a net from below.
  for (let x = 0.12; x < w - RIM; x += 0.24) {
    bars.push([x, -0.085, 0, 0.03, 0.03, d - RIM * 2]);
  }

  return bars;
}

/**
 * Where water drips: one gap in each of the vents (the middle of a gap between
 * two bars, midway between two straps), at a different place on each. World x, z.
 */
export function ventDripPoints(): Array<{ x: number; z: number }> {
  const ks = [1, 4, 6, 2, 5];

  return ARMORY_VENT_BLOCKS.map((block, i) => {
    const w = (block.maxX - block.minX) * PANEL_SCALE;
    const d = (block.maxZ - block.minZ) * PANEL_SCALE;
    const cz = (block.minZ + block.maxZ) / 2;
    // Midway between two straps (0.12 + 0.24 n), somewhere along the vent.
    const straps = Math.max(1, Math.floor((w - 0.3) / 0.24));
    const xl = 0.24 + ((i * 3 + 1) % straps) * 0.24;

    return {
      x: block.minX + 0.02 + xl,
      z: cz - d / 2 + RIM + PITCH / 2 + ks[i % ks.length] * PITCH + PITCH / 2,
    };
  });
}

/** The frame round the row under the roof, and the curb and hinge on it (drawn only). */
export function furnishArmoryVent(map: MapBuilder, floorY: number): void {
  const p = new Pieces();
  const row = ARMORY_VENT_ROW;
  const cx = (row.minX + row.maxX) / 2;
  const cz = (row.minZ + row.maxZ) / 2;
  const w = row.maxX - row.minX;
  const d = row.maxZ - row.minZ;
  const roof = ROOF_HIGH - floorY;

  // A steel angle frame round the row, flush under the roof, and a seam
  // between the grates.
  const ring = 0.08;
  const y = 6.5 - 0.075;

  p.box(cx, y, row.minZ - ring / 2, w + ring * 2, 0.07, ring, BLACK_STEEL);
  p.box(cx, y, row.maxZ + ring / 2, w + ring * 2, 0.07, ring, BLACK_STEEL);
  p.box(row.minX - ring / 2, y, cz, ring, 0.07, d, BLACK_STEEL);
  p.box(row.maxX + ring / 2, y, cz, ring, 0.07, d, BLACK_STEEL);

  for (const block of ARMORY_VENT_BLOCKS) {
    p.box(block.minX, y, cz, 0.05, 0.07, d, BLACK_STEEL);
    p.box(block.maxX, y, cz, 0.05, 0.07, d, BLACK_STEEL);
  }

  // On the roof: a low curb along both sides and the ends, hinge knuckles on
  // the hatch, and bolts along the curb.
  const curb = 0.12;

  p.box(cx, roof, row.minZ - 0.12, w + 0.3, curb, 0.1, BLACK_STEEL);
  p.box(cx, roof, row.maxZ + 0.02, w + 0.3, curb, 0.1, BLACK_STEEL);
  p.box(row.minX - 0.12, roof, cz, 0.1, curb, d + 0.1, BLACK_STEEL);
  p.box(row.maxX + 0.02, roof, cz, 0.1, curb, d + 0.1, BLACK_STEEL);

  const hatch = ARMORY_VENT_HOLE;
  const hz = (hatch.minZ + hatch.maxZ) / 2;

  for (const sz of [-1, 1]) {
    p.box(
      hatch.minX + 0.02,
      roof + curb,
      hz + sz * (ROW_DEPTH * 0.3),
      0.07,
      0.05,
      0.1,
      BLACK_STEEL,
    );
  }

  for (let x = row.minX + 0.4; x < row.maxX; x += 1.4) {
    for (const z of [row.minZ - 0.12, row.maxZ + 0.02]) {
      p.box(x, roof + curb, z, 0.04, 0.014, 0.04, BLACK_STEEL);
    }
  }

  map.createFitting("armory-vent", floorY, p.elements, []);

  // Where the water lands: dark damp patches on the floor, under some of the grates.
  [1, HATCH_INDEX].forEach((i) => {
    const block = ARMORY_VENT_BLOCKS[i];

    map.addDecal({
      id: `decal-room-armory-vent-damp-${i + 1}`,
      kind: "stain",
      x: (block.minX + block.maxX) / 2,
      z: (block.minZ + block.maxZ) / 2 - 0.2,
      y: floorY,
      width: Math.min(2.2, (block.maxX - block.minX) * 0.8),
      depth: 1.0,
      rotation: 0.2 + i * 0.5,
      color: 0x10171e,
      alpha: 0.45,
    });
  });
}
