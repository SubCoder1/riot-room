import { Pieces } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import {
  BLACK,
  CARDBOARD,
  CARDBOARD_B,
  CHARCOAL,
  GUNMETAL,
  LABEL,
  PAPER,
  RUST,
  STEEL,
  STEEL_BARE,
  STEEL_LIGHT,
  TIMBER,
  TIMBER_B,
  TIMBER_DARK,
} from "./RoomKit";

/**
 * The Armory's stash: the improvised weapons store the thugs have built up
 * (crates of three kinds, the worktable's guns and tools, a few shelf spares,
 * a trolley, a utility locker, some debris), and the twelve throwables it
 * holds: exactly four grenades, four smoke grenades and four Molotovs, each
 * drawn once by the props below (see `throwableCount`). They are scenery: no
 * pick-ups, and nothing changes in the inventory.
 *
 * Heights are above the floor. The middle of the room, between the shutter,
 * the hatch and the table, is left clear.
 */

export const OLIVE = 0x4a5236;
export const OLIVE_DARK = 0x3a4128;
export const SMOKE_GREY = 0x7a808a;
const RAG = 0xb9b49c;
export const WARN_ORANGE = 0x9a5a2a;
export const WARN_RED = 0x8a3a30;
export const HAZARD = 0x9a8836;
const STRAW = 0x7d704a;
const BRASS = 0xb08a3e;
const LOCKER = 0x4f5645;
const CLOTH = 0x6b6a5c;

// ============================================================ the throwables

export type ThrowableKind = "grenade" | "smoke" | "molotov";

/** Where each throwable lies (above the floor); they are the room's pick-ups, drawn by the game. */
interface Placed {
  type: ThrowableKind;
  x: number;
  bottom: number;
  z: number;
}

const placed: Placed[] = [];

/** Starts the list again (the Armory is being built). */
export function resetThrowableCount(): void {
  placed.length = 0;
}

/** How many of each throwable the Armory holds. */
export function throwableCount(): Readonly<Record<ThrowableKind, number>> {
  const count = { grenade: 0, smoke: 0, molotov: 0 };

  for (const item of placed) {
    count[item.type]++;
  }

  return count;
}

/**
 * Makes each throwable a pick-up (E to take it, as with the others): drawn as
 * its real item by the game, so nothing of it is drawn into the fittings.
 */
export function registerThrowablePickups(
  map: MapBuilder,
  floorY: number,
): void {
  const types = {
    grenade: "GRENADE",
    smoke: "SMOKE",
    molotov: "MOLOTOV",
  } as const;
  const seen = { grenade: 0, smoke: 0, molotov: 0 };

  for (const item of placed) {
    map.addPickup({
      id: `armory-${item.type}-${++seen[item.type]}`,
      type: types[item.type],
      x: item.x,
      y: floorY + item.bottom,
      z: item.z,
      amount: 1,
      respawn: STASH_RESPAWN,
    });
  }
}

/** A taken throwable stays gone until the next round (the game puts the stash back then). */
const STASH_RESPAWN = 1e9;

/** A grenade lying at (x, bottom, z). */
export function grenade(
  _p: Pieces,
  x: number,
  bottom: number,
  z: number,
): void {
  placed.push({ type: "grenade", x, bottom, z });
}

/** A smoke grenade lying at (x, bottom, z). */
export function smoke(_p: Pieces, x: number, bottom: number, z: number): void {
  placed.push({ type: "smoke", x, bottom, z });
}

/** A Molotov (a bottle with a rag in its neck) lying at (x, bottom, z). */
export function molotov(
  _p: Pieces,
  x: number,
  bottom: number,
  z: number,
): void {
  placed.push({ type: "molotov", x, bottom, z });
}

// ================================================================== helpers

/** A frame turned by `ry` about (cx, cz): pieces are placed in the crate's own axes. */
class Turned {
  private readonly p: Pieces;
  public readonly cx: number;
  public readonly cz: number;
  public readonly ry: number;

  public constructor(p: Pieces, cx: number, cz: number, ry: number) {
    this.p = p;
    this.cx = cx;
    this.cz = cz;
    this.ry = ry;
  }

  /** The world point of a local one. */
  public at(dx: number, dz: number): { x: number; z: number } {
    const c = Math.cos(this.ry);
    const s = Math.sin(this.ry);

    return { x: this.cx + dx * c + dz * s, z: this.cz - dx * s + dz * c };
  }

  public box(
    dx: number,
    bottom: number,
    dz: number,
    sx: number,
    sy: number,
    sz: number,
    color: number,
    ry = 0,
    rz = 0,
  ): void {
    const { x, z } = this.at(dx, dz);

    this.p.box(x, bottom, z, sx, sy, sz, color, this.ry + ry, rz);
  }
}

/** The world bounds of a w x d footprint turned by ry (for a collider). */
function bounds(
  cx: number,
  cz: number,
  w: number,
  d: number,
  ry: number,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const c = Math.abs(Math.cos(ry));
  const s = Math.abs(Math.sin(ry));
  const hx = (w * c + d * s) / 2;
  const hz = (w * s + d * c) / 2;

  return { minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz };
}

