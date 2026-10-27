import { stairsToSteps, type StairsDefinition } from "./ArenaLayout";
import { Pieces, rng } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import {
  BLACK,
  CHARCOAL,
  GUNMETAL,
  LABEL,
  LED_AMBER,
  LED_RED,
  STEEL,
  STEEL_BARE,
  STEEL_LIGHT,
  plate,
} from "./RoomKit";

/**
 * Shared dressing for the two spawn staircases and the doors on the walkways
 * (all drawn only: nothing here changes a staircase, a landing, a collision
 * box or a clear width):
 *
 *   - a steel handrail with a mid rail and posts on the open side of each
 *     flight, a bracketed handrail on the wall side, newel posts and a toe
 *     strip along the open edge;
 *   - a sloped conduit run with clamps up the wall, a junction box, a dead
 *     caged lamp and an alarm bell, a direction sign at the foot and a level
 *     plate at the top;
 *   - a little debris on the treads and the landings;
 *   - a colour-coded plate over each room door that opens on a walkway.
 */

const HAZARD = 0x9a8836;

/** What a flight looks like from its parts: where it starts and how it climbs. */
interface Flight {
  /** +1 if it climbs towards +x, -1 towards -x. */
  sign: 1 | -1;
  startX: number;
  rise: number;
  tread: number;
  steps: number;
  /** The open edge (z) and the wall edge (z) of the flight. */
  open: number;
  wall: number;
}

function flightOf(stairs: StairsDefinition): Flight {
  return {
    sign: stairs.direction.startsWith("+") ? 1 : -1,
    startX: stairs.start,
    rise: stairs.rise,
    tread: stairs.tread,
    steps: stairs.steps,
    open: stairs.crossMin,
    wall: stairs.crossMax,
  };
}

/** World x at `t` metres up the run. */
const xAt = (f: Flight, t: number): number => f.startX + f.sign * t;
/** The nosing line: the height of the tread edge at `t`. */
const lineY = (f: Flight, t: number): number => (1 + t / f.tread) * f.rise;
/** The top of the tread under `t`. */
const treadTop = (f: Flight, t: number): number =>
  Math.min(f.steps, Math.floor(t / f.tread) + 1) * f.rise;

/** A bar between two points in the x-y plane at depth z. */
function slope(
  p: Pieces,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  d: number,
  color: number,
): void {
  const length = Math.hypot(x1 - x0, y1 - y0);
  const angle = Math.atan2(y1 - y0, x1 - x0);

  p.bar((x0 + x1) / 2, (y0 + y1) / 2, z, length, d, color, 0, angle);
}

