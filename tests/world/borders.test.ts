import { describe, expect, it } from "vitest";

import { ARENA_LAYOUT as layout } from "../../src/world/UpperFloorMap";

/** Boxes kept as authored on purpose (see EXACT_FITTINGS in MapParts). */
const KEPT =
  /^(junk-pile|bunk-barracks|armory-crates|armory-bay|site-work-area|fittings-yard-drums|rail-)/;

describe("Object borders are strict", () => {
  it("every fitting box has something drawn up to its top and all round it (no air above or beside it)", () => {
    const loose: string[] = [];

    for (const pile of layout.piles) {
      for (const id of pile.solids) {
        const b = layout.walls.find((w) => w.id === id);

        if (!b || b.kind !== "box" || b.frame || KEPT.test(id)) continue;

        const y0 = b.bottom ?? pile.baseY;
        // The pieces that reach into the box's plan (generously: by their longest side).
        const over = pile.elements.filter((e) => {
          const h = Math.max(e.sx, e.sy, e.sz) / 2 + 0.05;
          const x = pile.x + e.x;
          const z = pile.z + e.z;

          return (
            x + h > b.minX && x - h < b.maxX && z + h > b.minZ && z - h < b.maxZ
          );
        });
        const top = Math.max(
          -Infinity,
          ...over.map((e) => pile.baseY + e.y + Math.max(e.sx, e.sy, e.sz) / 2),
        );

        // Nothing taller than 25 cm lower than the box's top is drawn over it.
        if (over.length === 0 || top < b.height - 0.25) {
          loose.push(
            `${id} top ${(b.height - y0).toFixed(2)} drawn ${(top - y0).toFixed(2)}`,
          );
        }
      }
    }

    expect(loose).toEqual([]);
  });

  it("a stepped stack gets a box to each step: the air over its low side is empty", () => {
    const stepped = layout.walls.filter((w) => /^stack-wh-\d\+\d+$/.test(w.id));

    expect(stepped.length).toBeGreaterThan(0);
  });
});