/** A steel ammunition can: olive, with a latch and a stencilled plate. */
export function ammoCan(
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

/**
 * An open ammunition can: a body 14 cm tall under a 2 cm rim, with the dark
 * inside recessed between them (nothing shares a plane, so nothing flickers).
 */
function canOpen(
  p: Pieces,
  cx: number,
  bottom: number,
  cz: number,
  ry: number,
): void {
  const t = new Turned(p, cx, cz, ry);

  t.box(0, bottom, 0, 0.3, 0.14, 0.15, OLIVE_DARK);
  t.box(0, bottom + 0.14, 0, 0.3, 0.02, 0.016, OLIVE);
  t.box(0, bottom + 0.14, 0.067, 0.3, 0.02, 0.016, OLIVE);
  t.box(-0.142, bottom + 0.14, 0.033, 0.016, 0.02, 0.05, OLIVE);
  t.box(0.142, bottom + 0.14, 0.033, 0.016, 0.02, 0.05, OLIVE);
  t.box(0, bottom + 0.14, -0.067, 0.3, 0.02, 0.016, OLIVE);
  t.box(-0.142, bottom + 0.14, -0.033, 0.016, 0.02, 0.05, OLIVE);
  t.box(0.142, bottom + 0.14, -0.033, 0.016, 0.02, 0.05, OLIVE);
  t.box(0, bottom + 0.14, 0, 0.26, 0.008, 0.11, 0x1b1d17);
  // The lid, open and lying back against the can's far side.
  t.box(0, bottom + 0.165, -0.1, 0.3, 0.018, 0.14, OLIVE);
  t.box(0, bottom + 0.183, -0.04, 0.12, 0.012, 0.016, STEEL_BARE);
}

/** An ammunition can that has been emptied: lid thrown back, nothing in it. */
function emptyAmmoCan(p: Pieces, cx: number, cz: number, ry: number): void {
  canOpen(p, cx, 0, cz, ry);
}

/** A small cardboard box of rounds. */
function roundsBox(
  p: Pieces,
  x: number,
  bottom: number,
  z: number,
  ry: number,
): void {
  p.box(x, bottom, z, 0.1, 0.05, 0.07, CARDBOARD, ry);
  p.box(x, bottom + 0.05, z, 0.104, 0.006, 0.074, CARDBOARD_B, ry);
  p.box(x, bottom + 0.02, z, 0.06, 0.02, 0.0725, LABEL, ry);
}

/** A magazine, lying flat. */
function magazine(
  p: Pieces,
  x: number,
  bottom: number,
  z: number,
  ry: number,
): void {
  p.box(x, bottom, z, 0.12, 0.028, 0.04, STEEL, ry);
  p.box(x, bottom + 0.028, z, 0.12, 0.006, 0.036, BLACK, ry);
}

type Gun = "pistol" | "shotgun" | "smg";

/** A gun lying on its side on a surface, its barrel along local x. */
function gunFlat(
  p: Pieces,
  cx: number,
  bottom: number,
  cz: number,
  ry: number,
  kind: Gun,
): void {
  const t = new Turned(p, cx, cz, ry);

  if (kind === "pistol") {
    t.box(0, bottom, 0, 0.18, 0.026, 0.032, STEEL);
    t.box(0.097, bottom + 0.004, 0, 0.02, 0.018, 0.018, BLACK);
    t.box(-0.06, bottom, -0.055, 0.04, 0.026, 0.085, CHARCOAL, 0.25);
    t.box(0.01, bottom, -0.028, 0.06, 0.02, 0.012, GUNMETAL);
  } else if (kind === "smg") {
    t.box(0, bottom, 0, 0.3, 0.045, 0.04, GUNMETAL);
    t.box(0.2, bottom + 0.012, 0, 0.12, 0.02, 0.02, BLACK);
    t.box(0.03, bottom, -0.075, 0.04, 0.04, 0.1, STEEL, 0.2);
    t.box(-0.2, bottom + 0.005, 0, 0.12, 0.02, 0.035, CHARCOAL);
    t.box(0.08, bottom, 0.045, 0.06, 0.03, 0.05, CHARCOAL);
  } else {
    // A pump shotgun: barrel, magazine tube, receiver, pump and a timber stock.
    t.box(0.28, bottom, 0, 0.5, 0.03, 0.03, GUNMETAL);
    t.box(0.25, bottom, 0.032, 0.44, 0.026, 0.026, STEEL);
    t.box(-0.02, bottom, 0.008, 0.2, 0.04, 0.05, STEEL);
    t.box(0.2, bottom, 0.02, 0.14, 0.036, 0.05, TIMBER_DARK);
    t.box(-0.3, bottom, 0.012, 0.36, 0.05, 0.04, TIMBER_B, 0.04);
    t.box(-0.49, bottom, 0.012, 0.03, 0.06, 0.05, BLACK, 0.04);
  }
}

// ================================================================== the crates

interface Crate {
  w: number;
  h: number;
  d: number;
}

/**
 * A closed, reinforced crate: rough timber boards with gaps, metal corners and
 * a strap, nail heads, a battened lid and a stencilled plate.
 */
function closedCrate(
  p: Pieces,
  cx: number,
  bottom: number,
  cz: number,
  { w, h, d }: Crate,
  ry: number,
  tint = 0,
): void {
  const t = new Turned(p, cx, cz, ry);
  const boards = 3;
  const bh = h / boards;

  t.box(0, bottom, 0, w - 0.02, h, d - 0.02, TIMBER_DARK);

  for (let k = 0; k < boards; k++) {
    const color = [TIMBER, TIMBER_B, TIMBER][(k + tint) % 3];

    t.box(0, bottom + k * bh + 0.008, 0, w, bh - 0.016, d, color);
  }

  // The lid and its battens.
  t.box(0, bottom + h - 0.01, 0, w + 0.04, 0.045, d + 0.04, TIMBER_DARK);

  for (const sx of [-1, 1]) {
    t.box(
      sx * (w / 2 - 0.1),
      bottom + h + 0.035,
      0,
      0.07,
      0.02,
      d + 0.04,
      TIMBER_B,
    );
  }

  // Metal corners and a strap round the middle.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      t.box(sx * (w / 2), bottom, sz * (d / 2), 0.05, h, 0.05, GUNMETAL);
    }
  }

  t.box(0, bottom + h * 0.42, 0, w + 0.03, 0.045, d + 0.03, 0x3a3f46);

  // Nails along the lowest board, and a worn stencil plate.
  for (const dx of [-0.25, -0.12, 0, 0.12, 0.25]) {
    t.box(dx, bottom + 0.06, d / 2 + 0.004, 0.018, 0.018, 0.01, STEEL_BARE);
  }

  t.box(w * 0.12, bottom + h * 0.68, d / 2 + 0.004, 0.2, 0.09, 0.008, HAZARD);
  t.box(w * 0.12, bottom + h * 0.72, d / 2 + 0.009, 0.14, 0.012, 0.004, BLACK);
  // A rust streak down one corner.
  t.box(
    -w / 2 + 0.07,
    bottom + 0.05,
    d / 2 + 0.003,
    0.03,
    h - 0.1,
    0.006,
    RUST,
  );
}

