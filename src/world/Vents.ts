import type { VentGrate, VentNetwork } from "./ArenaLayout";

/** The side of one block of the grating, the part that opens (m). */
export const VENT_BLOCK = 1.2;

/** One block of the grating: a square panel that lifts out for a climb in or out. */
export interface VentBlock {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** The bars run along x (else along z): along the way the tunnel runs. */
  alongX: boolean;
  /** Height of the floor this block is set in (0 for the arena floor, 4 for the upper floor). */
  y: number;
}

/**
 * The grating cut into blocks of at most 1.2 m, tunnel by tunnel, from each
 * tunnel's own corner. Only the blocks under and beside a body open.
 */
export function ventBlocks(network: VentNetwork): VentBlock[] {
  const blocks: VentBlock[] = [];
  const closed = network.closed ?? [];

  network.tunnels.forEach((t, k) => {
    // A plain connector under the floor has no grating.
    if (t.grated === false) {
      return;
    }

    const alongX = t.maxX - t.minX >= t.maxZ - t.minZ;
    const nx = Math.max(1, Math.ceil((t.maxX - t.minX) / VENT_BLOCK - 1e-6));
    const nz = Math.max(1, Math.ceil((t.maxZ - t.minZ) / VENT_BLOCK - 1e-6));
    const sx = (t.maxX - t.minX) / nx;
    const sz = (t.maxZ - t.minZ) / nz;

    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const block = {
          id: `vent-${network.id}-${k}-${i}-${j}`,
          minX: t.minX + i * sx,
          maxX: t.minX + (i + 1) * sx,
          minZ: t.minZ + j * sz,
          maxZ: t.minZ + (j + 1) * sz,
          alongX,
          y: network.surfaceY,
        };

        // Left plain floor where something stands (a ladder's foot, a wall, a
        // railing, cover).
        const shut = closed.some(
          (c) =>
            block.maxX > c.minX + 1e-6 &&
            block.minX < c.maxX - 1e-6 &&
            block.maxZ > c.minZ + 1e-6 &&
            block.minZ < c.maxZ - 1e-6,
        );

        if (!shut) {
          blocks.push(block);
        }
      }
    }
  });

  return blocks;
}

/** The blocks a body of `radius` at (x, z) overlaps. */
export function ventBlocksNear(
  blocks: readonly VentBlock[],
  x: number,
  z: number,
  radius: number,
): VentBlock[] {
  return blocks.filter(
    (b) =>
      x + radius >= b.minX &&
      x - radius <= b.maxX &&
      z + radius >= b.minZ &&
      z - radius <= b.maxZ,
  );
}

/**
 * Height of the vent floor under the arena floor (the slab is -0.4 to 0): the
 * tunnels are 1.3 m high, so they can only be crawled through crouched.
 */
export const VENT_FLOOR_Y = -1.7;

/** Underside of the arena floor slab: the vent's ceiling. */
export const VENT_CEILING_Y = -0.4;

/** Floor of a network's tunnels (the surface it is set in, less 1.7 m). */
export function ventFloorY(network: VentNetwork): number {
  return network.surfaceY + VENT_FLOOR_Y;
}

/** Ceiling of a network's tunnels. */
export function ventCeilingY(network: VentNetwork): number {
  return network.surfaceY + VENT_CEILING_Y;
}

/** Width of a vent tunnel and the cell the vent geometry is built on (m). */
export const VENT_CELL = 0.6;

/** How far past a grate's edge a player may stand and still use it (m). */
const GRATE_REACH = 0.25;

/**
 * The grate a body at (x, z) is standing on (or at the very edge of), or null.
 * It must be on a block of grating: a spot left as plain floor (a ladder's
 * foot, a wall) is no way in or out.
 */
export function findGrate(
  network: VentNetwork,
  x: number,
  z: number,
  reach = GRATE_REACH,
): VentGrate | null {
  const onBlock = ventBlocks(network).some(
    (b) =>
      x >= b.minX - reach &&
      x <= b.maxX + reach &&
      z >= b.minZ - reach &&
      z <= b.maxZ + reach,
  );

  if (!onBlock) {
    return null;
  }

  for (const grate of network.grates) {
    if (
      Math.abs(x - grate.x) <= grate.halfX + reach &&
      Math.abs(z - grate.z) <= grate.halfZ + reach
    ) {
      return grate;
    }
  }

  return null;
}

/** True if the point (x, z) is inside some tunnel. */
export function inTunnel(network: VentNetwork, x: number, z: number): boolean {
  return network.tunnels.some(
    (t) => x >= t.minX && x <= t.maxX && z >= t.minZ && z <= t.maxZ,
  );
}

/** True if a body of `radius` at (x, z) fits inside the tunnels (all four corners). */
export function fitsInTunnels(
  network: VentNetwork,
  x: number,
  z: number,
  radius: number,
): boolean {
  return (
    inTunnel(network, x - radius, z - radius) &&
    inTunnel(network, x + radius, z - radius) &&
    inTunnel(network, x - radius, z + radius) &&
    inTunnel(network, x + radius, z + radius)
  );
}
