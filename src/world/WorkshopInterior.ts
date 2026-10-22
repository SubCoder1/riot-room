import { Pieces, rng } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import { furnishWorkshopPipes } from "./WorkshopPipes";

/**
 * The Workshop: a heavy industrial repair and maintenance bay. The focal point
 * is the tool wall over the main bench (a shadow board of large, readable
 * tools under a yellow-and-charcoal safety header and a task light); around it
 * are the bench with a vise and repair parts, a toolbox chest, a steel cabinet,
 * a curated parts rack, a work trolley, a machining station with a drill press
 * and a hydraulic press (these two replace the old plain grey boxes, on the
 * same footprints), a pipe rack and a corner of timber and cement bags.
 *
 * Everything is drawn from boxes (painted steel, timber, bins) and pipes (bare
 * steel), merged into a few meshes with the colours in the vertices. Only the
 * big things stop a body (one hidden box each, the same as before for the two
 * machines); tools and parts are drawn only. Two point lights (a cool task
 * light over the bench and a pendant over the machines) light the work areas.
 *
 * Room: x 6.3 to 18, z 15.3 to 23.7 on the upper floor. Doors: north at
 * x = 11.5, west at z = 21, and the Warehouse's opening at x = 18, z = 19.5.
 */

// Painted steel is charcoal and blue-grey; bare steel is lighter and metallic.
const CHARCOAL = 0x353b46;
const STEEL = 0x4f5f74;
const STEEL_LIGHT = 0x66768c;
const STEEL_BARE = 0x8791a0;
const BLACK = 0x14161a;
const TIMBER = 0x7a5c3c;
const TIMBER_DARK = 0x5a4430;
/** A muted blue-grey accent (yellow is kept for interactive objects). */
const ACCENT = 0x5a667a;
const CARDBOARD = 0x7c694a;
const GREY_BIN = 0x606873;
const RUST = 0x7a5b44;
const OIL = 0x1e2024;