/**
 * An open supply crate: slatted sides, packing straw, and what is in it
 * showing over the rim. `fill` places the contents (straw top at `top`).
 */
function openCrate(
  p: Pieces,
  cx: number,
  bottom: number,
  cz: number,
  { w, h, d }: Crate,
  ry: number,
  fill: (t: Turned, top: number) => void,
  mark: "grenade" | "bottle" | "weapons",
  lid = true,
): void {
  const t = new Turned(p, cx, cz, ry);

  t.box(0, bottom, 0, w - 0.04, 0.03, d - 0.04, TIMBER_DARK);

  for (const sz of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      t.box(
        0,
        bottom + k * (h / 2) + 0.01,
        sz * (d / 2 - 0.015),
        w,
        h / 2 - 0.02,
        0.03,
        k ? TIMBER : TIMBER_B,
      );
    }
  }

  for (const sx of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      t.box(
        sx * (w / 2 - 0.015),
        bottom + k * (h / 2) + 0.01,
        0,
        0.03,
        h / 2 - 0.02,
        d - 0.06,
        k ? TIMBER_B : TIMBER,
      );
    }

    for (const sz of [-1, 1]) {
      t.box(
        sx * (w / 2 - 0.02),
        bottom,
        sz * (d / 2 - 0.02),
        0.05,
        h + 0.03,
        0.05,
        TIMBER_DARK,
      );
    }
  }

  // Packing straw and a stencil on the front.
  const top = bottom + h * 0.55;

  t.box(0, bottom + 0.03, 0, w - 0.1, top - bottom - 0.03, d - 0.1, STRAW);
  // What it is for, painted on the front: a panel and a pictogram.
  const panelY = bottom + h * 0.3;
  const panelX = -w * 0.15;

  t.box(
    panelX,
    panelY,
    d / 2 + 0.003,
    0.3,
    0.13,
    0.006,
    mark === "grenade" ? OLIVE : mark === "weapons" ? CHARCOAL : WARN_ORANGE,
  );
  t.box(panelX, panelY + 0.02, d / 2 + 0.008, 0.26, 0.012, 0.004, LABEL);

  if (mark === "grenade") {
    t.box(panelX, panelY + 0.04, d / 2 + 0.008, 0.05, 0.06, 0.004, BLACK);
    t.box(
      panelX + 0.02,
      panelY + 0.1,
      d / 2 + 0.008,
      0.015,
      0.03,
      0.004,
      BLACK,
    );
  } else if (mark === "weapons") {
    t.box(panelX, panelY + 0.05, d / 2 + 0.008, 0.16, 0.025, 0.004, LABEL);
    t.box(
      panelX - 0.05,
      panelY + 0.02,
      d / 2 + 0.008,
      0.03,
      0.05,
      0.004,
      LABEL,
    );
  } else {
    t.box(panelX, panelY + 0.035, d / 2 + 0.008, 0.035, 0.05, 0.004, BLACK);
    t.box(panelX, panelY + 0.085, d / 2 + 0.008, 0.015, 0.035, 0.004, BLACK);
  }

  // The lid, prised off and dropped on the floor beside it.
  if (lid) {
    t.box(w / 2 + 0.4, bottom, 0.08, w - 0.1, 0.03, d - 0.1, TIMBER_DARK, 0.25);
    t.box(
      w / 2 + 0.4,
      bottom + 0.03,
      0.08,
      0.07,
      0.02,
      d - 0.1,
      TIMBER_B,
      0.25,
    );
  }

  fill(t, top);
}

