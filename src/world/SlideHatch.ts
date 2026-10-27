/**
 * Roof hatches whose cover slides aside instead of swinging up on a hinge.
 *
 * A hinged grille opened by E stands on its edge as a solid panel, 1.2 m high,
 * right beside its opening. Two such hatches side by side put a wall at the
 * seam between them, so the opening cannot be jumped out of. A sliding cover
 * lies flat on the roof beside the opening instead, and goes back the same
 * way. All of the Armory roof's vents are made so.
 *
 * (No imports, so both the map's solids and the drawing can use it.)
 */

/** Every vent of the Armory's roof row has a sliding cover (ids start so). */
export const SLIDE_HATCH_PREFIX = "hatch-armory-vent";

/** A cover is a little smaller than its opening (as the hinged panels are). */
export const SLIDE_COVER_SCALE = 0.96;

/** How long the cover takes to slide, one way (seconds). */
export const SLIDE_SECONDS = 0.42;

/** The clear space left between the opening's curb and the resting cover (m). */
const REST_GAP = 0.2;

/** Whether this hatch has a sliding cover. */
export function isSlideHatch(id: string): boolean {
  return id.startsWith(SLIDE_HATCH_PREFIX);
}

/**
 * How far the cover slides, toward -z (away from the Armory's south wall, onto
 * the open roof): far enough that it rests clear of the opening and of the
 * curb round it, level with its far side.
 */
export function slideDistance(depth: number): number {
  return depth / 2 + (depth * SLIDE_COVER_SCALE) / 2 + REST_GAP;
}
