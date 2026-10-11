import { Pieces } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";

/**
 * The Workshop's pipe and utility network, drawn only (nothing collides):
 *
 * - A main supply (180 mm, gunmetal) that comes through the Warehouse wall at
 *   the north-east, runs west along the north wall, down the west wall and
 *   back east along the south wall into the wall again, all at ceiling level
 *   and above every door. It turns with mitred elbows with collars.
 * - Two 100 mm branches off it: one drops by the toolbox chest to a valve and
 *   a pressure gauge; one crosses the ceiling behind the press and drops onto
 *   its head beam through a reducer.
 * - A black rubber hose from the south run, over head height, to the drill
 *   press's head.
 * - Wall conduit with junction boxes, a cable tray and clamps on the north and
 *   west walls, going into the steel cabinet.
 * - Clamps, ceiling hangers, wall plates, flange collars, yellow bands and
 *   small labels at believable intervals.
 *
 * Everything keeps to the upper wall and the ceiling (or hangs over a machine
 * above head height), leaving the middle of the room and every doorway open.
 */

export type Vec3 = readonly [number, number, number];

export const GUN = 0x474c55;
export const GREY = 0x6c737d;
const HOSE = 0x15171a;
const CONDUIT = 0x3c424b;
export const FLANGE = 0x5a636e;
const PLATE = 0x353b46;
const YELLOW = 0xb09128;
export const RED = 0x7a2a22;
const LABEL = 0xc9c6b4;
const DARK = 0x23262c;

export class Network {
  private readonly p: Pieces;

  constructor(pieces: Pieces) {
    this.p = pieces;
  }

  /** A straight pipe between two points (axis-aligned, or at 45 degrees). */
  public seg(a: Vec3, b: Vec3, d: number, color: number): void {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const length = Math.hypot(dx, dy, dz);

    if (length < 0.005) {
      return;
    }

    const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const flat = Math.abs(dy) < 1e-6;
    let ry = 0;
    let rz = 0;
    let rx = 0;

    if (flat) {
      ry = Math.atan2(-dz, dx);
    } else if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) {
      rz = Math.PI / 2;
    } else if (Math.abs(dz) < 1e-6) {
      rz = Math.atan2(dy, dx);
    } else {
      // In the y-z plane: stand it up, then tip it toward z.
      rz = Math.PI / 2;
      rx = Math.atan2(dz, dy);
    }