/**
 * A damaged crate: a missing board, a swung-out one, a caved-in lid and
 * planks and splinters on the floor beside it.
 */
function brokenCrate(
  p: Pieces,
  cx: number,
  bottom: number,
  cz: number,
  { w, h, d }: Crate,
  ry: number,
): void {
  const t = new Turned(p, cx, cz, ry);
  const half = h / 2;

  // The floor, cracked in two.
  t.box(0, bottom, -d / 4, w - 0.04, 0.03, d / 2 - 0.02, TIMBER_DARK);
  t.box(0.03, bottom, d / 4, w - 0.1, 0.03, d / 2 - 0.04, TIMBER_DARK, 0.05);

  // Back and left sides whole; the right side keeps only its lower board.
  for (let k = 0; k < 2; k++) {
    const y = bottom + k * half + 0.01;

    t.box(0, y, -(d / 2 - 0.015), w, half - 0.02, 0.03, k ? TIMBER_B : TIMBER);
    t.box(
      -(w / 2 - 0.015),
      y,
      0,
      0.03,
      half - 0.02,
      d - 0.06,
      k ? TIMBER : TIMBER_B,
    );
  }

  t.box(w / 2 - 0.015, bottom + 0.01, 0, 0.03, half - 0.02, d - 0.06, TIMBER_B);
  // The front: a lower board, and the upper one swung out on a single nail.
  t.box(0, bottom + 0.01, d / 2 - 0.015, w, half - 0.02, 0.03, TIMBER);
  t.box(
    -0.06,
    bottom + half + 0.01,
    d / 2 + 0.07,
    w - 0.08,
    half - 0.02,
    0.03,
    TIMBER_B,
    0.32,
  );
  t.box(
    -w / 2 + 0.03,
    bottom + half,
    d / 2 - 0.015,
    0.02,
    0.02,
    0.05,
    STEEL_BARE,
  );

  // Corner posts, one snapped short.
  for (const [sx, sz, tall] of [
    [-1, -1, 1],
    [1, -1, 1],
    [-1, 1, 1],
    [1, 1, 0.55],
  ] as const) {
    t.box(
      sx * (w / 2 - 0.02),
      bottom,
      sz * (d / 2 - 0.02),
      0.05,
      (h + 0.03) * tall,
      0.05,
      TIMBER_DARK,
    );
  }

  // The lid: one plank in place, one split in the middle and caved in, one
  // gone. Each broken half rests on the rim at its outer end.
  const rim = bottom + h;
  const lid = w / 2 - 0.02;
  const sag = 0.3;
  const drop = (lid / 2) * Math.sin(sag);

  t.box(0, rim - 0.01, -d / 3, w + 0.03, 0.03, 0.17, TIMBER_B);
  t.box(
    -w / 4 - 0.01,
    rim - 0.01 - drop,
    0.02,
    lid,
    0.03,
    0.17,
    TIMBER,
    0,
    -sag,
  );
  t.box(w / 4 + 0.01, rim - 0.01 - drop, 0.02, lid, 0.03, 0.17, TIMBER, 0, sag);
  // Straw in it, spilling out of the open side.
  t.box(0.05, bottom + 0.03, 0.05, w - 0.18, h * 0.35, d - 0.2, STRAW);
  t.box(w / 2 + 0.12, bottom, 0.02, 0.22, 0.04, 0.2, STRAW, 0.4);
  // The missing board, and its splinters, on the floor beside it.
  t.box(w / 2 + 0.38, bottom, 0.3, 0.12, 0.022, w - 0.1, TIMBER, 0.55);
  t.box(w / 2 + 0.5, bottom, -0.3, 0.09, 0.02, 0.38, TIMBER_B, -0.35);
  t.box(w / 2 + 0.22, bottom, -0.45, 0.04, 0.012, 0.18, TIMBER_DARK, 1.1);
  t.box(w / 2 + 0.3, bottom, 0.62, 0.03, 0.012, 0.13, TIMBER_DARK, 0.2);
}

