import type { PileElement } from "./ArenaLayout";
import { halfExtents } from "./MapParts";
import { meshVertices } from "./PileMeshes";

/**
 * Puts every loose piece on what is really under it. A piece's origin says
 * nothing about where it touches: a rotated rock or a chipped slab is smaller
 * than its box, and a piece placed by a guess or lifted by the box rules can
 * hang a few centimetres over the floor, which its own shadow then shows. For
 * each piece the real lowest point of its drawn mesh is found, then the
 * highest thing drawn under that point (another piece's real surface, or the
 * floor); a piece whose lowest point is above that by a hand's width or less
 * is lowered until it is just sunk into it. Taller gaps are left (a piece
 * resting on something this does not count, or hanging from something), as
 * are long pieces (beams, tubes, bars) and tall ones (sections leaning on a
 * wall). Pieces go from the bottom up, so each one rests on a piece already
 * settled. `floor` is the height of the floor under them; `onDeck` limits the
 * pass to pieces lying on top of it (not the ones hanging from its edge).
 * Returns how many pieces were lowered.
 */
export function groundPieces(elements: PileElement[], onDeck = false): number {
  interface Info {
    e: PileElement;
    low: number;
    at: { x: number; z: number };
    surface: Array<{ x: number; z: number; y: number }> | null;
    top: number;
  }

  const infos: Info[] = [];

  for (const e of elements) {
    if (e.shape === "cable") continue;

    const vertices = meshVertices(e);

    if (vertices) {
      let low = Infinity;
      let top = -Infinity;
      let at = { x: 0, z: 0 };

      for (const v of vertices) {
        if (v.y < low) {
          low = v.y;
          at = { x: e.x + v.x, z: e.z + v.z };
        }

        top = Math.max(top, v.y);
      }

      infos.push({
        e,
        low: e.y + low,
        top: e.y + top,
        at,
        surface: vertices.map((v) => ({
          x: e.x + v.x,
          z: e.z + v.z,
          y: e.y + v.y,
        })),
      });
    } else {
      const [, hy] = halfExtents(e);

      infos.push({
        e,
        low: e.y - hy,
        top: e.y + hy,
        at: { x: e.x, z: e.z },
        surface: null,
      });
    }
  }

  const supportUnder = (self: Info, x: number, z: number): number => {
    let height = 0;

    for (const q of infos) {
      if (q === self) continue;
      if (Math.abs(q.e.x - x) > 3 || Math.abs(q.e.z - z) > 3) continue;
      // Tall or long pieces are not a surface to rest on.
      if (q.top - q.low > 1.3) continue;

      if (q.surface) {
        for (const v of q.surface) {
          if (Math.hypot(v.x - x, v.z - z) < 0.15) {
            height = Math.max(height, v.y);
          }
        }
      } else {
        const [hx, , hz] = halfExtents(q.e);

        if (Math.abs(q.e.x - x) < hx && Math.abs(q.e.z - z) < hz) {
          height = Math.max(height, q.top);
        }
      }
    }

    return height;
  };

  let moved = 0;

  for (const info of [...infos].sort((a, b) => a.low - b.low)) {
    const { e } = info;
    const long = Math.max(e.sx, e.sy, e.sz);

    // Beams, tubes and bars are placed by what they are fixed to.
    if ((e.shape === "plank" || e.shape === "pipe") && long > 0.9) continue;
    // Pieces hanging from the walkway's edge, or overhead.
    if (onDeck && (info.low < -0.05 || info.low > 0.5)) continue;
    // Tall pieces lean on something.
    if (info.top - info.low > 1.3) continue;

    const gap = info.low - supportUnder(info, info.at.x, info.at.z);

    if (gap > 0.004 && gap < 0.4) {
      const lower = gap + Math.min(0.03, long * 0.12) * 0.5;

      e.y -= lower;
      info.low -= lower;
      info.top -= lower;

      if (info.surface) {
        for (const v of info.surface) v.y -= lower;
      }

      moved++;
    }
  }

  return moved;
}

/**
 * The height of what is drawn under (x, z): the highest point of any piece in
 * `list` within `reach` of it (a rock's or a slab's real mesh, a plank's or a
 * pipe's box), or the floor. A piece dropped there by its own lowest point
 * rests on what is really under it, not at a guessed height. Pieces that
 * stand tall (a section leaning on a wall, a beam) are not a surface: rubble
 * dropped by one comes to rest at its foot, not perched on its top edge.
 */
export function surfaceUnder(
  list: readonly PileElement[],
  x: number,
  z: number,
  reach: number,
): number {
  let top = 0;

  for (const q of list) {
    if (Math.abs(q.x - x) > 3 || Math.abs(q.z - z) > 3) continue;

    const vertices = meshVertices(q);

    if (vertices) {
      let low = Infinity;
      let high = -Infinity;

      for (const v of vertices) {
        low = Math.min(low, v.y);
        high = Math.max(high, v.y);
      }

      if (high - low > 1.3) continue;

      for (const v of vertices) {
        if (Math.hypot(q.x + v.x - x, q.z + v.z - z) < reach) {
          top = Math.max(top, q.y + v.y);
        }
      }
    } else {
      const [hx, hy, hz] = halfExtents(q);

      if (hy > 0.65) continue;

      if (Math.abs(q.x - x) < hx && Math.abs(q.z - z) < hz) {
        top = Math.max(top, q.y + hy);
      }
    }
  }

  return top;
}
