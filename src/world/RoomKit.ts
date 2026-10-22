import { Pieces } from "./FittingPieces";

/**
 * Small shared pieces for the room furnishings (server room, armory,
 * barracks, archive, break room, warehouse): the common palette, status
 * lights, label plates, cable trays and a wall fire extinguisher. Everything
 * is built from `Pieces`, the same primitives the other rooms use.
 */

export const CHARCOAL = 0x353b46;
export const GUNMETAL = 0x2c333d;
export const STEEL = 0x4f5f74;
export const STEEL_LIGHT = 0x66768c;
export const STEEL_BARE = 0x8791a0;
export const BLACK = 0x14161a;
export const ACCENT = 0x5a667a;
export const GRIME = 0x2b3036;
export const TIMBER = 0x7a5c3c;
export const TIMBER_B = 0x6a5035;
export const TIMBER_DARK = 0x4e3a28;
export const CARDBOARD = 0x7c694a;
export const CARDBOARD_B = 0x8a7656;
export const PAPER = 0xb9b49c;
export const LABEL = 0xc9c6b4;
export const RUST = 0x6a4a38;

/** Status lights: dim, as on equipment that has run for years. */
export const LED_GREEN = 0x3f8a52;
export const LED_AMBER = 0xb08a2e;
export const LED_RED = 0x9a3a30;

/** A small status light on a face looking along `axis` (towards `sign`). */
export function led(
  p: Pieces,
  x: number,
  y: number,
  z: number,
  color: number,
  axis: "x" | "z",
  sign: 1 | -1,
): void {
  if (axis === "z") {
    p.box(x, y - 0.009, z + sign * 0.006, 0.018, 0.018, 0.012, color);
  } else {
    p.box(x + sign * 0.006, y - 0.009, z, 0.012, 0.018, 0.018, color);
  }
}

/** A label plate: a pale, slightly proud rectangle with a dark mark on it. */
export function plate(
  p: Pieces,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  axis: "x" | "z",
  sign: 1 | -1,
  color = LABEL,
): void {
  if (axis === "z") {
    p.box(x, y, z + sign * 0.004, w, h, 0.008, color);
    p.box(
      x - w * 0.12,
      y + h * 0.4,
      z + sign * 0.009,
      w * 0.5,
      h * 0.18,
      0.004,
      GUNMETAL,
    );
  } else {
    p.box(x + sign * 0.004, y, z, 0.008, h, w, color);
    p.box(
      x + sign * 0.009,
      y + h * 0.4,
      z - w * 0.12,
      0.004,
      h * 0.18,
      w * 0.5,
      GUNMETAL,
    );
  }
}

/**
 * A ladder cable tray along x: two rails and rungs, hung from the ceiling on
 * rods, with a few cables laid in it. Drawn only, well above head height.
 */
export function trayX(
  p: Pieces,
  x0: number,
  x1: number,
  y: number,
  z: number,
  width: number,
  ceiling: number,
  cables: number[] = [],
): void {
  const len = x1 - x0;

  for (const side of [-1, 1]) {
    p.box((x0 + x1) / 2, y, z + side * (width / 2), len, 0.07, 0.025, STEEL);
  }

  for (let x = x0 + 0.2; x < x1; x += 0.45) {
    p.box(x, y, z, 0.02, 0.02, width, CHARCOAL);
  }

  for (const x of [x0 + 0.3, (x0 + x1) / 2, x1 - 0.3]) {
    for (const side of [-1, 1]) {
      p.post(
        x,
        y + 0.07,
        z + side * (width / 2),
        ceiling - y - 0.07,
        0.02,
        CHARCOAL,
      );
    }
  }

  cables.forEach((color, i) => {
    const dz = (i - (cables.length - 1) / 2) * 0.07;

    p.cable((x0 + x1) / 2, y + 0.04, z + dz, len - 0.1, 0.045, color);
  });
}

/** The same along z. */
export function trayZ(
  p: Pieces,
  x: number,
  y: number,
  z0: number,
  z1: number,
  width: number,
  ceiling: number,
  cables: number[] = [],
): void {
  const len = z1 - z0;

  for (const side of [-1, 1]) {
    p.box(x + side * (width / 2), y, (z0 + z1) / 2, 0.025, 0.07, len, STEEL);
  }

  for (let z = z0 + 0.2; z < z1; z += 0.45) {
    p.box(x, y, z, width, 0.02, 0.02, CHARCOAL);
  }

  for (const z of [z0 + 0.3, (z0 + z1) / 2, z1 - 0.3]) {
    for (const side of [-1, 1]) {
      p.post(
        x + side * (width / 2),
        y + 0.07,
        z,
        ceiling - y - 0.07,
        0.02,
        CHARCOAL,
      );
    }
  }

  cables.forEach((color, i) => {
    const dx = (i - (cables.length - 1) / 2) * 0.07;

    p.cable(
      x + dx,
      y + 0.04,
      (z0 + z1) / 2,
      len - 0.1,
      0.045,
      color,
      Math.PI / 2,
    );
  });
}