/** A hand trolley standing against the south wall, its handle leaning back to it. */
function handTrolley(p: Pieces, cx: number, wallZ: number): void {
  const lean = 0.2;
  const zc = wallZ - 0.3;
  const foot = zc - 0.55 * Math.sin(lean);

  // The two uprights, tipped back toward the wall.
  for (const sx of [-1, 1]) {
    p.elements.push({
      shape: "plank",
      x: cx + sx * 0.2,
      y: 0.09 + 0.55,
      z: zc,
      sx: 0.035,
      sy: 1.1,
      sz: 0.035,
      rx: lean,
      ry: 0,
      rz: 0,
      color: STEEL,
    });
  }

  // The nose plate on the floor, cross bars, a handle and two wheels.
  p.box(cx, 0.06, foot - 0.12, 0.44, 0.02, 0.26, GUNMETAL);

  for (const y of [0.45, 0.8]) {
    p.box(
      cx,
      y,
      zc + (y + 0.01 - 0.64) * Math.tan(lean),
      0.4,
      0.025,
      0.025,
      STEEL_BARE,
    );
  }

  p.bar(cx, 1.19, zc + 0.55 * Math.sin(lean), 0.5, 0.03, RUST);

  for (const sx of [-1, 1]) {
    p.box(cx + sx * 0.28, 0, foot + 0.06, 0.05, 0.18, 0.18, BLACK);
  }
}

/** A tall steel utility locker against the south wall, one door ajar. */
function utilityLocker(p: Pieces, cx: number, wallZ: number): void {
  const w = 0.6;
  const d = 0.5;
  const front = wallZ - d;
  const zc = wallZ - d / 2;

  p.box(cx, 0, zc, w, 1.8, d, LOCKER);
  p.box(cx, 1.8, zc, w + 0.02, 0.025, d + 0.02, GUNMETAL);
  // Left door shut, with its vents and a latch; the right ajar, dented.
  p.box(cx - 0.15, 0.04, front - 0.012, 0.28, 1.72, 0.02, 0x5a6250);

  for (let k = 0; k < 4; k++) {
    p.box(cx - 0.15, 1.45 + k * 0.05, front - 0.024, 0.18, 0.015, 0.006, BLACK);
  }

  p.box(cx - 0.04, 0.9, front - 0.026, 0.03, 0.12, 0.014, STEEL_BARE);

  const open = 0.9;
  const leaf = 0.28;
  const hingeX = cx + w / 2 - 0.01;

  p.box(
    hingeX - (Math.cos(open) * leaf) / 2,
    0.04,
    front - (Math.sin(open) * leaf) / 2 - 0.01,
    leaf,
    1.72,
    0.02,
    0x586048,
    -open,
  );
  // The dark inside, a shelf and a rag, and a rust bloom low on the side.
  p.box(cx + 0.15, 0.04, zc, 0.26, 1.72, d - 0.06, 0x1d1f1a);
  p.box(cx + 0.15, 1.0, zc, 0.26, 0.02, d - 0.08, STEEL);
  p.box(cx + 0.14, 1.02, zc + 0.05, 0.18, 0.04, 0.14, CLOTH, 0.3);
  p.box(cx - w / 2 - 0.004, 0.0, zc, 0.01, 0.4, d - 0.04, RUST);
}

// ================================================================ the table

/** The worktable's top is at 0.91; this lays the guns and tools out on it. */
export function tableClutter(p: Pieces, cx: number, cz: number): void {
  const top = 0.91;

  // A shallow tray at the west end: a grenade, spare magazines and rounds.
  p.box(cx - 0.8, top, cz - 0.2, 0.5, 0.02, 0.3, STEEL_LIGHT);

  for (const sz of [-1, 1]) {
    p.box(
      cx - 0.8,
      top + 0.02,
      cz - 0.2 + sz * 0.14,
      0.5,
      0.04,
      0.02,
      STEEL_LIGHT,
    );
  }

  for (const sx of [-1, 1]) {
    p.box(
      cx - 0.8 + sx * 0.24,
      top + 0.02,
      cz - 0.2,
      0.02,
      0.04,
      0.26,
      STEEL_LIGHT,
    );
  }

  grenade(p, cx - 0.92, top + 0.02, cz - 0.2);
  magazine(p, cx - 0.74, top + 0.02, cz - 0.28, 0.2);
  magazine(p, cx - 0.7, top + 0.02, cz - 0.15, -0.3);
  roundsBox(p, cx - 0.84, top + 0.02, cz - 0.1, 0.1);

  // The guns, laid down at slightly different angles.
  gunFlat(p, cx, top, cz + 0.1, 0.25, "shotgun");
  gunFlat(p, cx - 0.7, top, cz + 0.3, -0.7, "pistol");
  gunFlat(p, cx + 0.62, top, cz + 0.38, 2.6, "pistol");
  gunFlat(p, cx + 0.55, top, cz - 0.32, -0.2, "smg");

  // Loose magazines and boxes of rounds, an open ammunition can.
  magazine(p, cx + 0.25, top, cz + 0.42, 0.3);
  magazine(p, cx + 0.37, top, cz + 0.4, -0.2);
  roundsBox(p, cx - 0.2, top, cz + 0.47, 0.4);
  roundsBox(p, cx - 0.1, top, cz + 0.5, -0.1);
  canOpen(p, cx - 0.15, top, cz - 0.32, 0.2);

  // Cartridges by the rounds, and two rifle magazines.
  for (let k = 0; k < 5; k++) {
    cartridge(p, cx + 0.02 + k * 0.045, top, cz + 0.53);
  }

  rifleMagazine(p, cx + 0.3, top, cz + 0.27, 0.4);
  rifleMagazine(p, cx - 0.5, top, cz + 0.02, 0.9);

  // The other two throwables: a smoke grenade and a Molotov.
  smoke(p, cx + 0.85, top, cz - 0.05);
  molotov(p, cx + 0.95, top, cz - 0.38);

  // Tools and a rag.
  p.box(cx - 0.3, top, cz - 0.05, 0.18, 0.012, 0.02, STEEL_BARE, 0.4);
  p.box(cx - 0.36, top, cz - 0.08, 0.04, 0.012, 0.04, STEEL_BARE, 0.4);
  p.box(cx + 0.2, top, cz - 0.12, 0.12, 0.012, 0.012, STEEL_BARE, -0.5);
  p.box(cx + 0.14, top, cz - 0.1, 0.07, 0.02, 0.02, WARN_RED, -0.5);
  p.box(cx + 0.85, top, cz + 0.2, 0.22, 0.012, 0.16, CLOTH, 0.5);
  p.box(cx + 0.87, top + 0.012, cz + 0.2, 0.12, 0.01, 0.1, 0x5f5e50, 0.1);
  p.box(cx + 0.12, top, cz - 0.45, 0.26, 0.012, 0.2, PAPER, 0.15);
}