export function furnishWorkshop(map: MapBuilder, floorY: number): void {
  const F = floorY;
  const WEST = 6.3;
  const NORTH = 15.3;
  const SOUTH = 23.7;

  // The two plain grey blocks are replaced, on the same footprints, by the
  // machines below.
  map.removeSolid("machine-ws-1");
  map.removeSolid("press-ws-2");

  // ============================================================ workbench
  const benchX0 = 13.4;
  const benchX1 = 17.0;
  const benchCx = (benchX0 + benchX1) / 2;
  const benchZ1 = NORTH + 0.9;

  {
    const p = new Pieces();
    const length = benchX1 - benchX0;
    const top = 0.9;
    const thick = 0.12;

    // A heavy worktop: three boards, worn, a little different in tone, laid
    // on a charcoal steel apron that runs all round.
    p.box(benchCx, top - thick, NORTH + 0.16, length, thick, 0.3, 0x7a5c3c);
    p.box(benchCx, top - thick, NORTH + 0.46, length, thick, 0.3, 0x6d5236);
    p.box(benchCx, top - thick, NORTH + 0.75, length, thick, 0.3, 0x805f3d);
    // Worn corners and dents: darker patches at the front edge.
    p.box(
      benchX0 + 0.12,
      top - 0.005,
      benchZ1 - 0.08,
      0.2,
      0.012,
      0.14,
      TIMBER_DARK,
    );
    p.box(
      benchX1 - 0.4,
      top - 0.005,
      benchZ1 - 0.12,
      0.3,
      0.012,
      0.16,
      TIMBER_DARK,
    );
    p.box(
      benchCx,
      top - thick - 0.13,
      benchZ1 - 0.04,
      length - 0.04,
      0.13,
      0.05,
      CHARCOAL,
    );
    p.box(
      benchCx,
      top - thick - 0.13,
      NORTH + 0.04,
      length - 0.04,
      0.13,
      0.05,
      CHARCOAL,
    );
    for (const ex of [benchX0 + 0.03, benchX1 - 0.03]) {
      p.box(ex, top - thick - 0.13, NORTH + 0.45, 0.05, 0.13, 0.86, CHARCOAL);
    }

    // Legs: square steel tube with base plates and gusset plates at the top.
    const legX = [benchX0 + 0.14, benchCx, benchX1 - 0.14];

    for (const lx of legX) {
      for (const lz of [NORTH + 0.16, benchZ1 - 0.16]) {
        p.box(lx, 0, lz, 0.1, top - thick - 0.13, 0.1, STEEL);
        p.box(lx, 0, lz, 0.18, 0.025, 0.18, CHARCOAL);
        p.box(lx, top - thick - 0.2, lz, 0.17, 0.07, 0.17, CHARCOAL);
        p.chunk(lx + 0.06, 0.02, lz + 0.06, 0.03, STEEL_BARE);
        p.chunk(lx - 0.06, 0.02, lz - 0.06, 0.03, STEEL_BARE);
      }
    }

    // Cross-bracing: stretchers front and back at 0.32 m, ties across each
    // frame, and a diagonal flat bar in each bay of the front and the back.
    for (const lz of [NORTH + 0.16, benchZ1 - 0.16]) {
      p.box(benchCx, 0.3, lz, length - 0.3, 0.05, 0.05, STEEL);

      for (const bay of [0, 1]) {
        const x0 = legX[bay] + 0.06;
        const x1 = legX[bay + 1] - 0.06;
        const rise = top - thick - 0.2 - 0.36;
        const run = x1 - x0;
        const len = Math.hypot(run, rise);

        p.box(
          (x0 + x1) / 2,
          0.36 + rise / 2 - 0.02,
          lz,
          len,
          0.04,
          0.025,
          CHARCOAL,
          0,
          Math.atan2(rise, run) * (bay === 0 ? 1 : -1),
        );
      }
    }

    for (const lx of legX) {
      p.box(lx, 0.3, (NORTH + benchZ1) / 2, 0.05, 0.05, 0.56, STEEL);
    }

    // A steel under-shelf with a raised lip.
    const shelfY = 0.2;
    const midZ = (NORTH + benchZ1) / 2;

    p.box(benchCx, shelfY, midZ, length - 0.3, 0.03, 0.56, CHARCOAL);
    p.box(benchCx, shelfY, benchZ1 - 0.12, length - 0.3, 0.07, 0.025, CHARCOAL);
    // On it: a grey parts case, a tin and a coil of hose.
    p.box(benchCx - 0.95, shelfY + 0.03, midZ, 0.5, 0.2, 0.34, GREY_BIN);
    p.box(benchCx - 0.95, shelfY + 0.23, midZ, 0.52, 0.03, 0.36, CHARCOAL);
    p.post(benchCx + 0.3, shelfY + 0.03, midZ + 0.02, 0.26, 0.2, STEEL_LIGHT);
    p.post(benchCx + 0.3, shelfY + 0.29, midZ + 0.02, 0.03, 0.2, STEEL_BARE);
    p.bar(benchCx + 0.85, shelfY + 0.15, midZ, 0.14, 0.26, OIL, Math.PI / 2);

    // --- On the bench, west to east: vise, bracket and fitting, tools, housing.
    const t = top;
    const fz = benchZ1 - 0.2;

    // Bench vise at the west end, front edge: a base plate, a cast body, two
    // jaws, a screw bar out of the front with a cross handle.
    const vx = benchX0 + 0.42;

    p.box(vx, t, fz, 0.36, 0.035, 0.3, CHARCOAL);
    p.box(vx, t + 0.035, fz - 0.02, 0.28, 0.17, 0.2, STEEL);
    p.box(vx, t + 0.17, fz + 0.1, 0.3, 0.07, 0.07, STEEL_BARE);
    p.box(vx, t + 0.035, fz + 0.2, 0.24, 0.11, 0.06, CHARCOAL);
    p.alongZ(vx, t + 0.09, fz + 0.1, fz + 0.4, 0.035, STEEL_BARE);
    p.alongX(vx - 0.12, vx + 0.12, t + 0.09, fz + 0.4, 0.025, STEEL_BARE);
    p.chunk(vx - 0.13, t + 0.06, fz + 0.4, 0.045, ACCENT);
    p.chunk(vx + 0.13, t + 0.06, fz + 0.4, 0.045, ACCENT);

    // A metal bracket (an L) and a pipe fitting with a flange (a T).
    const bx = benchX0 + 1.0;

    p.box(bx, t, fz - 0.15, 0.3, 0.035, 0.18, STEEL_BARE, 0.3);
    p.box(bx - 0.05, t + 0.035, fz - 0.19, 0.3, 0.2, 0.035, STEEL_BARE, 0.3);
    p.chunk(bx + 0.1, t + 0.035, fz - 0.14, 0.035, BLACK);
    const fx = benchX0 + 1.5;

    p.alongX(fx - 0.14, fx + 0.14, t + 0.07, fz - 0.1, 0.1, STEEL_LIGHT);
    p.post(fx, t, fz - 0.1, 0.22, 0.1, STEEL_LIGHT);
    p.post(fx - 0.14, t, fz - 0.1, 0.14, 0.17, STEEL_BARE);
    p.post(fx + 0.14, t, fz - 0.1, 0.14, 0.17, STEEL_BARE);

    // Tools laid out for the job: a hammer, an adjustable wrench, pliers, a
    // screwdriver and a tape measure, each large enough to read.
    const hx = benchX0 + 1.95;

    p.box(hx, t, fz + 0.0, 0.46, 0.045, 0.05, TIMBER, 0.25);
    p.box(hx + 0.22, t, fz - 0.07, 0.15, 0.075, 0.07, CHARCOAL, 0.25);
    p.box(hx + 0.55, t, fz - 0.14, 0.46, 0.04, 0.055, STEEL_BARE, -0.12);
    p.box(hx + 0.8, t, fz - 0.16, 0.12, 0.055, 0.1, STEEL_BARE, -0.12);
    p.box(hx + 0.4, t, fz + 0.12, 0.34, 0.025, 0.045, STEEL_BARE, 0.18);
    p.box(hx + 0.4, t + 0.025, fz + 0.14, 0.34, 0.02, 0.045, STEEL_BARE, -0.06);
    p.box(hx + 0.54, t, fz + 0.1, 0.16, 0.04, 0.06, ACCENT, 0.06);
    p.alongX(hx + 0.95, hx + 1.12, t + 0.025, fz + 0.12, 0.05, ACCENT);
    p.alongX(hx + 0.65, hx + 0.95, t + 0.012, fz + 0.12, 0.018, STEEL_BARE);
    p.box(hx + 1.15, t, fz - 0.12, 0.11, 0.07, 0.11, ACCENT, 0.3);

    // A mechanical housing (a gearbox) with bolts and a shaft stub, at the east.
    const gx = benchX1 - 0.4;

    p.box(gx, t, fz - 0.1, 0.34, 0.2, 0.26, CHARCOAL);
    p.box(gx, t + 0.2, fz - 0.1, 0.38, 0.03, 0.3, STEEL);
    p.alongZ(gx - 0.08, t + 0.1, fz - 0.23, fz - 0.4, 0.07, STEEL_BARE);
    p.chunk(gx + 0.13, t + 0.23, fz - 0.02, 0.04, STEEL_BARE);
    p.chunk(gx - 0.13, t + 0.23, fz - 0.18, 0.04, STEEL_BARE);
    p.chunk(gx + 0.13, t + 0.23, fz - 0.18, 0.04, STEEL_BARE);
    p.box(gx + 0.27, t, fz + 0.03, 0.14, 0.012, 0.12, OIL, 0.4);

    map.createFitting("fittings-workbench", F, p.elements, [
      {
        minX: benchX0,
        maxX: benchX1,
        minZ: NORTH,
        maxZ: benchZ1,
        top: top + 0.02,
      },
    ]);
  }

  // ===================================================== tool wall (focal)
  {
    const p = new Pieces();
    const wallZ = NORTH + 0.02;
    const boardX0 = benchX0 + 0.05;
    const boardX1 = benchX1 - 0.05;
    const boardCx = (boardX0 + boardX1) / 2;
    const boardW = boardX1 - boardX0;
    const y0 = 1.22;
    const y1 = 2.18;

    // The board: charcoal blue panel in a steel frame, yellow along its foot.
    p.box(boardCx, y0, wallZ, boardW, y1 - y0, 0.04, 0x434d5c);
    p.box(boardCx, y0 - 0.04, wallZ + 0.01, boardW + 0.06, 0.05, 0.06, ACCENT);
    p.box(boardCx, y1, wallZ + 0.01, boardW + 0.06, 0.04, 0.06, CHARCOAL);
    for (const ex of [boardX0 - 0.02, boardX1 + 0.02]) {
      p.box(ex, y0 - 0.04, wallZ + 0.01, 0.05, y1 - y0 + 0.08, 0.06, CHARCOAL);
    }

    // A header of yellow and charcoal safety stripes above the board.
    const stripes = 17;
    const stripeW = boardW / stripes;

    for (let i = 0; i < stripes; i++) {
      p.box(
        boardX0 + stripeW * (i + 0.5),
        y1 + 0.07,
        wallZ + 0.005,
        stripeW * 0.98,
        0.12,
        0.035,
        i % 2 === 0 ? ACCENT : CHARCOAL,
      );
    }

    // A narrow tray along the foot for small parts, with a few bolts in it.
    p.box(boardCx, y0 + 0.02, wallZ + 0.1, boardW - 0.1, 0.035, 0.14, CHARCOAL);
    p.box(
      boardCx,
      y0 + 0.05,
      wallZ + 0.165,
      boardW - 0.1,
      0.05,
      0.02,
      CHARCOAL,
    );
    p.chunk(boardX0 + 0.9, y0 + 0.055, wallZ + 0.1, 0.04, STEEL_BARE);
    p.chunk(boardX0 + 0.98, y0 + 0.055, wallZ + 0.12, 0.035, RUST, 1);
    p.chunk(boardX0 + 2.1, y0 + 0.055, wallZ + 0.1, 0.04, STEEL_BARE, 2);

    // Each tool hangs on two hooks over a dark outline, so its silhouette
    // reads at a distance.
    const outline = (cx: number, cy: number, w: number, h: number): void => {
      p.box(cx, cy - h / 2, wallZ + 0.025, w + 0.05, h + 0.05, 0.012, BLACK);
    };
    const hooks = (cx: number, top: number, spread: number): void => {
      for (const s of [-1, 1]) {
        p.alongZ(
          cx + s * spread,
          top,
          wallZ + 0.02,
          wallZ + 0.1,
          0.02,
          STEEL_BARE,
        );
      }
    };
    const zt = wallZ + 0.045;
    const mid = y0 + 0.5;
    let x = boardX0 + 0.28;

    // Hammer, hung head up: a long handle and a heavy head.
    outline(x, mid + 0.4, 0.18, 0.78);
    p.box(x, mid + 0.0, zt, 0.05, 0.62, 0.03, TIMBER);
    p.box(x + 0.02, mid + 0.6, zt, 0.19, 0.1, 0.045, CHARCOAL);
    p.box(x - 0.1, mid + 0.58, zt, 0.06, 0.14, 0.045, STEEL_BARE);
    hooks(x, mid + 0.55, 0.06);
    x += 0.45;

    // A big adjustable wrench: a long shank and an open jaw.
    outline(x, mid + 0.42, 0.2, 0.84);
    p.box(x, mid + 0.0, zt, 0.065, 0.66, 0.03, STEEL_BARE);
    p.box(x - 0.045, mid + 0.62, zt, 0.07, 0.2, 0.03, STEEL_BARE);
    p.box(x + 0.055, mid + 0.58, zt, 0.07, 0.13, 0.03, STEEL_BARE);
    p.chunk(x, mid + 0.04, zt + 0.02, 0.05, ACCENT);
    hooks(x, mid + 0.5, 0.05);
    x += 0.5;

    // A hand saw: a wide blade, a toothed edge and a timber grip.
    outline(x + 0.05, mid + 0.3, 0.4, 0.72);
    p.box(x, mid + 0.05, zt, 0.26, 0.5, 0.02, STEEL_LIGHT);
    p.box(x - 0.115, mid + 0.05, zt + 0.012, 0.03, 0.5, 0.02, CHARCOAL);
    p.box(x + 0.13, mid + 0.05, zt, 0.04, 0.5, 0.02, STEEL_BARE);
    p.box(x + 0.08, mid + 0.5, zt, 0.17, 0.2, 0.04, TIMBER_DARK);
    hooks(x, mid + 0.4, 0.07);
    x += 0.52;

    // Pliers: crossed arms with yellow grips.
    outline(x, mid + 0.3, 0.2, 0.62);
    p.box(x - 0.03, mid + 0.0, zt, 0.04, 0.5, 0.03, STEEL_BARE, 0, -0.12);
    p.box(
      x + 0.03,
      mid + 0.0,
      zt + 0.012,
      0.04,
      0.5,
      0.03,
      STEEL_BARE,
      0,
      0.12,
    );
    p.box(x - 0.05, mid + 0.0, zt, 0.055, 0.2, 0.04, ACCENT, 0, -0.12);
    p.box(x + 0.05, mid + 0.0, zt + 0.012, 0.055, 0.2, 0.04, ACCENT, 0, 0.12);
    hooks(x, mid + 0.42, 0.05);
    x += 0.4;

    // Three screwdrivers of different length on one rail.
    for (const [len, handle] of [
      [0.58, ACCENT],
      [0.46, CHARCOAL],
      [0.36, ACCENT],
    ] as const) {
      outline(x, mid + len - 0.12, 0.1, len + 0.12);
      p.box(x, mid + 0.0, zt, 0.065, 0.2, 0.05, handle);
      p.box(x, mid + 0.2, zt, 0.02, len - 0.2, 0.02, STEEL_BARE);
      hooks(x, mid + len - 0.1, 0.03);
      x += 0.19;
    }

    // A tape measure on a single hook.
    x += 0.15;
    outline(x, mid + 0.18, 0.28, 0.4);
    p.box(x, mid + 0.0, zt, 0.2, 0.2, 0.06, ACCENT);
    p.box(x, mid + 0.02, zt + 0.032, 0.12, 0.12, 0.01, CHARCOAL);
    p.box(x, mid + 0.2, zt, 0.05, 0.08, 0.03, STEEL_BARE);
    hooks(x, mid + 0.26, 0.0);

    // The task light: a wall arm and a deep hood over the bench.
    const lampX = benchCx - 0.3;
    const lampY = 2.62;

    p.alongZ(lampX, lampY, NORTH + 0.02, NORTH + 0.62, 0.045, CHARCOAL);
    p.post(lampX, lampY - 0.04, NORTH + 0.62, 0.07, 0.05, CHARCOAL);
    p.post(lampX, lampY - 0.3, NORTH + 0.62, 0.26, 0.36, CHARCOAL);
    p.post(lampX, lampY - 0.34, NORTH + 0.62, 0.04, 0.3, 0xdfe6ea);

    map.createFitting("fittings-toolwall", F, p.elements, []);
  }

  // ========================================================= toolbox chest
  {
    const p = new Pieces();
    const x0 = benchX1;
    const x1 = benchX1 + 0.62;
    const z0 = NORTH;
    const z1 = NORTH + 0.56;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;

    // A tall roller chest: four drawers with yellow pulls and a hinged lid.
    p.box(cx, 0.08, cz, x1 - x0, 0.72, z1 - z0, STEEL);
    p.box(cx, 0.0, cz, x1 - x0 - 0.04, 0.08, z1 - z0 - 0.04, CHARCOAL);
    p.box(cx, 0.8, cz, x1 - x0 + 0.02, 0.06, z1 - z0 + 0.02, CHARCOAL);
    p.box(cx, 0.86, z0 + 0.05, x1 - x0 - 0.05, 0.1, 0.08, CHARCOAL);

    for (let i = 0; i < 4; i++) {
      const y = 0.14 + i * 0.165;

      p.box(
        cx,
        y,
        z1 + 0.005,
        x1 - x0 - 0.06,
        0.145,
        0.02,
        i % 2 === 0 ? STEEL_LIGHT : STEEL,
      );
      p.alongX(cx - 0.17, cx + 0.17, y + 0.1, z1 + 0.035, 0.025, ACCENT);
    }

    for (const wx of [x0 + 0.06, x1 - 0.06]) {
      p.alongX(wx - 0.02, wx + 0.02, 0.05, z1 - 0.06, 0.1, BLACK);
      p.alongX(wx - 0.02, wx + 0.02, 0.05, z0 + 0.06, 0.1, BLACK);
    }

    map.createFitting("fittings-chest", F, p.elements, [
      { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: 0.95 },
    ]);
  }

  // =============================================================== cabinet
  {
    const p = new Pieces();
    const w = 1.2;
    const d = 0.7;
    const h = 1.95;
    const cx = WEST + w / 2;
    const cz = NORTH + d / 2;
    const face = NORTH + d;

    p.box(cx, 0.06, cz, w, h - 0.06, d, STEEL);
    p.box(cx, 0, cz, w + 0.03, 0.08, d + 0.03, CHARCOAL);
    p.box(cx, h, cz, w + 0.05, 0.05, d + 0.05, CHARCOAL);

    // Two doors set in a frame, with a clear seam between them.
    for (const side of [-1, 1]) {
      p.box(
        cx + side * 0.29,
        0.14,
        face + 0.008,
        0.54,
        h - 0.2,
        0.02,
        STEEL_LIGHT,
      );
      p.box(cx + side * 0.29, 0.2, face + 0.02, 0.44, h - 0.32, 0.008, STEEL);

      // Three hinges on the outer edge.
      for (const y of [0.3, 1.0, 1.65]) {
        p.box(cx + side * 0.57, y, face + 0.02, 0.04, 0.12, 0.03, BLACK);
      }
    }

    p.box(cx, 0.14, face + 0.012, 0.02, h - 0.2, 0.022, BLACK);

    // Tall yellow handles by the seam and a lock plate.
    for (const side of [-1, 1]) {
      p.box(cx + side * 0.07, 0.85, face + 0.04, 0.035, 0.34, 0.03, ACCENT);
    }

    p.box(cx, 0.95, face + 0.03, 0.09, 0.1, 0.02, STEEL_BARE);

    // A louvred vent near the top, and a warning label (yellow with a dark mark).
    for (let i = 0; i < 4; i++) {
      p.box(cx - 0.28, 1.58 + i * 0.045, face + 0.032, 0.34, 0.02, 0.01, BLACK);
    }

    p.box(cx + 0.28, 1.5, face + 0.03, 0.16, 0.16, 0.01, ACCENT);
    p.box(cx + 0.28, 1.54, face + 0.038, 0.04, 0.08, 0.006, BLACK);
    p.chunk(cx + 0.28, 1.5, face + 0.04, 0.025, BLACK);

    // Chipped paint and rust at the foot.
    p.box(cx - 0.45, 0.09, face + 0.03, 0.18, 0.08, 0.006, RUST);
    p.box(cx + 0.47, 0.12, face + 0.03, 0.1, 0.05, 0.006, RUST);

    map.createFitting("fittings-cabinet", F, p.elements, [
      { minX: WEST, maxX: WEST + w, minZ: NORTH, maxZ: NORTH + d, top: h },
    ]);
  }

  // ============================================ cabinets (east wall, south)
  // Two tall steel cabinets side by side against the Warehouse wall, just
  // beside the Warehouse opening, north of the pipe rack's corner, fronts to the west. One is a double-door
  // cabinet (a seam, handles, hinges, a louvred vent and a warning label),
  // the other a locker with three narrow doors and a number plate. The
  // Warehouse's opening (z 18.5 to 20.5) is left clear.
  {
    const p = new Pieces();
    const wall = 18.0;
    const depth = 0.7;
    const front = wall - depth;
    const cx = wall - depth / 2;
    const zA = 20.5;
    const widthA = 1.0;
    const zB = zA + widthA;
    const widthB = 1.0;
    const heightA = 1.85;
    const heightB = 1.75;

    // Cabinet A: two doors with a seam between them.
    const czA = zA + widthA / 2;

    p.box(cx, 0.06, czA, depth, heightA - 0.06, widthA, STEEL);
    p.box(cx, 0, czA, depth + 0.03, 0.08, widthA + 0.03, CHARCOAL);
    p.box(cx, heightA, czA, depth + 0.05, 0.05, widthA + 0.05, CHARCOAL);

    for (const side of [-1, 1]) {
      p.box(
        front - 0.008,
        0.14,
        czA + side * 0.24,
        0.02,
        heightA - 0.2,
        0.46,
        STEEL_LIGHT,
      );
      p.box(
        front - 0.02,
        0.2,
        czA + side * 0.24,
        0.008,
        heightA - 0.32,
        0.38,
        STEEL,
      );

      for (const y of [0.3, 1.0, 1.65]) {
        p.box(front - 0.02, y, czA + side * 0.47, 0.03, 0.12, 0.04, BLACK);
      }
    }

    p.box(front - 0.012, 0.14, czA, 0.022, heightA - 0.2, 0.02, BLACK);

    for (const side of [-1, 1]) {
      p.box(front - 0.04, 0.85, czA + side * 0.07, 0.03, 0.34, 0.035, ACCENT);
    }

    for (let i = 0; i < 4; i++) {
      p.box(front - 0.03, 1.55 + i * 0.045, czA, 0.01, 0.02, 0.4, BLACK);
    }

    p.box(front - 0.03, 1.15, czA + 0.25, 0.01, 0.16, 0.16, ACCENT);
    p.box(front - 0.038, 1.19, czA + 0.25, 0.006, 0.08, 0.04, BLACK);
    p.box(front - 0.03, 0.12, czA - 0.3, 0.006, 0.07, 0.16, RUST);

    // Cabinet B: a locker, three narrow doors each with a vent slot, a pull
    // and a number plate.
    const czB = zB + widthB / 2;

    p.box(cx, 0.06, czB, depth, heightB - 0.06, widthB, 0x4a586b);
    p.box(cx, 0, czB, depth + 0.03, 0.08, widthB + 0.03, CHARCOAL);
    p.box(cx, heightB, czB, depth + 0.05, 0.05, widthB + 0.05, CHARCOAL);

    for (let i = 0; i < 3; i++) {
      const dz = czB + (i - 1) * 0.32;

      p.box(front - 0.008, 0.14, dz, 0.02, heightB - 0.2, 0.3, 0x5a6a7f);
      p.box(front - 0.03, heightB - 0.5, dz, 0.01, 0.025, 0.18, BLACK);
      p.box(front - 0.03, heightB - 0.56, dz, 0.01, 0.025, 0.18, BLACK);
      p.box(front - 0.035, 0.9, dz + 0.1, 0.03, 0.14, 0.03, STEEL_BARE);
      p.box(front - 0.03, heightB - 0.3, dz, 0.01, 0.08, 0.1, 0xc9c6b4);
    }

    // A tag and a bit of wear on the locker.
    p.box(front - 0.03, 0.18, czB + 0.3, 0.006, 0.12, 0.1, RUST);

    map.createFitting("fittings-cabinets-east", F, p.elements, [
      { minX: front, maxX: wall, minZ: zA, maxZ: zA + widthA, top: heightA },
      { minX: front, maxX: wall, minZ: zB, maxZ: zB + widthB, top: heightB },
    ]);
  }

  // ===================================================== parts rack (west)
  {
    const p = new Pieces();
    const x0 = WEST;
    const x1 = WEST + 0.6;
    const z0 = NORTH + 0.7;
    const z1 = z0 + 2.7;
    const cx = (x0 + x1) / 2;
    const levels = [0.14, 0.62, 1.1, 1.58];
    const top = 1.96;

    // Heavy uprights with foot plates, a top rail and shelves with a lip.
    for (const px of [x0 + 0.05, x1 - 0.05]) {
      for (const pz of [z0 + 0.05, (z0 + z1) / 2, z1 - 0.05]) {
        p.box(px, 0, pz, 0.07, top, 0.07, CHARCOAL);
        p.box(px, 0, pz, 0.14, 0.02, 0.14, CHARCOAL);
      }
    }

    p.box(cx, top - 0.04, (z0 + z1) / 2, 0.64, 0.05, z1 - z0 + 0.04, CHARCOAL);

    for (const y of levels) {
      p.box(cx, y, (z0 + z1) / 2, 0.58, 0.04, z1 - z0 - 0.06, STEEL);
      p.box(
        x1 - 0.03,
        y + 0.04,
        (z0 + z1) / 2,
        0.03,
        0.05,
        z1 - z0 - 0.06,
        CHARCOAL,
      );
      // Yellow end caps on the front of each shelf.
      p.box(x1 - 0.01, y, z0 + 0.03, 0.03, 0.05, 0.08, ACCENT);
      p.box(x1 - 0.01, y, z1 - 0.03, 0.03, 0.05, 0.08, ACCENT);
    }

    const sx = cx;
    const base = (level: number): number => levels[level] + 0.04;
    // An open parts tray: a box with a dark mouth and a pale label strip.
    const tray = (
      level: number,
      z: number,
      w: number,
      h: number,
      d: number,
      color: number,
    ): void => {
      p.box(sx, base(level), z + d / 2, w, h, d, color);
      p.box(
        sx,
        base(level) + h - 0.005,
        z + d / 2,
        w - 0.06,
        0.012,
        d - 0.06,
        BLACK,
      );
      p.box(
        x1 - 0.045,
        base(level) + h * 0.35,
        z + d / 2,
        0.01,
        0.045,
        d * 0.6,
        0xaab0b6,
      );
    };
    const zA = z0 + 0.1;

    // Level 0: an oil drum, a big bin, a taped cardboard box.
    p.post(sx, base(0), zA + 0.28, 0.46, 0.38, 0x3c5365);
    p.post(sx, base(0) + 0.2, zA + 0.28, 0.04, 0.39, ACCENT);
    tray(0, zA + 0.7, 0.46, 0.3, 0.6, GREY_BIN);
    p.box(sx, base(0), zA + 1.45, 0.42, 0.34, 0.5, CARDBOARD, 0.04);
    p.box(sx, base(0) + 0.34, zA + 1.45, 0.08, 0.004, 0.5, 0x9a8a68, 0.04);

    // Level 1: parts bins of different sizes and colours, one gap.
    tray(1, zA + 0.0, 0.4, 0.16, 0.34, GREY_BIN);
    tray(1, zA + 0.4, 0.42, 0.2, 0.26, ACCENT);
    tray(1, zA + 0.72, 0.36, 0.12, 0.3, 0x4c5a6b);
    tray(1, zA + 1.5, 0.44, 0.22, 0.4, GREY_BIN);

    // Level 2: a cable drum, two flat boxes, spare pipe fittings; room left.
    p.bar(sx, base(2) + 0.15, zA + 0.2, 0.34, 0.3, 0x2c3138, Math.PI / 2);
    p.bar(sx, base(2) + 0.15, zA + 0.2, 0.36, 0.1, STEEL_BARE, Math.PI / 2);
    p.box(sx, base(2), zA + 0.8, 0.44, 0.14, 0.36, CARDBOARD, 0.03);
    p.box(sx, base(2) + 0.14, zA + 0.8, 0.4, 0.12, 0.32, 0x8a7852, -0.05);

    for (let i = 0; i < 3; i++) {
      p.post(sx - 0.1 + i * 0.1, base(2), zA + 1.5, 0.2, 0.07, STEEL_LIGHT);
      p.post(
        sx - 0.1 + i * 0.1,
        base(2) + 0.2,
        zA + 1.5,
        0.03,
        0.11,
        STEEL_BARE,
      );
    }

    // Level 3: two lidded steel containers and a small box; the rest empty.
    p.box(sx, base(3), zA + 0.1, 0.44, 0.26, 0.5, STEEL_LIGHT);
    p.box(sx, base(3) + 0.26, zA + 0.1, 0.46, 0.04, 0.52, ACCENT);
    p.box(sx, base(3), zA + 0.85, 0.4, 0.2, 0.34, CHARCOAL);
    p.box(sx, base(3) + 0.2, zA + 0.85, 0.42, 0.03, 0.36, STEEL_BARE);
    p.box(sx, base(3), zA + 1.4, 0.3, 0.16, 0.24, CARDBOARD, -0.1);

    map.createFitting("fittings-shelving", F, p.elements, [
      { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top },
    ]);
  }

  // ================================================================ trolley
  {
    const p = new Pieces();
    const cx = WEST + 1.2 + 0.45;
    const cz = NORTH + 0.3;
    const w = 0.9;
    const d = 0.55;

    // A tubular frame: four legs, two trays with lips, a push handle.
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
      }
    }

    for (const y of [0.17, 0.62]) {
      p.box(cx, y, cz, w, 0.035, d, CHARCOAL);
      p.box(cx, y + 0.035, cz + d / 2 - 0.01, w, 0.04, 0.02, CHARCOAL);
      p.box(cx, y + 0.035, cz - d / 2 + 0.01, w, 0.04, 0.02, CHARCOAL);
      p.box(cx - w / 2 + 0.01, y + 0.035, cz, 0.02, 0.04, d, CHARCOAL);
      p.box(cx + w / 2 - 0.01, y + 0.035, cz, 0.02, 0.04, d, CHARCOAL);
    }

    p.alongX(
      cx - w / 2 + 0.03,
      cx + w / 2 - 0.03,
      0.97,
      cz + d / 2 + 0.1,
      0.035,
      STEEL_BARE,
    );

    for (const sx of [-1, 1]) {
      p.box(
        cx + sx * (w / 2 - 0.03),
        0.62,
        cz + d / 2 - 0.03,
        0.04,
        0.35,
        0.04,
        STEEL_BARE,
      );
      p.alongZ(
        cx + sx * (w / 2 - 0.03),
        0.96,
        cz + d / 2 - 0.03,
        cz + d / 2 + 0.1,
        0.035,
        STEEL_BARE,
      );

      // Wheels: axle along x, one at each leg, resting on the floor.
      for (const sz of [-1, 1]) {
        p.alongX(
          cx + sx * (w / 2 - 0.03) - 0.025,
          cx + sx * (w / 2 - 0.03) + 0.025,
          0.07,
          cz + sz * (d / 2 - 0.03),
          0.14,
          BLACK,
        );
      }
    }

    // Supplies: a toolbox with a yellow handle, a spray can and an oil can.
    p.box(cx - 0.17, 0.655, cz, 0.4, 0.14, 0.26, STEEL);
    p.box(cx - 0.17, 0.795, cz, 0.42, 0.025, 0.28, CHARCOAL);
    p.alongX(cx - 0.3, cx - 0.04, 0.845, cz, 0.025, ACCENT);
    p.post(cx + 0.2, 0.655, cz - 0.08, 0.2, 0.07, 0x7e848c);
    p.post(cx + 0.33, 0.655, cz + 0.04, 0.17, 0.08, ACCENT);
    p.box(cx + 0.1, 0.205, cz, 0.28, 0.18, 0.28, CARDBOARD, 0.08);
    p.post(cx - 0.25, 0.205, cz + 0.03, 0.22, 0.14, 0x3c5365);

    map.createFitting("fittings-trolley", F, p.elements, [
      {
        minX: cx - w / 2,
        maxX: cx + w / 2,
        minZ: cz - d / 2,
        maxZ: cz + d / 2 + 0.08,
        top: 0.72,
      },
    ]);
  }

  // ======================================================= machining station
  // (Replaces the old plain block: same 1.8 x 1.4 footprint, 1.6 m high.)
  {
    const p = new Pieces();
    // (Pushed back against the south wall, out of the passage between the
    // storage end and the workshop end.)
    const x0 = 9.4;
    const x1 = 11.2;
    const z0 = 22.3;
    const z1 = 23.7;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const deck = 0.86;

    // A steel base cabinet with drawers on the north face, a plinth, a heavy
    // top plate and a yellow edge strip.
    p.box(cx, 0, cz, x1 - x0, 0.08, z1 - z0, CHARCOAL);
    p.box(cx, 0.08, cz, x1 - x0 - 0.06, deck - 0.14, z1 - z0 - 0.06, STEEL);
    p.box(cx, deck - 0.06, cz, x1 - x0, 0.06, z1 - z0, CHARCOAL);
    p.box(cx, deck - 0.01, z0 + 0.03, x1 - x0 - 0.02, 0.012, 0.04, ACCENT);

    for (let i = 0; i < 3; i++) {
      const y = 0.14 + i * 0.22;

      p.box(
        cx - 0.25,
        y,
        z0 - 0.005,
        1.0,
        0.19,
        0.02,
        i === 1 ? STEEL_LIGHT : 0x586a80,
      );
      p.alongX(cx - 0.45, cx - 0.05, y + 0.14, z0 - 0.03, 0.025, ACCENT);
    }

    // A cupboard door on the right with a handle.
    p.box(cx + 0.62, 0.14, z0 - 0.005, 0.5, 0.62, 0.02, 0x586a80);
    p.box(cx + 0.45, 0.42, z0 - 0.03, 0.03, 0.2, 0.03, ACCENT);

    // The drill press: a base plate, a tall column, a table with a collar, a
    // head with a motor, a chuck with a bit and a feed handle.
    const px = cx - 0.2;
    const pz = z1 - 0.38;

    p.box(px, deck, pz, 0.5, 0.045, 0.4, CHARCOAL);
    p.post(px, deck + 0.045, pz + 0.12, 0.7, 0.08, STEEL_BARE);
    p.box(px, deck + 0.28, pz, 0.3, 0.035, 0.3, STEEL);
    p.box(px, deck + 0.26, pz + 0.12, 0.13, 0.08, 0.13, CHARCOAL);
    p.box(px, deck + 0.55, pz + 0.04, 0.26, 0.2, 0.3, STEEL);
    p.box(px, deck + 0.72, pz + 0.04, 0.22, 0.04, 0.26, CHARCOAL);
    p.alongX(px - 0.17, px + 0.17, deck + 0.8, pz + 0.04, 0.13, CHARCOAL);
    p.post(px, deck + 0.38, pz - 0.1, 0.17, 0.045, STEEL_BARE);
    p.post(px, deck + 0.3, pz - 0.1, 0.1, 0.02, 0x9aa2ae);

    for (const spoke of [0, 1, 2]) {
      const angle = (spoke * Math.PI * 2) / 3 + 0.3;

      p.bar(
        px + 0.14,
        deck + 0.6 + Math.sin(angle) * 0.07,
        pz - 0.06,
        0.14,
        0.022,
        STEEL_BARE,
        0,
        angle,
      );
    }

    p.chunk(px + 0.2, deck + 0.64, pz - 0.06, 0.04, ACCENT);
    // A work piece clamped on the table.
    p.box(px, deck + 0.315, pz - 0.02, 0.14, 0.06, 0.1, STEEL_LIGHT);

    // A bench grinder at the west end and a tray of parts at the east.
    const gx = cx - 0.72;

    p.box(gx, deck, cz - 0.1, 0.22, 0.05, 0.3, CHARCOAL);
    p.alongX(gx - 0.1, gx + 0.1, deck + 0.14, cz - 0.1, 0.13, STEEL);
    p.alongX(gx - 0.17, gx - 0.12, deck + 0.14, cz - 0.1, 0.2, 0x9a9488);
    p.alongX(gx + 0.12, gx + 0.17, deck + 0.14, cz - 0.1, 0.2, 0x9a9488);
    p.box(cx + 0.65, deck, cz + 0.1, 0.4, 0.06, 0.3, GREY_BIN);
    p.chunk(cx + 0.58, deck + 0.04, cz + 0.08, 0.05, STEEL_BARE);
    p.chunk(cx + 0.7, deck + 0.04, cz + 0.12, 0.045, RUST, 2);
    // A bit of oil on the plate.
    p.box(cx + 0.2, deck, cz - 0.28, 0.2, 0.01, 0.12, OIL, 0.5);

    map.createFitting("fittings-machining", F, p.elements, [
      { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: 1.6 },
    ]);
  }

  // ================================================================== press
  // (Replaces the old plain block: same 2 x 2 footprint, 1.9 m high.)
  {
    const p = new Pieces();
    const x0 = 13.0;
    const x1 = 15.0;
    const z0 = 20.2;
    const z1 = 22.2;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;

    // A four-post hydraulic press: a low plinth and a bolster plate, four
    // slim ground posts carrying a crown with the cylinder on top, a sliding
    // platen on a ram, and a separate power unit at the back.
    p.box(cx, 0, cz, x1 - x0, 0.1, z1 - z0, CHARCOAL);
    p.box(cx, 0.1, cz, 1.3, 0.5, 1.1, STEEL);
    p.box(cx, 0.6, cz, 1.46, 0.08, 1.2, CHARCOAL);
    p.box(cx, 0.68, cz, 0.9, 0.03, 0.7, STEEL_BARE);
    // A billet on the plate, under the die.
    p.box(cx + 0.1, 0.71, cz - 0.05, 0.4, 0.07, 0.3, STEEL_LIGHT);

    // The four posts, with a collar at each foot and a sleeve in the platen.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const px = cx + sx * 0.6;
        const pz = cz + sz * 0.42;

        p.box(px, 0.68, pz, 0.2, 0.08, 0.2, CHARCOAL);
        p.post(px, 0.76, pz, 0.74, 0.1, STEEL_BARE);
        p.box(px, 1.0, pz, 0.18, 0.16, 0.18, STEEL);
      }
    }

    // The sliding platen with its die, hanging from the ram.
    p.box(cx, 0.98, cz, 1.36, 0.1, 1.0, STEEL);
    p.box(cx, 0.88, cz - 0.05, 0.5, 0.1, 0.34, CHARCOAL);
    p.post(cx, 1.08, cz, 0.36, 0.16, STEEL_BARE);

    // The crown: a thick beam across the posts, a top plate, and the
    // hydraulic cylinder standing on it with a cap.
    p.box(cx, 1.36, cz, 1.52, 0.22, 1.12, STEEL);
    p.box(cx, 1.58, cz, 1.6, 0.05, 1.2, CHARCOAL);
    p.post(cx, 1.63, cz, 0.24, 0.44, STEEL_LIGHT);
    p.box(cx, 1.87, cz, 0.5, 0.03, 0.5, CHARCOAL);
    // A faded plate and stripe on the crown's front.
    p.box(cx, 1.42, cz - 0.565, 0.5, 0.09, 0.01, 0x9a8836);
    p.box(cx - 0.55, 1.38, cz - 0.565, 0.3, 0.14, 0.01, ACCENT);

    // The power unit at the back: an oil tank, a motor, a gauge and hoses up
    // to the cylinder.
    p.box(cx + 0.28, 0.1, z1 - 0.3, 0.9, 0.5, 0.4, STEEL);
    p.box(cx + 0.28, 0.6, z1 - 0.3, 0.94, 0.04, 0.44, CHARCOAL);
    p.alongX(cx - 0.02, cx + 0.5, 0.78, z1 - 0.3, 0.3, CHARCOAL);
    p.box(cx + 0.56, 0.64, z1 - 0.3, 0.1, 0.06, 0.1, BLACK);
    p.chunk(cx - 0.12, 0.64, z1 - 0.42, 0.07, ACCENT);
    p.post(cx + 0.7, 0.64, z1 - 0.18, 0.2, 0.1, STEEL_BARE);
    p.post(cx + 0.25, 0.64, z1 - 0.46, 1.06, 0.05, OIL);
    p.alongZ(cx + 0.25, 1.7, z1 - 0.46, cz, 0.05, OIL);

    // A control stand at the front-left with a yellow and a red switch.
    p.post(cx - 0.75, 0.1, z0 + 0.16, 0.8, 0.06, STEEL_BARE);
    p.box(cx - 0.75, 0.9, z0 + 0.16, 0.3, 0.28, 0.16, CHARCOAL);
    p.chunk(cx - 0.81, 1.1, z0 + 0.06, 0.05, ACCENT);
    p.chunk(cx - 0.69, 1.1, z0 + 0.06, 0.05, 0x7a2a22);

    // A guard rail across the open front.
    for (const gx of [cx - 0.58, cx + 0.58]) {
      p.post(gx, 0.1, z0 + 0.06, 0.8, 0.04, ACCENT);
    }

    p.alongX(cx - 0.58, cx + 0.58, 0.88, z0 + 0.06, 0.04, ACCENT);
    p.alongX(cx - 0.58, cx + 0.58, 0.55, z0 + 0.06, 0.03, ACCENT);

    map.createFitting("fittings-press", F, p.elements, [
      { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: 1.9 },
    ]);
  }

  // ================================================== materials (SW corner)
  {
    const p = new Pieces();
    const random = rng(4417);
    const x0 = WEST;
    const z1 = SOUTH;

    for (let layer = 0; layer < 5; layer++) {
      for (let i = 0; i < 4; i++) {
        const len = 1.5 - random() * 0.12 - layer * 0.02;
        const shift = (random() - 0.5) * 0.08;

        p.box(
          x0 + len / 2 + shift + 0.02,
          layer * 0.075,
          z1 - 0.1 - i * 0.2,
          len,
          0.07,
          0.19,
          i % 2 === 0 ? TIMBER : 0x6d5236,
          (random() - 0.5) * 0.02,
        );
      }
    }

    p.box(x0 + 0.5, 0.375, z1 - 0.4, 0.2, 0.06, 0.6, TIMBER_DARK, 0.08);
    p.box(x0 + 1.0, 0.375, z1 - 0.45, 0.2, 0.06, 0.6, TIMBER, -0.05);

    map.createFitting("fittings-timber", F, p.elements, [
      { minX: x0, maxX: x0 + 1.55, minZ: z1 - 0.8, maxZ: z1, top: 0.42 },
    ]);

    const bags = new Pieces();
    const bx = x0 + 2.05;

    bags.bag(bx, 0, z1 - 0.3, 0.05, 0xb8b09a);
    bags.bag(bx + 0.02, 0.2, z1 - 0.3, -0.06, 0xa8a18d);
    bags.bag(bx + 0.05, 0, z1 - 0.88, 0.5, 0xbdb5a0);

    map.createFitting("fittings-bags", F, bags.elements, [
      { minX: bx - 0.42, maxX: bx + 0.45, minZ: z1 - 0.58, maxZ: z1, top: 0.4 },
      {
        minX: bx - 0.33,
        maxX: bx + 0.42,
        minZ: z1 - 1.17,
        maxZ: z1 - 0.62,
        top: 0.2,
      },
    ]);
  }

  // ===================================================== pipe rack (S wall)
  {
    const p = new Pieces();
    const x0 = 15.4;
    const x1 = 17.8;
    const cx = (x0 + x1) / 2;
    const z1 = SOUTH;
    const z0 = z1 - 0.9;
    const cz = (z0 + z1) / 2;

    // Two steel frames (a base rail, uprights and cross-arms), three layers.
    for (const fx of [x0 + 0.15, x1 - 0.15]) {
      p.box(fx, 0, cz, 0.1, 0.07, 0.86, CHARCOAL);
      p.post(fx, 0.07, z0 + 0.06, 0.62, 0.06, CHARCOAL);
      p.post(fx, 0.07, z1 - 0.06, 0.62, 0.06, CHARCOAL);
      p.box(fx, 0.34, cz, 0.08, 0.04, 0.86, CHARCOAL);
      p.box(fx, 0.66, z0 + 0.06, 0.14, 0.03, 0.12, ACCENT);
      p.box(fx, 0.66, z1 - 0.06, 0.14, 0.03, 0.12, ACCENT);
    }

    const zA = z0 + 0.15;
    const zB = z0 + 0.42;
    const zC = z0 + 0.69;

    p.bar(cx + 0.05, 0.07 + 0.075, zA, 2.2, 0.15, 0x6c7480);
    p.bar(cx - 0.05, 0.07 + 0.065, zB, 2.1, 0.13, RUST);
    p.bar(cx + 0.03, 0.07 + 0.085, zC, 2.25, 0.17, 0x56657a);
    p.bar(cx - 0.08, 0.38 + 0.07, zA + 0.13, 1.9, 0.14, 0x7d8794);
    p.bar(cx + 0.1, 0.38 + 0.075, zB + 0.13, 2.15, 0.15, 0x6c7480);
    p.bar(cx, 0.52 + 0.1, (zA + zC) / 2, 2.3, 0.04, STEEL_BARE);
    p.bar(cx - 0.1, 0.52 + 0.1, (zA + zC) / 2 + 0.12, 2.0, 0.04, 0x8a9099);

    map.createFitting("fittings-pipe-rack", F, p.elements, [
      { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: 0.7 },
    ]);
  }

  furnishWorkshopPipes(map, F);

  // ================================================================ lights
  // A cool task light over the bench, and a pendant over the machines. Short
  // range and modest, so the work areas read without lighting the arena.
  map.addLight({
    id: "workshop-light-bench",
    x: benchCx - 0.3,
    y: F + 2.3,
    z: NORTH + 0.62,
    color: 0xd6e4ff,
    intensity: 2.6,
    distance: 6.5,
  });
  map.addLight({
    id: "workshop-light-machines",
    x: 11.4,
    y: F + 3.15,
    z: 20.9,
    color: 0xcfdcf2,
    intensity: 1.8,
    distance: 6.5,
  });

  // The pendant lamp that goes with it (chain, a conical shade, a lens).
  {
    const p = new Pieces();

    p.post(11.4, 3.3, 20.9, 3.2, 0.025, CHARCOAL);
    p.post(11.4, 3.02, 20.9, 0.3, 0.46, CHARCOAL);
    p.post(11.4, 2.96, 20.9, 0.06, 0.34, 0xdfe6ea);
    map.createFitting("fittings-pendant", F, p.elements, []);
  }

  // ----------------------------------------------------- floor wear marks
  const stain = (
    id: string,
    x: number,
    z: number,
    w: number,
    d: number,
    rot: number,
    alpha: number,
  ): void =>
    map.addDecal({
      id,
      kind: "stain",
      x,
      z,
      y: F,
      width: w,
      depth: d,
      rotation: rot,
      color: 0x060607,
      alpha,
    });

  stain("workshop-oil-machine", 10.3, 22.7, 3.2, 2.0, 0.4, 0.4);
  stain("workshop-oil-press", 14.1, 21.5, 3.4, 2.9, 1.1, 0.34);
  stain("workshop-oil-drip", 11.2, 19.0, 1.0, 0.7, 0.3, 0.3);
  stain("workshop-oil-bench", 14.6, 17.6, 1.5, 0.9, 2.2, 0.22);
  stain("workshop-oil-vise", 13.9, 16.9, 0.8, 0.5, 0.5, 0.26);
  map.addDecal({
    id: "workshop-dust-shelving",
    kind: "dust",
    x: 7.9,
    z: 17.4,
    y: F,
    width: 2.6,
    depth: 3.6,
    rotation: 0.2,
    color: 0x9a9d9f,
    alpha: 0.26,
  });
  map.addDecal({
    id: "workshop-scratches-bench",
    kind: "wear",
    x: 15.3,
    z: 17.1,
    y: F,
    width: 3.8,
    depth: 0.6,
    rotation: 0.04,
    color: 0x8a8d92,
    alpha: 0.24,
  });

  const edge = (id: string, x: number, z: number, w: number, d: number): void =>
    map.addDecal({
      id,
      kind: "wear",
      x,
      z,
      y: F,
      width: w,
      depth: d,
      rotation: 0,
      color: 0xb89a2e,
      alpha: 0.5,
    });

  // The press's work area, and a line marking the bench's work zone.
  edge("workshop-mark-press-n", 14.0, 19.85, 2.8, 0.2);
  edge("workshop-mark-press-w", 12.65, 21.2, 0.2, 2.5);
  edge("workshop-mark-press-e", 15.35, 21.2, 0.2, 2.5);
  edge("workshop-mark-bench", benchCx, 17.4, 3.6, 0.16);
}