    this.p.bar(mid[0], mid[1], mid[2], length, d, color, ry, rz, rx);
  }

  /** A collar (flange or coupling) round a pipe at `at`, its axis `dir`. */
  public collar(
    at: Vec3,
    dir: Vec3,
    d: number,
    long = 0.08,
    color = FLANGE,
    scale = 1.35,
  ): void {
    const half = [dir[0] * long, dir[1] * long, dir[2] * long] as const;

    this.seg(
      [at[0] - half[0] / 2, at[1] - half[1] / 2, at[2] - half[2] / 2],
      [at[0] + half[0] / 2, at[1] + half[1] / 2, at[2] + half[2] / 2],
      d * scale,
      color,
    );
  }

  /**
   * A run of straight legs joined with mitred 90-degree elbows: each corner is
   * cut by a short diagonal piece, with a collar at both its ends.
   */
  public run(points: Vec3[], d: number, color: number): void {
    const k = d * 0.95;
    const unit = (a: Vec3, b: Vec3): Vec3 => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

      return [(b[0] - a[0]) / l, (b[1] - a[1]) / l, (b[2] - a[2]) / l];
    };
    let from: Vec3 = points[0];

    for (let i = 1; i < points.length; i++) {
      const corner = points[i];
      const last = i === points.length - 1;

      if (last) {
        this.seg(from, corner, d, color);
        break;
      }

      const uIn = unit(points[i - 1], corner);
      const uOut = unit(corner, points[i + 1]);
      const a: Vec3 = [
        corner[0] - uIn[0] * k,
        corner[1] - uIn[1] * k,
        corner[2] - uIn[2] * k,
      ];
      const b: Vec3 = [
        corner[0] + uOut[0] * k,
        corner[1] + uOut[1] * k,
        corner[2] + uOut[2] * k,
      ];

      this.seg(from, a, d, color);
      this.seg(a, b, d, color);
      this.collar(a, uIn, d, 0.07);
      this.collar(b, uOut, d, 0.07);
      from = b;
    }
  }

  /** A clamp ring on a pipe, with a plate back to the wall (`wall` is a vector). */
  public clamp(at: Vec3, dir: Vec3, d: number, wall: Vec3, gap: number): void {
    this.collar(at, dir, d, 0.06, PLATE, 1.14);

    // The plate: a short block from the pipe's edge to the wall.
    const w = gap + d * 0.35;
    const cx = at[0] + wall[0] * (d / 2 + gap / 2 - d * 0.1);
    const cy = at[1] + wall[1] * (d / 2 + gap / 2 - d * 0.1);
    const cz = at[2] + wall[2] * (d / 2 + gap / 2 - d * 0.1);
    const sx = Math.abs(wall[0]) > 0.5 ? w : 0.09;
    const sy = Math.abs(wall[1]) > 0.5 ? w : 0.14;
    const sz = Math.abs(wall[2]) > 0.5 ? w : 0.09;

    this.p.box(cx, cy - sy / 2, cz, sx, sy, sz, PLATE);
  }

  /** A yellow identification band. */
  public band(at: Vec3, dir: Vec3, d: number): void {
    this.collar(at, dir, d, 0.14, YELLOW, 1.1);
  }

  /** A small label plate on the front face of a pipe. */
  public label(
    x: number,
    y: number,
    z: number,
    faceZ: 1 | -1,
    d: number,
  ): void {
    this.p.box(
      x,
      y - 0.03,
      z + faceZ * (d / 2 + 0.005),
      0.14,
      0.06,
      0.012,
      LABEL,
    );
    this.p.box(
      x,
      y - 0.012,
      z + faceZ * (d / 2 + 0.012),
      0.1,
      0.012,
      0.008,
      DARK,
    );
  }

  /** A gate valve on a vertical pipe against a wall facing +z or -z. */
  public valve(
    x: number,
    y: number,
    z: number,
    faceZ: 1 | -1,
    d: number,
  ): void {
    this.p.box(x, y - 0.1, z, d * 1.5, 0.2, d * 1.5, GUN);
    // Bonnet and stem toward the room, and a handwheel.
    const stemEnd = z + faceZ * 0.24;

    this.p.bar(x, y, z + faceZ * 0.13, 0.22, 0.03, FLANGE, Math.PI / 2);
    this.p.bar(x, y, stemEnd, 0.025, 0.2, RED, Math.PI / 2);
    this.collar([x, y + 0.14, z], [0, 1, 0], d, 0.04, FLANGE, 1.5);
    this.collar([x, y - 0.14, z], [0, 1, 0], d, 0.04, FLANGE, 1.5);
  }

  /** A pressure gauge on a short stub off a vertical pipe. */
  public gauge(
    x: number,
    y: number,
    z: number,
    faceZ: 1 | -1,
    d: number,
  ): void {
    const stub = z + faceZ * (d / 2 + 0.14);

    this.p.bar(x, y, (z + stub) / 2, 0.14 + d / 2, 0.035, FLANGE, Math.PI / 2);
    this.p.bar(x, y, stub + faceZ * 0.03, 0.06, 0.16, DARK, Math.PI / 2);
    this.p.bar(x, y, stub + faceZ * 0.065, 0.014, 0.12, 0xd6d3c2, Math.PI / 2);
    // The needle.
    this.p.box(
      x + 0.01,
      y - 0.005,
      stub + faceZ * 0.075,
      0.012,
      0.05,
      0.006,
      DARK,
      0,
      0,
      0,
    );
  }
}