/** A rifle magazine, lying flat: a long steel box with a curve at one end. */
function rifleMagazine(
  p: Pieces,
  x: number,
  bottom: number,
  z: number,
  ry: number,
): void {
  const t = new Turned(p, x, z, ry);

  t.box(0, bottom, 0, 0.2, 0.028, 0.065, STEEL);
  t.box(0.09, bottom, 0.012, 0.05, 0.028, 0.065, STEEL, 0.25);
  t.box(0, bottom + 0.028, 0, 0.2, 0.005, 0.06, BLACK);
}

/** A cartridge standing on its base. */
function cartridge(p: Pieces, x: number, bottom: number, z: number): void {
  p.post(x, bottom, z, 0.04, 0.012, BRASS);
  p.post(x, bottom + 0.04, z, 0.012, 0.01, 0x6a4a38);
}

/** A closed military ammunition box: olive steel, a latch, a faded stencil. */
function ammoBox(
  p: Pieces,
  cx: number,
  bottom: number,
  cz: number,
  ry: number,
): void {
  const t = new Turned(p, cx, cz, ry);

  t.box(0, bottom, 0, 0.5, 0.28, 0.28, OLIVE);
  t.box(0, bottom + 0.28, 0, 0.52, 0.02, 0.3, OLIVE_DARK);
  t.box(0, bottom + 0.3, 0, 0.18, 0.02, 0.03, STEEL_BARE);
  // Rope handles at the ends, a latch at the front and a stencil.
  for (const sx of [-1, 1]) {
    t.box(sx * 0.255, bottom + 0.12, 0, 0.012, 0.06, 0.1, GUNMETAL);
  }

  t.box(0, bottom + 0.16, 0.144, 0.05, 0.08, 0.012, STEEL_BARE);
  t.box(-0.1, bottom + 0.06, 0.143, 0.22, 0.07, 0.006, 0x8a8f6a);
  t.box(-0.1, bottom + 0.085, 0.147, 0.16, 0.012, 0.004, BLACK);
}

/**
 * An open military ammunition crate: an olive steel box with a rolled rim, rope
 * handles at the ends and latches on the front, its lid hinged on the wall side
 * and standing up behind it, and the rounds packed in rows inside.
 */