/** A red wall-mounted fire extinguisher with a bracket and a hose clip. */
export function extinguisher(
  p: Pieces,
  x: number,
  bottom: number,
  z: number,
  axis: "x" | "z",
  sign: 1 | -1,
): void {
  // (x, z) is where it hangs on the wall; it stands out from it by `sign`.
  const cx = axis === "x" ? x + sign * 0.1 : x;
  const cz = axis === "z" ? z + sign * 0.1 : z;

  p.post(cx, bottom, cz, 0.42, 0.14, 0x8a2a24);
  p.post(cx, bottom + 0.42, cz, 0.06, 0.07, STEEL_BARE);
  p.box(
    cx,
    bottom + 0.48,
    cz,
    axis === "x" ? 0.06 : 0.1,
    0.03,
    axis === "z" ? 0.06 : 0.1,
    BLACK,
  );

  for (const dy of [0.12, 0.32]) {
    if (axis === "x") {
      p.box(x + sign * 0.03, bottom + dy, z, 0.04, 0.03, 0.18, GUNMETAL);
    } else {
      p.box(x, bottom + dy, z + sign * 0.03, 0.18, 0.03, 0.04, GUNMETAL);
    }
  }

  // The white label.
  if (axis === "x") {
    p.box(cx + sign * 0.07, bottom + 0.2, cz, 0.006, 0.12, 0.08, LABEL);
  } else {
    p.box(cx, bottom + 0.2, cz + sign * 0.07, 0.08, 0.12, 0.006, LABEL);
  }
}

/** A hazard-style warning sign on a wall: a pale plate with a dark triangle. */
export function warningSign(
  p: Pieces,
  x: number,
  y: number,
  z: number,
  axis: "x" | "z",
  sign: 1 | -1,
): void {
  const color = 0x9a8836;

  if (axis === "z") {
    p.box(x, y, z + sign * 0.006, 0.3, 0.3, 0.012, color);
    p.box(
      x,
      y - 0.02,
      z + sign * 0.014,
      0.12,
      0.12,
      0.006,
      GUNMETAL,
      0,
      Math.PI / 4,
    );
    p.box(x, y + 0.08, z + sign * 0.014, 0.04, 0.05, 0.006, color);
  } else {
    p.box(x + sign * 0.006, y, z, 0.012, 0.3, 0.3, color);
    p.box(
      x + sign * 0.014,
      y - 0.02,
      z,
      0.006,
      0.12,
      0.12,
      GUNMETAL,
      0,
      0,
      Math.PI / 4,
    );
    p.box(x + sign * 0.014, y + 0.08, z, 0.006, 0.05, 0.04, color);
  }
}

/** The way a piece of furniture faces: the direction its front looks. */
export type Facing = "+x" | "-x" | "+z" | "-z";

/**
 * A local frame for a piece with a front: `u` runs along it, `v` out from its
 * back plane towards the front. (`ox`, `oz`) is where `u` = 0 meets the back
 * plane, so a bank of lockers is built once and stands on any wall.
 */
export class Frame {
  public readonly p: Pieces;
  private readonly ox: number;
  private readonly oz: number;
  private readonly face: Facing;

  public constructor(p: Pieces, ox: number, oz: number, face: Facing) {
    this.p = p;
    this.ox = ox;
    this.oz = oz;
    this.face = face;
  }

  /** The world x of a local point. */
  public wx(u: number, v: number): number {
    return this.face === "+x"
      ? this.ox + v
      : this.face === "-x"
        ? this.ox - v
        : this.ox + u;
  }

  /** The world z of a local point. */
  public wz(u: number, v: number): number {
    return this.face === "+z"
      ? this.oz + v
      : this.face === "-z"
        ? this.oz - v
        : this.oz + u;
  }

  /** A box centred at (u, v), `a` along the run and `b` out from the back. */
  public box(
    u: number,
    bottom: number,
    v: number,
    a: number,
    h: number,
    b: number,
    color: number,
    ry = 0,
  ): void {
    const alongX = this.face === "+z" || this.face === "-z";

    this.p.box(
      this.wx(u, v),
      bottom,
      this.wz(u, v),
      alongX ? a : b,
      h,
      alongX ? b : a,
      color,
      ry,
    );
  }