function stairDressing(
  map: MapBuilder,
  stairs: StairsDefinition,
  random: () => number,
): void {
  const f = flightOf(stairs);
  const p = new Pieces();
  const run = f.steps * f.tread;
  // The wall faces the open space of the flight's wall edge: the wall's face is at `wall`.
  const inward = f.wall > f.open ? -1 : 1;
  const wallFace = f.wall;

  // ---------------------------- the handrail on the open edge, posts and mid rail
  const zOpen = f.open + 0.05;

  slope(
    p,
    xAt(f, 0.1),
    lineY(f, 0.1) + 0.9,
    xAt(f, run - 0.1),
    lineY(f, run - 0.1) + 0.9,
    zOpen,
    0.05,
    STEEL_BARE,
  );
  slope(
    p,
    xAt(f, 0.1),
    lineY(f, 0.1) + 0.45,
    xAt(f, run - 0.1),
    lineY(f, run - 0.1) + 0.45,
    zOpen,
    0.03,
    STEEL_LIGHT,
  );

  const posts = Math.round(run / 1.1);

  for (let k = 0; k <= posts; k++) {
    const t = 0.1 + (k * (run - 0.2)) / posts;
    const x = xAt(f, t);
    const bottom = treadTop(f, t - 0.0);
    const top = lineY(f, t) + 0.9;

    p.box(x, bottom, zOpen, 0.05, top - bottom, 0.05, CHARCOAL);
    p.box(x, bottom, zOpen, 0.12, 0.02, 0.12, STEEL);
  }

  // Newels at each end, a little heavier, with a cap.
  for (const t of [0.1, run - 0.1]) {
    const x = xAt(f, t);
    const bottom = treadTop(f, t);
    const top = lineY(f, t) + 0.98;

    p.box(x, bottom, zOpen, 0.09, top - bottom, 0.09, STEEL);
    p.box(x, top, zOpen, 0.12, 0.03, 0.12, CHARCOAL);
  }

  // A toe strip along the open edge, stepping with the treads (a slope of thin plate).
  slope(
    p,
    xAt(f, 0.05),
    lineY(f, 0.05) + 0.05,
    xAt(f, run - 0.05),
    lineY(f, run - 0.05) + 0.05,
    f.open + 0.015,
    0.1,
    GUNMETAL,
  );

  // ------------------- the wall handrail, bracketed (kept inside the stair width)
  const zWall = wallFace + inward * 0.09;

  slope(
    p,
    xAt(f, 0.2),
    lineY(f, 0.2) + 0.9,
    xAt(f, run - 0.2),
    lineY(f, run - 0.2) + 0.9,
    zWall,
    0.045,
    STEEL_BARE,
  );

  for (let k = 0; k < 5; k++) {
    const t = 0.7 + k * ((run - 1.4) / 4);

    p.box(
      xAt(f, t),
      lineY(f, t) + 0.86,
      wallFace + inward * 0.045,
      0.04,
      0.05,
      0.09,
      CHARCOAL,
    );
  }

  // ------------------------ a sloped conduit up the wall with clamps and a box
  const zCon = wallFace + inward * 0.05;

  slope(
    p,
    xAt(f, 0.4),
    lineY(f, 0.4) + 2.05,
    xAt(f, run - 0.4),
    lineY(f, run - 0.4) + 2.05,
    zCon,
    0.05,
    STEEL,
  );

  for (let k = 0; k < 6; k++) {
    const t = 0.5 + k * ((run - 1.0) / 5);

    p.box(
      xAt(f, t),
      lineY(f, t) + 2.02,
      wallFace + inward * 0.03,
      0.06,
      0.08,
      0.04,
      CHARCOAL,
    );
  }

  // The junction box in the middle, with a warning plate, and a drop from it.
  {
    const t = run * 0.5;
    const x = xAt(f, t);
    const y = lineY(f, t) + 2.05;

    p.box(x, y - 0.14, wallFace + inward * 0.06, 0.26, 0.28, 0.12, GUNMETAL);
    p.box(x, y - 0.12, wallFace + inward * 0.125, 0.2, 0.2, 0.01, STEEL);
    p.box(x, y - 0.08, wallFace + inward * 0.135, 0.1, 0.06, 0.004, HAZARD);
    p.post(x, y - 0.14 - 0.55, wallFace + inward * 0.04, 0.55, 0.035, STEEL);
  }

  // A dead caged bulkhead lamp near the foot, an alarm bell near the top.
  {
    const t = 1.6;
    const x = xAt(f, t);
    const y = lineY(f, t) + 1.55;

    p.box(x, y, wallFace + inward * 0.05, 0.22, 0.2, 0.1, GUNMETAL);
    p.post(x, y + 0.02, wallFace + inward * 0.17, 0.16, 0.2, 0x2a2e34);

    for (const dx of [-0.07, 0, 0.07]) {
      p.box(
        x + dx,
        y + 0.0,
        wallFace + inward * 0.2,
        0.012,
        0.22,
        0.012,
        STEEL,
      );
    }

    const bt = run - 1.8;
    const bx = xAt(f, bt);
    const by = lineY(f, bt) + 1.7;

    p.box(bx, by, wallFace + inward * 0.04, 0.18, 0.22, 0.08, 0x8a2a24);
    p.post(bx, by + 0.03, wallFace + inward * 0.12, 0.16, 0.16, STEEL_BARE);
    p.box(bx, by + 0.17, wallFace + inward * 0.04, 0.04, 0.03, 0.1, BLACK);
    p.box(bx, by - 0.03, wallFace + inward * 0.082, 0.06, 0.02, 0.004, LED_RED);
  }

  // -------------- the signs: a direction plate at the foot, a level plate at the top
  {
    const t = 0.7;
    const x = xAt(f, t);
    const y = lineY(f, t) + 2.7;

    p.box(x, y, wallFace + inward * 0.012, 0.7, 0.3, 0.012, HAZARD);
    p.box(x, y + 0.02, wallFace + inward * 0.022, 0.54, 0.05, 0.006, BLACK);
    // An arrow climbing the flight.
    const ax = xAt(f, t + 0.04);

    p.box(
      ax,
      y + 0.1,
      wallFace + inward * 0.022,
      0.3,
      0.04,
      0.006,
      BLACK,
      0,
      0.5 * f.sign,
    );
    p.box(
      xAt(f, t + 0.2),
      y + 0.15,
      wallFace + inward * 0.022,
      0.1,
      0.04,
      0.006,
      BLACK,
      0,
      1.1 * f.sign,
    );

    const topT = run - 0.9;

    plate(
      p,
      xAt(f, topT),
      lineY(f, topT) + 2.55,
      wallFace + inward * 0.01,
      0.4,
      0.4,
      "z",
      inward as 1 | -1,
      0x3c5a78,
    );
    plate(
      p,
      xAt(f, topT),
      lineY(f, topT) + 2.2,
      wallFace + inward * 0.01,
      0.4,
      0.12,
      "z",
      inward as 1 | -1,
      LABEL,
    );
  }

  // ------------------------- debris on a few treads and on the landing
  for (let k = 0; k < 9; k++) {
    const step = Math.floor(random() * f.steps);
    const t = (step + 0.2 + random() * 0.6) * f.tread;
    const x = xAt(f, t);
    const y = treadTop(f, t);
    const z = f.open + 0.3 + random() * (f.wall - f.open - 0.7);
    const kind = Math.floor(random() * 3);

    if (kind === 0) {
      p.chunk(x, y, z, 0.05 + random() * 0.06, 0x6a6458, k);
    } else if (kind === 1) {
      p.box(x, y, z, 0.12, 0.004, 0.09, 0xa8a48e, random() * 3);
    } else {
      p.post(x, y, z, 0.05, 0.03, 0x8a3a30);
    }
  }

  // A lamp-fixture bracket's worth of cable looping down the wall near the foot, and a drip stain.
  p.cableUp(
    xAt(f, 2.6),
    lineY(f, 2.6) + 0.9,
    wallFace + inward * 0.03,
    1.1,
    0.025,
    0x1b1d21,
  );
  p.box(
    xAt(f, run * 0.65),
    lineY(f, run * 0.65) + 0.6,
    wallFace + inward * 0.006,
    0.5,
    1.2,
    0.004,
    0x2a2e34,
  );

  // ------------------ the open side of the solid flight: what holds it up
  // The steps are solid from the floor, so the side is one large stepped face.
  // Break it into structure: a narrow concrete kerb along the floor with a dark
  // seam above it, a pilaster rib every 1.4 m standing on a footing plate, and a
  // steel stringer under the nosing line. (Drawn only, a few cm proud of the
  // face: collision and the clear width are untouched.)
  {
    const out = f.open < f.wall ? -1 : 1;
    const zFace = f.open + out * 0.03;
    const KERB = 0x4a4d52;
    const RIB = 0x3a3d42;

    p.box(
      (xAt(f, 0) + xAt(f, run)) / 2,
      0,
      f.open + out * 0.025,
      run,
      0.1,
      0.05,
      KERB,
    );
    p.box(
      (xAt(f, 0) + xAt(f, run)) / 2,
      0.1,
      f.open + out * 0.012,
      run,
      0.015,
      0.024,
      BLACK,
    );

    const ribs = Math.max(2, Math.round(run / 1.4));

    for (let k = 0; k <= ribs; k++) {
      const t = 0.12 + (k * (run - 0.24)) / ribs;
      const x = xAt(f, t);
      const top = treadTop(f, t) - 0.16;

      if (top > 0.3) {
        p.box(x, 0.1, zFace, 0.16, top - 0.1, 0.06, RIB);
        p.box(x, 0, zFace, 0.3, 0.06, 0.1, STEEL);
      }
    }

    slope(
      p,
      xAt(f, 0.05),
      lineY(f, 0.05) - 0.14,
      xAt(f, run - 0.05),
      lineY(f, run - 0.05) - 0.14,
      f.open + out * 0.05,
      0.12,
      GUNMETAL,
    );
  }

  map.createFitting(`fittings-${stairs.id}-dressing`, 0, p.elements, []);

  // The handrail is solid on the open edge: one block per step, standing on
  // its tread and 1.1 m high, so nobody walks or falls off the side. (The
  // wall side is the wall.)
  map.createFitting(
    `rail-${stairs.id}`,
    0,
    [],
    stairsToSteps(stairs).map((step) => ({
      minX: step.minX,
      maxX: step.maxX,
      minZ: stairs.crossMin,
      maxZ: stairs.crossMin + 0.08,
      bottom: step.height,
      top: step.height + 1.1,
    })),
  );
}

