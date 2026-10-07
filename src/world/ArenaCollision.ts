import {
  ARENA_HALF,
  ARENA_LAYOUT,
  allSolids,
  type ArenaLayout,
  type RampSolid,
  type Solid,
} from "./ArenaLayout";

/** The tallest ledge a walking character steps up without jumping. */
export const STEP_UP = 0.45;

/** Walking down stairs or a ramp keeps the feet glued to the surface up to this drop. */
export const SNAP_DOWN = 0.4;

/**
 * How close the body's centre may get to scenery. The head/camera reach about
 * 0.4 m ahead of the centre (more when sprinting and looking down) and a fist
 * about 0.46 m, so this keeps both outside walls and cover.
 */
export const PLAYER_RADIUS = 0.5;

const NO_SURFACE = Number.NEGATIVE_INFINITY;

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
  public readonly half = ARENA_HALF;

  private readonly solids: Solid[];

  constructor(layout: ArenaLayout = ARENA_LAYOUT) {
    this.solids = allSolids(layout);
  }

  /** Top of one solid at (x, z), or NO_SURFACE if the circle of `margin` misses it. */
  private solidHeight(
    solid: Solid,
    x: number,
    z: number,
    margin: number,
  ): number {
    if (solid.kind === "cylinder") {
      if (Math.hypot(x - solid.x, z - solid.z) <= solid.radius + margin) {
        return solid.height;
      }

      // A column built into a corner also holds up the square corner beyond
      // its circle, so standing on top never drops you through a gap by the walls.
      const touchesWalls =
        Math.abs(solid.x) + solid.radius >= ARENA_HALF - 0.1 &&
        Math.abs(solid.z) + solid.radius >= ARENA_HALF - 0.1;

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
  public groundHeight(x: number, z: number, feetY: number): number {
    let ground = 0;

    for (const solid of this.solids) {
      const height = this.solidHeight(solid, x, z, 0);

      if (height <= feetY + STEP_UP && height > ground) {
        ground = height;
      }
    }

    return ground;
  }

  /** True if a character of `radius` at (x, z), feet at `feetY`, would be inside a wall. */
  public isBlocked(
    x: number,
    z: number,
    feetY: number,
    radius: number,
  ): boolean {
    if (Math.abs(x) > this.half - radius || Math.abs(z) > this.half - radius) {
      return true;
    }

    for (const solid of this.solids) {
      if (this.solidHeight(solid, x, z, radius) > feetY + STEP_UP + 1e-6) {
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

    for (const solid of this.solids) {
      if (this.solidHeight(solid, x, z, radius) <= feetY + STEP_UP + 1e-6) {
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
    topLimit = feetY + STEP_UP + 1e-6,
  ): { x: number; z: number } {
    let px = x;
    let pz = z;

    for (let pass = 0; pass < 4; pass++) {
      for (const solid of this.solids) {
        if (this.solidHeight(solid, px, pz, radius) <= topLimit) {
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

    const limit = this.half - radius;

    px = Math.min(Math.max(px, -limit), limit);
    pz = Math.min(Math.max(pz, -limit), limit);

    // Pushing away from a corner column can land in the sealed corner behind
    // it, which is still inside the column's reach. If anything still holds
    // the character, walk it toward the middle of the arena until it is free.
    for (let n = 0; n < 40 && this.heldBySolid(px, pz, radius, topLimit); n++) {
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
  ): boolean {
    return this.solids.some(
      (solid) => this.solidHeight(solid, x, z, radius - 0.01) > topLimit,
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

      for (const solid of this.solids) {
        // A little tolerance so grazing a top edge is not a block.
        if (this.solidHeight(solid, x, z, 0) > y + 0.02) {
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
    return this.half - Math.max(Math.abs(x), Math.abs(z));
  }
}