  public post(
    u: number,
    bottom: number,
    v: number,
    h: number,
    d: number,
    color: number,
  ): void {
    this.p.post(this.wx(u, v), bottom, this.wz(u, v), h, d, color);
  }

  /** A pipe lying along the run (u). */
  public barAlong(
    u: number,
    y: number,
    v: number,
    length: number,
    d: number,
    color: number,
  ): void {
    const alongX = this.face === "+z" || this.face === "-z";

    this.p.bar(
      this.wx(u, v),
      y,
      this.wz(u, v),
      length,
      d,
      color,
      alongX ? 0 : Math.PI / 2,
    );
  }

  /** A pipe lying out from the back (v). */
  public barOut(
    u: number,
    y: number,
    v: number,
    length: number,
    d: number,
    color: number,
  ): void {
    const alongX = this.face === "+z" || this.face === "-z";

    this.p.bar(
      this.wx(u, v),
      y,
      this.wz(u, v),
      length,
      d,
      color,
      alongX ? Math.PI / 2 : 0,
    );
  }

  public cableUp(
    u: number,
    bottom: number,
    v: number,
    h: number,
    d: number,
    color: number,
  ): void {
    this.p.cableUp(this.wx(u, v), bottom, this.wz(u, v), h, d, color);
  }

  /** A status light on the front face at depth `v`. */
  public led(u: number, y: number, v: number, color: number): void {
    this.box(u, y - 0.009, v, 0.018, 0.018, 0.012, color);
  }
}

/**
 * A bank of steel lockers: `count` doors of width `w`, `depth` deep, 1.9 m
 * high, starting at u = 0. Tones differ a little from one locker to the
 * next; a few doors stand open, some have a vent, a plate, a worn corner.
 */
export function lockerBank(
  f: Frame,
  random: () => number,
  count: number,
  w: number,
  depth: number,
  tones: number[],
  open: number[] = [],
): void {
  f.box((count * w) / 2, 0, depth / 2, count * w, 0.07, depth, BLACK);

  for (let i = 0; i < count; i++) {
    const u0 = i * w;
    const uc = u0 + w / 2;
    const tone = tones[i % tones.length];
    const ajar = open.includes(i);

    f.box(uc, 0.07, depth / 2, w - 0.01, 1.83, depth - 0.02, GUNMETAL);

    if (ajar) {
      // The door open on its hinge: a dark inside with a shelf and a hanger.
      f.box(uc, 0.14, depth - 0.02, w - 0.08, 1.7, 0.04, BLACK);
      f.box(uc, 1.2, depth - 0.1, w - 0.1, 0.02, depth - 0.16, STEEL);
      f.box(uc + 0.06, 0.5, depth - 0.1, 0.12, 0.55, 0.14, 0x4a4036);
      f.barAlong(uc, 1.75, depth - 0.08, w - 0.1, 0.015, STEEL_BARE);
      f.box(u0 + w - 0.005, 0.14, depth + 0.2, 0.015, 1.7, 0.4, tone);
    } else {
      f.box(uc, 0.12, depth - 0.005, w - 0.03, 1.74, 0.014, tone);
      // Vent slits near the top, a handle, a number plate.
      for (let k = 0; k < 3; k++) {
        f.box(
          uc,
          1.62 + k * 0.045,
          depth + 0.004,
          w - 0.16,
          0.014,
          0.006,
          BLACK,
        );
      }

      f.box(uc + w * 0.28, 0.95, depth + 0.012, 0.03, 0.12, 0.022, STEEL_BARE);
      f.box(uc, 1.43, depth + 0.006, 0.07, 0.04, 0.006, LABEL);

      // A dent or a scrape, now and then.
      if (random() < 0.3) {
        f.box(
          uc - 0.05,
          0.3 + random() * 0.9,
          depth + 0.009,
          0.1,
          0.012,
          0.004,
          0x1b1f26,
        );
      }
    }
  }

  // The back: seams between the lockers, a rib near each end and a worn plate.
  for (let i = 0; i <= count; i++) {
    f.box(i * w, 0.1, -0.003, 0.014, 1.8, 0.008, BLACK);
  }

  for (const k of [0.12, count * w - 0.12]) {
    f.box(k, 0.1, -0.006, 0.06, 1.8, 0.012, CHARCOAL);
  }

  f.box((count * w) / 2, 1.5, -0.006, 0.3, 0.08, 0.006, LABEL);

  // The top: a cap, with the odd thing left on it.
  f.box(
    (count * w) / 2,
    1.9,
    depth / 2,
    count * w,
    0.03,
    depth + 0.02,
    CHARCOAL,
  );
}