/** A plate over a door on its outside face, if that face is open to a walkway or yard. */
function doorPlates(map: MapBuilder, floorY: number): void {
  const p = new Pieces();
  const colors: Record<string, number> = {
    "room-server": 0x3f5a4a,
    "room-armory": 0x9a5a2a,
    "room-barracks": 0x3c5a78,
    "room-archive": 0x7a6a4a,
    "room-break": 0x4a6a6a,
    "room-warehouse": 0x9a8836,
  };
  const rooms = map.build().rooms;

  for (const room of rooms) {
    const color = colors[room.id];

    if (color === undefined) continue;

    for (const door of room.doors) {
      const half = door.width / 2;
      let x = door.at;
      let z = door.at;
      let nx = 0;
      let nz = 0;

      if (door.side === "n") {
        z = room.minZ;
        nz = -1;
      } else if (door.side === "s") {
        z = room.maxZ;
        nz = 1;
      } else if (door.side === "w") {
        x = room.minX;
        nx = -1;
      } else {
        x = room.maxX;
        nx = 1;
      }

      // The point just outside: it must not be inside another room.
      const ox = x + nx * 0.6;
      const oz = z + nz * 0.6;
      const inside = rooms.some(
        (r) =>
          r !== room &&
          ox > r.minX &&
          ox < r.maxX &&
          oz > r.minZ &&
          oz < r.maxZ,
      );

      if (inside) continue;

      // The plate: coloured, with a small dark mark and a status light, over the lintel.
      const along = nx !== 0 ? "x" : "z";
      const y = 2.78;
      const px = nx !== 0 ? x + nx * 0.006 : x;
      const pz = nz !== 0 ? z + nz * 0.006 : z;

      if (along === "z") {
        p.box(px, y, pz, 0.6, 0.2, 0.012, color);
        p.box(px - 0.16, y + 0.07, pz + nz * 0.008, 0.2, 0.05, 0.004, LABEL);
        p.box(
          px + 0.2,
          y + 0.06,
          pz + nz * 0.008,
          0.03,
          0.03,
          0.004,
          LED_AMBER,
        );
      } else {
        p.box(px, y, pz, 0.012, 0.2, 0.6, color);
        p.box(px + nx * 0.008, y + 0.07, pz - 0.16, 0.004, 0.05, 0.2, LABEL);
        p.box(
          px + nx * 0.008,
          y + 0.06,
          pz + 0.2,
          0.004,
          0.03,
          0.03,
          LED_AMBER,
        );
      }

      // A heavy steel frame round the doorway, thin and flush with the wall's face.
      if (along === "z") {
        for (const s of [-1, 1]) {
          p.box(
            x + s * (half + 0.04),
            0,
            z + nz * 0.008,
            0.08,
            2.6,
            0.012,
            CHARCOAL,
          );
        }

        p.box(x, 2.6, z + nz * 0.008, door.width + 0.16, 0.08, 0.012, CHARCOAL);
      } else {
        for (const s of [-1, 1]) {
          p.box(
            x + nx * 0.008,
            0,
            z + s * (half + 0.04),
            0.012,
            2.6,
            0.08,
            CHARCOAL,
          );
        }

        p.box(x + nx * 0.008, 2.6, z, 0.012, 0.08, door.width + 0.16, CHARCOAL);
      }
    }
  }

  map.createFitting("fittings-door-plates", floorY, p.elements, []);
}

export function furnishStairDetails(map: MapBuilder, floorY: number): void {
  const random = rng(1301);

  for (const stairs of map.getStairs()) {
    stairDressing(map, stairs, random);
  }

  doorPlates(map, floorY);
}