function ammoCrateOpen(p: Pieces, cx: number, cz: number, ry: number): void {
  const t = new Turned(p, cx, cz, ry);
  const w = 0.6;
  const d = 0.36;
  const h = 0.32;
  const wall = 0.025;

  // The shell: a floor and four walls, so it has an inside.
  t.box(0, 0, 0, w, 0.03, d, OLIVE_DARK);

  for (const sz of [-1, 1]) {
    t.box(0, 0, sz * (d / 2 - wall / 2), w, h, wall, OLIVE_DARK);
  }

  for (const sx of [-1, 1]) {
    t.box(sx * (w / 2 - wall / 2), 0, 0, wall, h, d - wall * 2, OLIVE_DARK);
  }

  // A rolled rim round the top, a little lighter where it is worn.
  const rim = 0.022;

  for (const sz of [-1, 1]) {
    t.box(0, h - 0.012, sz * (d / 2 - rim / 2), w + 0.012, 0.024, rim, OLIVE);
  }

  for (const sx of [-1, 1]) {
    t.box(sx * (w / 2 - rim / 2), h - 0.012, 0, rim, 0.024, d - rim * 2, OLIVE);
  }

  // Inside: the rounds, boxed and packed in two rows to just under the rim,
  // with a cartridge belt laid over them.
  t.box(0, 0.03, 0, w - wall * 2, 0.05, d - wall * 2, 0x14160f);

  for (const dx of [-0.2, 0, 0.2]) {
    for (const dz of [-0.08, 0.08]) {
      const at = t.at(dx, dz);

      roundsBox(p, at.x, 0.08, at.z, ry + (dx > 0 ? 0.05 : -0.04));
      roundsBox(p, at.x, 0.13, at.z, ry + (dx - dz) * 0.2);
    }
  }

  t.box(0, h - 0.06, -0.05, w - 0.1, 0.012, 0.03, BRASS, 0.08);

  for (let k = 0; k < 9; k++) {
    t.box(
      -0.22 + k * 0.055,
      h - 0.075,
      -0.05 + k * 0.004,
      0.014,
      0.03,
      0.014,
      BRASS,
    );
  }

  // Rope handles at both ends, latches and a faded stencil on the front.
  for (const sx of [-1, 1]) {
    t.box(sx * (w / 2 + 0.008), 0.17, 0, 0.012, 0.02, 0.14, GUNMETAL);
    t.box(sx * (w / 2 + 0.008), 0.12, -0.065, 0.012, 0.07, 0.014, GUNMETAL);
    t.box(sx * (w / 2 + 0.008), 0.12, 0.065, 0.012, 0.07, 0.014, GUNMETAL);
  }

  for (const dx of [-0.17, 0.17]) {
    t.box(dx, 0.2, -d / 2 - 0.006, 0.05, 0.07, 0.012, STEEL_BARE);
  }

  t.box(0, 0.07, -d / 2 - 0.004, 0.24, 0.08, 0.006, 0x8a8f6a);
  t.box(0, 0.095, -d / 2 - 0.008, 0.18, 0.012, 0.004, BLACK);
  t.box(0, 0.07, -d / 2 - 0.008, 0.12, 0.01, 0.004, BLACK);

  // The lid: hinged along the wall side of the rim, standing up behind the crate
  // and leaning back a little (a hair past upright).
  const hingeZ = d / 2;
  const open = 1.75;
  const lid = 0.3;
  const centre = t.at(0, hingeZ + lid * 0.05);

  p.box(
    centre.x,
    h + (lid / 2) * Math.sin(open) - 0.01,
    centre.z,
    w + 0.016,
    0.02,
    lid,
    OLIVE,
    ry,
    0,
    open,
  );
  p.box(
    centre.x,
    h + (lid / 2) * Math.sin(open) - 0.01,
    centre.z - 0.012,
    w - 0.1,
    0.016,
    lid - 0.1,
    OLIVE_DARK,
    ry,
    0,
    open,
  );
}

/** The weapons crate: parts and spares of a rifle and a pistol, lying in the straw. */
function weaponsCrate(p: Pieces, t: Turned, floor: number): void {
  // The parts lie on sacking, up near the rim, so they show.
  t.box(0, floor, 0, 0.5, 0.1, 0.38, CLOTH, 0.1);

  const top = floor + 0.1;

  // A rifle in pieces: barrel, receiver, stock; and a handgun with its magazine.
  t.box(-0.02, top, -0.12, 0.46, 0.028, 0.028, GUNMETAL, 0.12);
  t.box(0.08, top, 0.0, 0.2, 0.045, 0.05, STEEL, 0.12);
  t.box(-0.18, top, 0.1, 0.24, 0.05, 0.04, TIMBER_B, -0.2);
  const m = t.at(0.16, 0.14);

  rifleMagazine(p, m.x, top, m.z, t.ry + 0.5);

  const g = t.at(-0.2, -0.1);

  gunFlat(p, g.x, top, g.z, t.ry + 2.2, "pistol");
}

// ============================================================ crate contents

/** The open crate of grenades: two grenades and a smoke grenade, and supplies. */
function grenadeCrate(p: Pieces, t: Turned, top: number): void {
  const a = t.at(-0.2, -0.05);
  const b = t.at(0.05, 0.08);
  const c = t.at(0.27, -0.1);
  const r = t.at(0.1, -0.2);

  grenade(p, a.x, top, a.z);
  grenade(p, b.x, top, b.z);
  smoke(p, c.x, top, c.z);
  t.box(-0.28, top, 0.16, 0.2, 0.025, 0.13, CLOTH, 0.3);
  roundsBox(p, r.x, top, r.z, t.ry + 0.3);
}

/** The open crate of bottles: two Molotovs and a smoke grenade, and supplies. */
function bottleCrate(p: Pieces, t: Turned, top: number): void {
  const a = t.at(-0.2, 0.0);
  const b = t.at(0.0, -0.1);
  const c = t.at(0.2, 0.05);
  const m = t.at(0.2, -0.18);
  const n = t.at(-0.28, -0.15);

  molotov(p, a.x, top, a.z);
  molotov(p, b.x, top, b.z);
  smoke(p, c.x, top, c.z);
  t.box(-0.05, top, 0.14, 0.24, 0.02, 0.14, RAG, 0.2);
  magazine(p, m.x, top, m.z, t.ry + 0.1);
  magazine(p, n.x, top, n.z, t.ry - 0.4);
}

