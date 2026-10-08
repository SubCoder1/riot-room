import {
  ARENA_HALF_X,
  ARENA_HALF_Z,
  allSolids,
  type ArenaLayout,
  type RampSolid,
  type Solid,
} from "./ArenaLayout";
import { ARENA_LAYOUT } from "./UpperFloorMap";

/** The tallest ledge a walking character steps up without jumping. */
export const STEP_UP = 0.45;

/** Parts a character vaults over: no floors, ledges or roofs. */
const VAULT_ROLES: ReadonlySet<string> = new Set([
  "wall",
  "railing",
  "prop",
  "machinery",
]);
const VAULT_MAX_RISE = 1.45;
const VAULT_MAX_DEPTH = 1.7;
/** At the top of a vault the feet are this far below the obstacle's top (the hips are over it). */
export const VAULT_SINK = 0.4;

export interface VaultPlan {
  /** Drawn top of the obstacle. */
  topY: number;
  /** Distances from the start (centre) to the obstacle's near and far edges. */
  near: number;
  far: number;
  /** Horizontal distance from the start to the landing. */
  distance: number;
  landFeet: number;
  /** Feet height at the end of the vault (the landing, or a little lower than the top). */
  endFeet: number;
  /** Feet height at the top of the arc. */
  clearFeet: number;
}

/**
 * How much clear height a standing character needs. A solid whose underside is
 * higher than the head (feet + this) is overhead, not in the way: a balcony
 * hanging over the arena, a roof over a room, a beam over a deck.
 */
export const HEADROOM = 1.8;

/** Walking down stairs or a ramp keeps the feet glued to the surface up to this drop. */
export const SNAP_DOWN = 0.4;

/**
 * How close the body's centre may get to scenery. The head/camera reach about
 * 0.4 m ahead of the centre (more when sprinting and looking down) and a fist
 * about 0.46 m, so this keeps both outside walls and cover.
 */
export const PLAYER_RADIUS = 0.5;

const NO_SURFACE = Number.NEGATIVE_INFINITY;

/** A wall, railing or post narrower than this (m) is not a surface to stand on. */
const THIN_TOP = 0.85;

/** A machinery box taller than this (m) counts as a post, not a step. */
const TALL_POST = 1.4;

/** Spatial lookup: cells of this size, and the furthest a query can reach past a solid's edge. */
const CELL_SIZE = 4;
const CELL_REACH = 1;
const CELL_OFFSET = 64;
const CELL_STRIDE = 256;

/** Horizontal distance from (x, z) to a rectangle (0 when inside). */
function distanceToRect(
  x: number,
  z: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): number {
  const dx = Math.max(minX - x, 0, x - maxX);
  const dz = Math.max(minZ - z, 0, z - maxZ);

  return Math.hypot(dx, dz);
}

function rampHeightAt(ramp: RampSolid, x: number, z: number): number {
  const cx = Math.min(Math.max(x, ramp.minX), ramp.maxX);
  const cz = Math.min(Math.max(z, ramp.minZ), ramp.maxZ);
  const sign = ramp.direction.startsWith("+") ? 1 : -1;
  const alongX = ramp.direction.endsWith("x");
  const low = alongX
    ? sign > 0
      ? ramp.minX
      : ramp.maxX
    : sign > 0
      ? ramp.minZ
      : ramp.maxZ;
  const length = alongX ? ramp.maxX - ramp.minX : ramp.maxZ - ramp.minZ;
  const along = alongX ? cx : cz;
  const t = Math.min(Math.max(((along - low) * sign) / length, 0), 1);

  return t * ramp.height;
}

/**
 * Collision for the arena. It works on the same layout the meshes are built
 * from. Everything is a height field over (x, z): the floor is 0, platforms and
 * cover are flat tops, ramps are inclined, and a character can walk onto a
 * surface at most STEP_UP above its feet. Anything taller is a wall until the
 * character is high enough (by jumping) to land on top of it.
 */
export class ArenaCollision {
  public readonly halfX = ARENA_HALF_X;
  public readonly halfZ = ARENA_HALF_Z;

  private readonly solids: Solid[];

  /** Solids that are open (a hatch that has been opened): they are not there. */
  private readonly opened = new Set<Solid>();

  /** Walls, railings, posts and lids too narrow to stand on: they block, but are no floor. */
  private readonly thin = new Set<Solid>();

  /** Solids sorted into coarse square cells, so a query only looks at its neighbours. */
  private readonly cells = new Map<number, Solid[]>();

  /** Solids that are not boxes or ramps (always checked). */
  private readonly loose: Solid[] = [];

