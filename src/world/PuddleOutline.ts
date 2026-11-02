import type { ElectricPuddleDefinition } from "./ArenaLayout";

/**
 * The outline of an electrified puddle, shared by what is drawn and what
 * shocks, so the current reaches exactly as far as the water does. The water
 * is the ellipse (`rx`, `rz`) with an uneven edge: at each angle round it, the
 * edge is this share of the ellipse's reach (never more than 1).
 */
export function outlineFactor(angle: number, index: number): number {
  return (
    0.95 +
    0.03 * Math.sin(angle * 3 + 1.3 + index) +
    0.012 * Math.sin(angle * 5 + 0.4) +
    0.01 * Math.sin(angle * 9 + 2.1)
  );
}

/** Whether (x, z) is on the water of puddle number `index` (a gap's strip is dry). */
export function onPuddle(
  puddle: ElectricPuddleDefinition,
  index: number,
  x: number,
  z: number,
): boolean {
  const dx = (x - puddle.x) / puddle.rx;
  const dz = (z - puddle.z) / puddle.rz;
  const gap = puddle.gap;

  if (gap && z >= gap.minZ && z <= gap.maxZ) {
    return false;
  }

  return Math.hypot(dx, dz) <= outlineFactor(Math.atan2(dz, dx), index);
}