// ================================================================= the room

/** The stash's crates and clutter, set in the Armory. */
export function furnishArmoryStash(map: MapBuilder, floorY: number): void {
  const F = floorY;

  // ----------------------------- north wall, between the locker and the cans
  {
    const p = new Pieces();

    // Two closed crates, one on the other.
    closedCrate(p, -25.9, 0, 5.82, { w: 0.9, h: 0.5, d: 0.7 }, 0.08, 0);
    openCrate(
      p,
      -25.85,
      0.55,
      5.8,
      { w: 0.62, h: 0.38, d: 0.5 },
      -0.18,
      (t, top) => weaponsCrate(p, t, top),
      "weapons",
      false,
    );
    // The open crate of grenades.
    openCrate(
      p,
      -24.45,
      0,
      5.85,
      { w: 0.8, h: 0.42, d: 0.6 },
      -0.12,
      (t, top) => grenadeCrate(p, t, top),
      "grenade",
    );
    // The damaged one, by the ammunition stack.
    brokenCrate(p, -23.0, 0, 5.86, { w: 0.78, h: 0.46, d: 0.6 }, 0.18);
    map.createFitting("armory-crates-north", F, p.elements, [
      // (Already measured from the crates themselves: kept as they are.)
      { ...bounds(-25.9, 5.82, 0.9, 0.7, 0.08), top: 0.95, exact: true },
      { ...bounds(-24.45, 5.85, 0.8, 0.6, -0.12), top: 0.42, exact: true },
      { ...bounds(-23.0, 5.86, 0.78, 0.6, 0.18), top: 0.5, exact: true },
      // The 0.5 m between the first two is too narrow for a body: a low block
      // there, so nobody can wedge a foot into it and hang on the rims.
      {
        minX: -25.42,
        maxX: -24.88,
        minZ: 5.55,
        maxZ: 6.1,
        top: 0.3,
        exact: true,
      },
    ]);
  }

  // ------------------------------------------- west of the table, by the bays
  {
    const p = new Pieces();

    closedCrate(p, -29.8, 0, 8.3, { w: 0.8, h: 0.55, d: 0.6 }, 0.35, 2);
    closedCrate(p, -29.73, 0.6, 8.28, { w: 0.5, h: 0.36, d: 0.42 }, 0.9, 0);
    map.createFitting("armory-crates-west", F, p.elements, [
      { ...bounds(-29.8, 8.3, 0.8, 0.6, 0.35), top: 0.98 },
    ]);
  }

  {
    const p = new Pieces();

    openCrate(
      p,
      -29.2,
      0,
      10.6,
      { w: 0.7, h: 0.4, d: 0.5 },
      0.5,
      (t, top) => bottleCrate(p, t, top),
      "bottle",
    );
    map.createFitting("armory-crate-bottles", F, p.elements, [
      { ...bounds(-29.2, 10.6, 0.7, 0.5, 0.5), top: 0.4 },
    ]);
  }

  // ----------------------------------------- the south wall: locker, trolley
  {
    const p = new Pieces();

    utilityLocker(p, -23.6, 11.98);
    handTrolley(p, -22.3, 11.98);
    map.createFitting("armory-south-kit", F, p.elements, [
      { minX: -23.9, maxX: -23.3, minZ: 11.48, maxZ: 11.98, top: 1.8 },
      { minX: -22.62, maxX: -21.98, minZ: 11.35, maxZ: 11.9, top: 1.2 },
    ]);
  }

  // ------------------- the ammunition stash: an open crate and closed boxes
  {
    const p = new Pieces();

    ammoCrateOpen(p, -24.45, 11.68, 0.05);
    ammoBox(p, -21.2, 0, 11.62, 0.1);
    ammoBox(p, -21.18, 0.3, 11.6, -0.12);
    map.createFitting("armory-ammo-stash", F, p.elements, [
      { ...bounds(-24.45, 11.68, 0.62, 0.4, 0.05), top: 0.36 },
      { ...bounds(-21.2, 11.62, 0.5, 0.28, 0.1), top: 0.62 },
    ]);
  }

  // ------------------------------ emptied ammunition cans, and loose debris
  {
    const p = new Pieces();

    emptyAmmoCan(p, -26.9, 6.55, 0.7);
    emptyAmmoCan(p, -23.8, 6.95, -0.4);
    emptyAmmoCan(p, -28.0, 10.9, 1.9);
    emptyAmmoCan(p, -21.95, 10.85, 0.2);
    // Loose boards and torn cardboard by the crates.
    p.box(-23.85, 0, 6.5, 0.72, 0.02, 0.1, TIMBER, 0.5);
    p.box(-23.25, 0, 6.6, 0.5, 0.02, 0.09, TIMBER_B, -0.3);
    p.box(-24.3, 0, 6.5, 0.3, 0.008, 0.22, CARDBOARD, 0.4);
    p.box(-29.95, 0, 8.2, 0.26, 0.008, 0.18, CARDBOARD_B, 1.0);
    map.createFitting("armory-debris", F, p.elements, []);
  }
}
