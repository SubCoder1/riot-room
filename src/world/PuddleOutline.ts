import type { ElectricPuddleDefinition } from "./ArenaLayout";

/**
 * The shape of every puddle is drawn fresh each time the game starts, as a
 * thrown molotov's pool and a smoke cloud's edge are each their own: one
 * number for the session, from which each puddle takes its own lumps. (A test
 * can fix it with `setPuddleSeed`.)
 */
let session = Math.random() * 1000;
const shapes = new Map<number, Array<[number, number, number]>>();

/** Fixes the session's seed (and so every puddle's shape). */
export function setPuddleSeed(seed: number): void {
  session = seed;
  shapes.clear();
}

/** A repeatable 0..1 number from two numbers. */
function hash(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;

  return x - Math.floor(x);
}

/**
 * A puddle's lumps: six waves round it, of whole numbers of lobes (so the edge
 * closes), each with its own size and place, the broad ones biggest. Fewer
 * and fatter lobes than a wobble: some puddles come out long and bent, some
 * nearly round, some with a bay in one side.
 */
function lumpsOf(index: number): Array<[number, number, number]> {
  let list = shapes.get(index);

  if (!list) {
    list = [2, 3, 4, 5, 7, 9].map((k, n) => [
      k,
      (0.2 / Math.sqrt(k)) * (0.35 + 0.65 * hash(session + index * 7.3, n)),
      hash(session * 1.7 + index * 3.1, n + 10) * Math.PI * 2,
    ]);
    shapes.set(index, list);
  }

  return list;
}

/**
 * The outline of an electrified puddle, shared by what is drawn and what
 * shocks, so the current reaches exactly as far as the water does. The water
 * is the ellipse (`rx`, `rz`) with an uneven edge: at each angle round it, the
 * edge is this share of the ellipse's reach (never more than 1, and never
 * under about half of it).
 */
export function outlineFactor(angle: number, index: number): number {
  let share = 0.9;

  for (const [k, size, place] of lumpsOf(index)) {
    share += size * Math.sin(k * angle + place);
  }

  return Math.min(1, Math.max(0.8, share));
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