  constructor(layout: ArenaLayout = ARENA_LAYOUT) {
    this.solids = allSolids(layout);

    for (const solid of this.solids) {
      // Walls, railings, hatch lids and tall posts too narrow to stand on. A low
      // box (a console, a maintenance box) is a step, however narrow it is.
      const standsTall =
        solid.kind === "box" &&
        solid.height - (solid.bottom ?? 0) > TALL_POST &&
        solid.role === "machinery";

      if (
        solid.kind === "box" &&
        (solid.role === "wall" ||
          solid.role === "railing" ||
          solid.role === "hatch" ||
          standsTall) &&
        Math.min(solid.maxX - solid.minX, solid.maxZ - solid.minZ) < THIN_TOP
      ) {
        this.thin.add(solid);
      }
    }

    // An opened hatch's lid is there only while the hatch is open.
    for (const hatch of layout.hatches) {
      const lid = this.solids.find((s) => s.id === `${hatch.id}-lid`);

      if (lid) {
        this.opened.add(lid);
      }
    }

    for (const solid of this.solids) {
      if (solid.kind === "cylinder") {
        this.loose.push(solid);

        continue;
      }

      const i0 = this.cellIndex(solid.minX - CELL_REACH);
      const i1 = this.cellIndex(solid.maxX + CELL_REACH);
      const j0 = this.cellIndex(solid.minZ - CELL_REACH);
      const j1 = this.cellIndex(solid.maxZ + CELL_REACH);

      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const key = j * CELL_STRIDE + i;
          const list = this.cells.get(key);

          if (list) {
            list.push(solid);
          } else {
            this.cells.set(key, [solid]);
          }
        }
      }
    }
  }

  private cellIndex(v: number): number {
    return Math.floor(v / CELL_SIZE) + CELL_OFFSET;
  }

  /**
   * The solids that can reach (x, z) within `margin` (at most CELL_REACH). Every
   * query is a point lookup in a cell, so the cost no longer grows with the map.
   */
  private near(x: number, z: number, margin: number): Solid[] {
    if (margin > CELL_REACH) {
      return this.solids;
    }

    const list = this.cells.get(
      this.cellIndex(z) * CELL_STRIDE + this.cellIndex(x),
    );

    if (!list) {
      return this.loose;
    }

    return this.loose.length ? [...list, ...this.loose] : list;
  }

  /**
   * The underside of the lowest solid over (x, z) that starts at or above
   * `headY`: the ceiling a rising head would hit (Infinity if there is none).
   * Anything already open (a hatch) is not there.
   */
  public ceilingHeight(
    x: number,
    z: number,
    headY: number,
    radius: number,
  ): number {
    let lowest = Number.POSITIVE_INFINITY;

    for (const solid of this.near(x, z, radius)) {
      const bottom = this.solidBottom(solid);

      if (
        bottom >= headY - 0.02 &&
        bottom < lowest &&
        this.solidHeight(solid, x, z, radius) > NO_SURFACE
      ) {
        lowest = bottom;
      }
    }

    return lowest;
  }

  /** Opens or shuts a solid by id (a hatch). Returns false if there is no such solid. */
  public setOpen(id: string, open: boolean): boolean {
    const solid = this.solids.find((s) => s.id === id);

    if (!solid) {
      return false;
    }

    // The lid stands up exactly when the panel leaves the roof.
    const lid = this.solids.find((s) => s.id === `${id}-lid`);

    if (lid) {
      if (open) {
        this.opened.delete(lid);
      } else {
        this.opened.add(lid);
      }
    }

    if (open) {
      this.opened.add(solid);
    } else {
      this.opened.delete(solid);
    }

    return true;
  }

  /** Underside of a solid: 0 for the usual column from the ground, higher for anything overhead. */
  private solidBottom(solid: Solid): number {
    return solid.kind === "ramp" ? 0 : (solid.bottom ?? 0);
  }

  /**
   * Does `solid` get in the way of a body of `margin` at (x, z)? Its top must be
   * above `topLimit` (not something to step onto) and its underside below
   * `headTop` (not overhead).
   */
  private obstructs(
    solid: Solid,
    x: number,
    z: number,
    margin: number,
    topLimit: number,
    headTop: number,
    body = true,
  ): boolean {
    const drawn = this.solidHeight(solid, x, z, margin);

    if (drawn === NO_SURFACE) {
      return false;
    }

    // A wall, railing or post is not a step: however low it is, once it is
    // above the feet it is in the way (a body does not wade into it).
    const limit = body && this.thin.has(solid) ? topLimit - STEP_UP : topLimit;

    // A railing stops a body higher than it is drawn.
    const top =
      body && solid.kind === "box" && solid.blockTop !== undefined
        ? Math.max(drawn, solid.blockTop)
        : drawn;

    return top > limit && this.solidBottom(solid) < headTop;
  }

  /** Top of one solid at (x, z), or NO_SURFACE if the circle of `margin` misses it. */
  private solidHeight(
    solid: Solid,
    x: number,
    z: number,
    margin: number,
  ): number {
    if (this.opened.has(solid)) {
      return NO_SURFACE;
    }

    if (solid.kind === "cylinder") {
      if (Math.hypot(x - solid.x, z - solid.z) <= solid.radius + margin) {
        return solid.height;
      }

      // A column built into a corner also holds up the square corner beyond
      // its circle, so standing on top never drops you through a gap by the walls.
      const touchesWalls =
        Math.abs(solid.x) + solid.radius >= ARENA_HALF_X - 0.1 &&
        Math.abs(solid.z) + solid.radius >= ARENA_HALF_Z - 0.1;

      if (
        touchesWalls &&
        (x - solid.x) * Math.sign(solid.x) >= 0 &&
        (z - solid.z) * Math.sign(solid.z) >= 0
      ) {
        return solid.height;
      }

      return NO_SURFACE;
    }

    if (
      distanceToRect(x, z, solid.minX, solid.maxX, solid.minZ, solid.maxZ) >
      margin
    ) {
      return NO_SURFACE;
    }

    return solid.kind === "ramp" ? rampHeightAt(solid, x, z) : solid.height;
  }

  /**
   * Height of the surface a character at (x, z) with its feet at `feetY` would
   * stand on: the highest surface that is no more than STEP_UP above the feet
   * (the floor if none).
   */
  public groundHeight(
    x: number,
    z: number,
    feetY: number,
    stepReach = 0,
  ): number {
    let ground = 0;

    for (const solid of this.near(x, z, stepReach)) {
      // Nobody stands on top of a wall, a railing or a post.
      if (this.thin.has(solid)) {
        continue;
      }

      let height = this.solidHeight(solid, x, z, 0);

      // A step is climbed as the feet meet it, not once the body's centre is
      // over it: a block just above the feet is stepped onto from `stepReach` away.
      if (
        height === NO_SURFACE &&
        stepReach > 0 &&
        solid.kind === "box" &&
        solid.height > feetY + 0.02
      ) {
        height = this.solidHeight(solid, x, z, stepReach);
      }

      if (height <= feetY + STEP_UP && height > ground) {
        ground = height;
      }
    }

    return ground;
  }

  /**
   * A vault over what is straight ahead (railing, low wall, box or bench): from
   * (x, z) along the unit direction (dx, dz), the obstacle's near and far edges
   * (distance from the centre), its drawn top, and where to land. Null if there
   * is nothing to vault, it is too high or too deep, or the far side is not free.
   */
  public findVault(
    x: number,
    z: number,
    dx: number,
    dz: number,
    feetY: number,
  ): VaultPlan | null {
    const topAt = (s: number): number => {
      const px = x + dx * s;
      const pz = z + dz * s;
      let top = NO_SURFACE;

      for (const solid of this.near(px, pz, 0)) {
        if (
          solid.kind !== "box" ||
          !VAULT_ROLES.has(solid.role ?? "floor") ||
          this.solidBottom(solid) >= feetY + 1
        ) {
          continue;
        }

        top = Math.max(top, this.solidHeight(solid, px, pz, 0));
      }

      return top;
    };
    const blocks = (s: number): boolean => topAt(s) - feetY > STEP_UP + 0.02;

    let near = -1;

    for (let s = 0.2; s <= PLAYER_RADIUS + 0.9; s += 0.05) {
      if (blocks(s)) {
        near = s;
        break;
      }
    }

    if (near < 0) {
      return null;
    }

    let topY = NO_SURFACE;
    let far = near;

    while (blocks(far)) {
      topY = Math.max(topY, topAt(far));
      far += 0.05;

      if (far - near > VAULT_MAX_DEPTH || topY - feetY > VAULT_MAX_RISE) {
        return null;
      }
    }

    if (topY - feetY < 0.5) {
      return null;
    }

    const distance = far + PLAYER_RADIUS + 0.1;
    const landX = x + dx * distance;
    const landZ = z + dz * distance;
    const landFeet = this.groundHeight(landX, landZ, topY);
    const clearFeet = topY - VAULT_SINK;
    const endFeet = Math.max(landFeet, clearFeet - 0.5);

    if (this.isBlocked(landX, landZ, endFeet, PLAYER_RADIUS)) {
      return null;
    }

    // Head room all along the way over.
    for (const s of [0, distance / 2, distance]) {
      const ceiling = this.ceilingHeight(
        x + dx * s,
        z + dz * s,
        feetY + 1,
        PLAYER_RADIUS - 0.1,
      );

      if (ceiling < clearFeet + HEADROOM + 0.05) {
        return null;
      }
    }

    return { topY, near, far, distance, landFeet, endFeet, clearFeet };
  }

  /** True if the feet at (x, z) are on or at a flight of stairs. */
  public onStairs(x: number, z: number, feetY: number): boolean {
    for (const solid of this.near(x, z, 0.3)) {
      if (!solid.id.includes("-step")) {
        continue;
      }

      const height = this.solidHeight(solid, x, z, 0.3);

      if (height !== NO_SURFACE && Math.abs(height - feetY) < 0.6) {
        return true;
      }
    }

    return false;
  }

  /** True if a character of `radius` at (x, z), feet at `feetY`, would be inside a wall. */
  public isBlocked(
    x: number,
    z: number,
    feetY: number,
    radius: number,
  ): boolean {
    if (
      Math.abs(x) > this.halfX - radius ||
      Math.abs(z) > this.halfZ - radius
    ) {
      return true;
    }

    for (const solid of this.near(x, z, radius)) {
      if (
        this.obstructs(
          solid,
          x,
          z,
          radius,
          feetY + STEP_UP + 1e-6,
          feetY + HEADROOM,
        )
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Moves by (dx, dz) and slides along whatever is in the way. The arena walls
   * and any solid too tall to step onto stop the move.
   */
  public moveHorizontal(
    x: number,
    z: number,
    dx: number,
    dz: number,
    feetY: number,
    radius = PLAYER_RADIUS,
  ): { x: number; z: number } {
    if (!this.isBlocked(x + dx, z + dz, feetY, radius)) {
      return { x: x + dx, z: z + dz };
    }

    // Slide along the surface that was hit, so a diagonal run round a corner
    // keeps going instead of stopping where both axes are blocked.
    const normal = this.contactNormal(x + dx, z + dz, feetY, radius);

    if (normal) {
      const into = dx * normal.x + dz * normal.z;

      if (into < 0) {
        // A tangent step can land fractionally inside the contact distance,
        // so also allow a small push outward along the normal.
        for (const push of [0, 0.02, 0.05]) {
          const sx = dx - into * normal.x + normal.x * push;
          const sz = dz - into * normal.z + normal.z * push;

          if (!this.isBlocked(x + sx, z + sz, feetY, radius)) {
            return { x: x + sx, z: z + sz };
          }
        }
      }
    }

    if (dx !== 0 && !this.isBlocked(x + dx, z, feetY, radius)) {
      return { x: x + dx, z };
    }

    if (dz !== 0 && !this.isBlocked(x, z + dz, feetY, radius)) {
      return { x, z: z + dz };
    }

    return { x, z };
  }

  /** Direction pointing away from the solid a blocked character at (x, z) is touching. */
  private contactNormal(
    x: number,
    z: number,
    feetY: number,
    radius: number,
  ): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bestDistance = Infinity;

    for (const solid of this.near(x, z, radius)) {
      if (
        !this.obstructs(
          solid,
          x,
          z,
          radius,
          feetY + STEP_UP + 1e-6,
          feetY + HEADROOM,
        )
      ) {
        continue;
      }

      let nx: number;
      let nz: number;

      if (solid.kind === "cylinder") {
        nx = x - solid.x;
        nz = z - solid.z;
      } else {
        nx = x - Math.min(Math.max(x, solid.minX), solid.maxX);
        nz = z - Math.min(Math.max(z, solid.minZ), solid.maxZ);
      }

      const length = Math.hypot(nx, nz);

      // Inside the shape (no usable direction) or farther than another hit.
      if (length < 1e-6 || length >= bestDistance) {
        continue;
      }

      bestDistance = length;
      best = { x: nx / length, z: nz / length };
    }

    return best;
  }

  /**
   * Pushes a character that has ended up inside a wall (for example shoved by
   * another body) back out, so nobody can get trapped in the scenery.
   */
  public pushOut(
    x: number,
    z: number,
    feetY: number,
    radius = PLAYER_RADIUS,
    topLimitGiven?: number,
    headTop = feetY + HEADROOM,
  ): { x: number; z: number } {
    // A body (no height given) is held by walls, railings and posts as such; the
    // camera (it gives its own height) only by what is at its height.
    const body = topLimitGiven === undefined;
    const topLimit = topLimitGiven ?? feetY + STEP_UP + 1e-6;
    let px = x;
    let pz = z;

    for (let pass = 0; pass < 4; pass++) {
      for (const solid of this.near(px, pz, radius)) {
        if (!this.obstructs(solid, px, pz, radius, topLimit, headTop, body)) {
          continue;
        }

        if (solid.kind === "cylinder") {
          let dx = px - solid.x;
          const dz = pz - solid.z;
          let distance = Math.hypot(dx, dz);

          // Dead centre has no direction to leave by: pick one.
          if (distance < 1e-6) {
            dx = 1;
            distance = 0;
          }

          const push = solid.radius + radius - distance;

          if (push > 0) {
            const length = distance || 1;

            px += (dx / length) * push;
            pz += (dz / length) * push;
          }

          continue;
        }

        const nearestX = Math.min(Math.max(px, solid.minX), solid.maxX);
        const nearestZ = Math.min(Math.max(pz, solid.minZ), solid.maxZ);
        const dx = px - nearestX;
        const dz = pz - nearestZ;
        const distance = Math.hypot(dx, dz);

        if (distance > 1e-6) {
          const push = radius - distance;

          if (push > 0) {
            px += (dx / distance) * push;
            pz += (dz / distance) * push;
          }

          continue;
        }

        // Centre is inside the footprint: leave by the nearest side.
        const exits: Array<[number, number, number]> = [
          [px - solid.minX, -1, 0],
          [solid.maxX - px, 1, 0],
          [pz - solid.minZ, 0, -1],
          [solid.maxZ - pz, 0, 1],
        ];
        const [depth, ex, ez] = exits.reduce((best, e) =>
          e[0] < best[0] ? e : best,
        );

        px += ex * (depth + radius);
        pz += ez * (depth + radius);
      }
    }

    const limitX = this.halfX - radius;
    const limitZ = this.halfZ - radius;

    px = Math.min(Math.max(px, -limitX), limitX);
    pz = Math.min(Math.max(pz, -limitZ), limitZ);

    // Pushing away from a corner column can land in the sealed corner behind
    // it, which is still inside the column's reach. If anything still holds
    // the character, walk it toward the middle of the arena until it is free.
    for (
      let n = 0;
      n < 40 && this.heldBySolid(px, pz, radius, topLimit, headTop, body);
      n++
    ) {
      const length = Math.hypot(px, pz) || 1;

      px -= (px / length) * 0.25;
      pz -= (pz / length) * 0.25;
    }

    return { x: px, z: pz };
  }

  private heldBySolid(
    x: number,
    z: number,
    radius: number,
    topLimit: number,
    headTop: number,
    body: boolean,
  ): boolean {
    return this.near(x, z, radius).some((solid) =>
      this.obstructs(solid, x, z, radius - 0.01, topLimit, headTop, body),
    );
  }

  /**
   * True if the straight line between two points passes through solid scenery
   * (cover, pillars, platforms, ramps, steps). A line over the top of a low
   * wall is clear; one through a block is not.
   */
  public segmentBlocked(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
  ): boolean {
    return this.segmentClearFraction(ax, ay, az, bx, by, bz) < 1;
  }

  /**
   * How much of the line from A to B is free before it enters scenery: 1 if
   * the whole line is clear, otherwise the fraction (0 to 1) up to the first
   * solid it meets. Used to stop arms and fists at walls.
   */
  public segmentClearFraction(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
  ): number {
    const length = Math.hypot(bx - ax, by - ay, bz - az);
    const samples = Math.max(1, Math.ceil(length / 0.1));

    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const z = az + (bz - az) * t;

      for (const solid of this.near(x, z, 0)) {
        // A little tolerance so grazing a top edge is not a block.
        if (
          this.solidHeight(solid, x, z, 0) > y + 0.02 &&
          this.solidBottom(solid) <= y
        ) {
          return i === 0 ? 0 : (i - 1) / samples;
        }
      }
    }

    return 1;
  }

  /** Distance from (x, z) to the nearest solid footprint (0 if inside one). */
  public clearanceAt(x: number, z: number): number {
    let nearest = Number.POSITIVE_INFINITY;

    for (const solid of this.solids) {
      const distance =
        solid.kind === "cylinder"
          ? Math.max(Math.hypot(x - solid.x, z - solid.z) - solid.radius, 0)
          : distanceToRect(
              x,
              z,
              solid.minX,
              solid.maxX,
              solid.minZ,
              solid.maxZ,
            );

      nearest = Math.min(nearest, distance);
    }

    return nearest;
  }

  /** Distance from (x, z) to the nearest outer wall. */
  public wallClearanceAt(x: number, z: number): number {
    return Math.min(this.halfX - Math.abs(x), this.halfZ - Math.abs(z));
  }
}