export function furnishWorkshopPipes(map: MapBuilder, floorY: number): void {
  const p = new Pieces();
  const n = new Network(p);

  // Ceiling level of the main (180 mm: its top is 8 cm under the roof), and
  // its centre lines 7 cm off each wall.
  // The ceiling is 6.5 m above the floor: the main sits just under it.
  const Y = 6.15;
  const ZN = 15.46;
  const XW = 6.46;
  const ZS = 23.54;
  const EAST = 18.25;
  const X: Vec3 = [1, 0, 0];
  const Z: Vec3 = [0, 0, 1];
  const UP: Vec3 = [0, 1, 0];

  // ------------------------------------------------------- the main supply
  n.run(
    [
      [EAST, Y, ZN],
      [XW, Y, ZN],
      [XW, Y, ZS],
      [EAST, Y, ZS],
    ],
    0.18,
    GUN,
  );

  // Where it goes through the Warehouse wall: a flange plate on the wall.
  n.collar([17.97, Y, ZN], X, 0.18, 0.06, FLANGE, 1.7);
  n.collar([17.97, Y, ZS], X, 0.18, 0.06, FLANGE, 1.7);

  // Couplings along the straight runs, with bolts on each.
  for (const [x, z] of [
    [12.9, ZN],
    [9.2, ZS],
    [15.6, ZS],
  ] as const) {
    n.collar([x, Y, z], X, 0.18, 0.12, FLANGE, 1.4);
    p.chunk(x, Y + 0.11, z, 0.04, 0x8791a0);
    p.chunk(x + 0.07, Y + 0.1, z, 0.04, 0x8791a0);
  }
  n.collar([XW, Y, 19.2], Z, 0.18, 0.12, FLANGE, 1.4);

  // Wall clamps (plates back to the wall) on every straight run.
  for (const x of [7.6, 9.9, 13.9, 16.4]) {
    n.clamp([x, Y, ZN], X, 0.18, [0, 0, -1], 0.07);
  }
  // The west leg crosses the ceiling now (no wall under it): hung from the roof.
  for (const z of [17.1, 19.9, 22.2]) {
    n.collar([XW, Y, z], Z, 0.18, 0.05, PLATE, 1.25);
    p.post(XW, Y + 0.05, z, 0.3, 0.022, PLATE);
    p.box(XW, 6.46, z, 0.14, 0.04, 0.14, PLATE);
  }
  for (const x of [7.8, 11.4, 13.0, 16.9]) {
    n.clamp([x, Y, ZS], X, 0.18, [0, 0, 1], 0.07);
  }

  // Yellow identification bands and labels.
  n.band([8.7, Y, ZN], X, 0.18);
  n.band([15.5, Y, ZN], X, 0.18);
  n.band([XW, Y, 17.9], Z, 0.18);
  n.band([12.2, Y, ZS], X, 0.18);
  n.label(8.7, Y, ZN, 1, 0.18);
  n.label(15.5, Y, ZN, 1, 0.18);

  // --------------------------------- branch 1: drop by the toolbox chest
  {
    const x = 17.45;
    const top = Y - 0.1;
    const bottom = 1.4;

    // A tee collar on the main, then the 100 mm drop down the wall.
    n.collar([x, Y, ZN], X, 0.18, 0.14, FLANGE, 1.3);
    n.seg([x, top, ZN], [x, bottom, ZN], 0.1, GREY);
    n.clamp([x, 2.9, ZN], UP, 0.1, [0, 0, -1], 0.07);
    n.clamp([x, 1.9, ZN], UP, 0.1, [0, 0, -1], 0.07);
    n.valve(x, 2.45, ZN, 1, 0.1);
    n.gauge(x, 1.75, ZN, 1, 0.1);
    n.band([x, 3.05, ZN], UP, 0.1);
    // Ends in a blind flange with a small drain valve.
    n.collar([x, bottom + 0.03, ZN], UP, 0.1, 0.06, FLANGE, 1.7);
    p.box(x, bottom - 0.1, ZN, 0.07, 0.1, 0.07, GUN);
    p.bar(x + 0.07, bottom - 0.04, ZN, 0.12, 0.03, RED, 0, 0);
  }

  // ------------------------- branch 2: across the ceiling to the press head
  {
    const x = 14.0;
    const zBranch = 21.3;

    // A tee off the south run, then north along the ceiling at the main's
    // level, with a mitred elbow down.
    n.collar([x, Y, ZS], X, 0.18, 0.14, FLANGE, 1.3);
    n.run(
      [
        [x, Y, ZS],
        [x, Y, zBranch],
        [x, 3.0, zBranch],
      ],
      0.1,
      GREY,
    );

    // Hangers: a rod to the roof and a plate on the ceiling, a clamp round.
    for (const z of [23.0, 22.2, 21.6]) {
      n.collar([x, Y, z], Z, 0.1, 0.05, PLATE, 1.25);
      p.post(x, Y + 0.05, z, 0.3, 0.022, PLATE);
      p.box(x, 6.46, z, 0.14, 0.04, 0.14, PLATE);
    }

    // The drop: 100 mm, a reducer to 75 mm, a valve, and a flanged landing on
    // the press's head beam. It ends above head height.
    n.seg([x, 3.0, zBranch], [x, 2.88, zBranch], 0.1, GREY);
    n.collar([x, 2.86, zBranch], UP, 0.1, 0.06, FLANGE, 1.4);
    n.seg([x, 2.84, zBranch], [x, 2.7, zBranch], 0.075, GREY);
    n.band([x, 2.55, zBranch], UP, 0.075);
    p.box(x, 2.3, zBranch, 0.15, 0.22, 0.15, GUN);
    p.bar(x + 0.12, 2.4, zBranch, 0.2, 0.028, FLANGE, 0, 0);
    p.bar(x + 0.23, 2.4, zBranch, 0.025, 0.18, RED, 0, Math.PI / 2);
    n.seg([x, 2.7, zBranch], [x, 2.52, zBranch], 0.075, GREY);
    n.seg([x, 2.3, zBranch], [x, 1.93, zBranch], 0.075, GREY);
    n.collar([x, 1.95, zBranch], UP, 0.075, 0.05, FLANGE, 2.0);
    p.box(x, 1.9, zBranch, 0.26, 0.03, 0.26, PLATE);
  }

  // ---------------- hose from the south run to the drill press's head
  {
    const x = 10.1;

    n.collar([x, Y, ZS], X, 0.18, 0.14, FLANGE, 1.3);
    n.seg([x, Y - 0.1, ZS], [x, 2.65, ZS], 0.075, GREY);
    n.valve(x, 2.95, ZS, -1, 0.075);
    n.clamp([x, 3.2, ZS], UP, 0.075, [0, 0, 1], 0.07);
    n.seg([x, 2.65, ZS], [x, 2.28, ZS], 0.075, GREY);
    n.collar([x, 2.26, ZS], UP, 0.075, 0.06, FLANGE, 1.7);
    // A black rubber hose in a soft run from the pipe to the head, over head
    // height all the way (the machine stands right against the wall).
    const hose: Vec3[] = [
      [x, 2.2, ZS - 0.06],
      [x, 2.1, 23.42],
      [x - 0.05, 1.95, 23.36],
      [x - 0.02, 1.82, 23.3],
      [x, 1.74, 23.34],
    ];

    for (let i = 0; i + 1 < hose.length; i++) {
      n.seg(hose[i], hose[i + 1], 0.045, HOSE);
    }

    n.collar([x, 2.18, ZS - 0.1], Z, 0.045, 0.06, FLANGE, 1.9);
    n.collar([x, 1.76, 23.33], Z, 0.045, 0.06, FLANGE, 1.9);
  }

  // ----------------------------------------------- wall-mounted conduit
  {
    // North wall: up out of the cabinet's top, along the wall, to a box.
    const zc = 15.345;
    const y = 3.0;

    n.run(
      [
        [7.0, 2.0, zc],
        [7.0, y, zc],
        [9.8, y, zc],
      ],
      0.04,
      CONDUIT,
    );
    p.box(9.8, y - 0.1, zc, 0.24, 0.2, 0.1, PLATE);
    p.box(9.8, y - 0.04, zc + 0.055, 0.2, 0.008, 0.01, DARK);
    p.chunk(9.71, y - 0.17, zc + 0.052, 0.025, 0x8791a0);
    p.chunk(9.89, y - 0.17, zc + 0.052, 0.025, 0x8791a0);
    // Clamps along it.
    n.clamp([7.0, 2.5, zc], UP, 0.04, [0, 0, -1], 0.012);
    n.clamp([8.0, y, zc], X, 0.04, [0, 0, -1], 0.012);
    n.clamp([9.0, y, zc], X, 0.04, [0, 0, -1], 0.012);
    // The cabinet's conduit entry (a gland on its top).
    p.box(7.0, 2.0, 15.4, 0.1, 0.05, 0.1, PLATE);
  }

  {
    // West wall: a conduit along it above the shelving, with two boxes and a
    // drop, and a cable tray above it.
    const xc = 6.345;
    const y = 2.55;

    n.run(
      [
        [xc, y, 16.2],
        [xc, y, 19.7],
        [xc, 1.55, 19.7],
      ],
      0.04,
      CONDUIT,
    );
    p.box(xc, y - 0.1, 17.1, 0.1, 0.2, 0.24, PLATE);
    p.box(xc, y - 0.1, 19.7, 0.1, 0.2, 0.24, PLATE);
    p.box(xc + 0.055, 1.5, 19.7, 0.01, 0.12, 0.1, DARK);
    for (const z of [16.6, 18.2]) {
      n.clamp([xc, y, z], Z, 0.04, [-1, 0, 0], 0.012);
    }

    // The cable tray: a flat bed, two lips and rungs, hung on three brackets.
    const tray = 3.0;
    const z0 = 16.4;
    const z1 = 19.8;

    p.box(6.5, tray, (z0 + z1) / 2, 0.28, 0.03, z1 - z0, PLATE);
    p.box(6.36, tray + 0.03, (z0 + z1) / 2, 0.025, 0.05, z1 - z0, PLATE);
    p.box(6.64, tray + 0.03, (z0 + z1) / 2, 0.025, 0.05, z1 - z0, PLATE);

    for (let z = z0 + 0.15; z < z1; z += 0.32) {
      p.box(6.5, tray + 0.03, z, 0.26, 0.02, 0.025, CONDUIT);
    }

    for (const z of [16.7, 18.1, 19.5]) {
      p.box(6.34, tray - 0.12, z, 0.03, 0.15, 0.05, PLATE);
      p.box(6.4, tray - 0.02, z, 0.12, 0.03, 0.05, PLATE);
    }

    // A few cables lying in it.
    p.bar(
      6.5,
      tray + 0.055,
      (z0 + z1) / 2,
      z1 - z0 - 0.1,
      0.03,
      HOSE,
      Math.PI / 2,
    );
    p.bar(
      6.56,
      tray + 0.05,
      (z0 + z1) / 2,
      z1 - z0 - 0.3,
      0.022,
      0x2f2b24,
      Math.PI / 2,
    );
  }

  map.createFitting("fittings-network", floorY, p.elements, []);
}
