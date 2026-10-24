import { describe, expect, it } from "vitest";

import { ArenaCollision } from "../../src/world/ArenaCollision";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";
import { spawnPlayer } from "./playerHarness";

/** A plain jump (5.8 m/s against 18 m/s^2) lifts the feet 0.93 m. */
const JUMP_APEX = (5.8 * 5.8) / (2 * 18);
/** The tallest thing a vault takes. */
const VAULT_MAX = 1.45;

/** The brick barricades: each pile of that kind is made of slices of a barrier. */
function barricades(): Array<{ id: string; tops: number[] }> {
  return ARENA_LAYOUT.piles
    .filter((pile) => pile.id.endsWith("-brick"))
    .map((pile) => ({
      id: pile.id,
      tops: pile.solids.map((id) => {
        const slice = ARENA_LAYOUT.walls.find((w) => w.id === id)!;

        return slice.height - (slice.base ?? slice.bottom ?? 0);
      }),
    }));
}

describe("Brick barricades over the map", () => {
  const all = barricades();
  const low = all.filter((b) => Math.max(...b.tops) <= JUMP_APEX);
  const high = all.filter((b) => Math.min(...b.tops) > JUMP_APEX);

  it("there are several, of two kinds: a jump clears some, the others need a vault or a hop", () => {
    expect(all.length).toBeGreaterThanOrEqual(8);
    expect(low.length).toBeGreaterThanOrEqual(3);
    expect(high.length).toBeGreaterThanOrEqual(3);
    // Every one is one kind or the other: none is half and half.
    expect(low.length + high.length).toBe(all.length);
  });

  it("the low ones stay under what a jump clears, and are still barricades (0.7 m or more)", () => {
    for (const b of low) {
      expect(Math.max(...b.tops), b.id).toBeLessThanOrEqual(0.9 + 1e-6);
      expect(Math.min(...b.tops), b.id).toBeGreaterThanOrEqual(0.7);
    }
  });

  it("the high ones are above a jump everywhere along them and under the vault limit", () => {
    for (const b of high) {
      // Flat at 1.35 m: feet 0.9 m up are needed (after the 0.45 m step-up) for
      // longer than a jump lasts.
      expect(Math.min(...b.tops), b.id).toBeGreaterThanOrEqual(1.35 - 1e-6);
      expect(Math.max(...b.tops) - Math.min(...b.tops), b.id).toBeLessThan(
        1e-6,
      );
      expect(Math.max(...b.tops), b.id).toBeLessThanOrEqual(VAULT_MAX);
    }
  });

  it("they are spread over the map, not in one place", () => {
    const spots = all.map((b) => {
      const slice = ARENA_LAYOUT.walls.find((w) =>
        w.id.startsWith(b.id.replace("-brick", "")),
      )!;

      return {
        x: (slice.minX + slice.maxX) / 2,
        z: (slice.minZ + slice.maxZ) / 2,
      };
    });
    const xs = spots.map((s) => s.x);
    const zs = spots.map((s) => s.z);

    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(25);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(15);
  });

  it("every one can be vaulted from its walkway side, along most of its length", () => {
    const world = new ArenaCollision();

    for (const b of all) {
      const slices = ARENA_LAYOUT.piles
        .find((pile) => pile.id === b.id)!
        .solids.map((id) => ARENA_LAYOUT.walls.find((w) => w.id === id)!);
      const minX = Math.min(...slices.map((s) => s.minX));
      const maxX = Math.max(...slices.map((s) => s.maxX));
      const minZ = Math.min(...slices.map((s) => s.minZ));
      const maxZ = Math.max(...slices.map((s) => s.maxZ));
      const base = slices[0].bottom ?? 0;
      const alongX = maxX - minX >= maxZ - minZ;
      let worked = 0;
      let tried = 0;

      for (const side of [-1, 1]) {
        for (const t of [0.3, 0.5, 0.7]) {
          const x = alongX
            ? minX + (maxX - minX) * t
            : side < 0
              ? minX - 1
              : maxX + 1;
          const z = alongX
            ? side < 0
              ? minZ - 1
              : maxZ + 1
            : minZ + (maxZ - minZ) * t;

          // Only from where one can stand on the barricade's own level.
          if (Math.abs(world.groundHeight(x, z, base + 1) - base) > 0.01) {
            continue;
          }

          tried++;

          if (
            world.findVault(x, z, alongX ? 0 : -side, alongX ? -side : 0, base)
          ) {
            worked++;
          }
        }
      }

      expect(tried, b.id).toBeGreaterThan(0);
      expect(worked / tried, b.id).toBeGreaterThanOrEqual(0.66);
    }
  });

  it("a player running up and pressing jump gets over every one, from its walkway side", () => {
    for (const b of all) {
      const slices = ARENA_LAYOUT.piles
        .find((pile) => pile.id === b.id)!
        .solids.map((id) => ARENA_LAYOUT.walls.find((w) => w.id === id)!);
      const minX = Math.min(...slices.map((s) => s.minX));
      const maxX = Math.max(...slices.map((s) => s.maxX));
      const minZ = Math.min(...slices.map((s) => s.minZ));
      const maxZ = Math.max(...slices.map((s) => s.maxZ));
      const base = slices[0].bottom ?? 0;
      const alongX = maxX - minX >= maxZ - minZ;
      const world = new ArenaCollision();
      let tried = 0;
      let crossed = 0;

      for (const side of [-1, 1]) {
        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        const sx = alongX ? cx : cx + side * 1.3;
        const sz = alongX ? cz + side * 1.3 : cz;

        if (Math.abs(world.groundHeight(sx, sz, base + 1) - base) > 0.01) {
          continue;
        }

        tried++;

        const p = spawnPlayer(
          sx,
          base,
          sz,
          Math.atan2(alongX ? 0 : side, alongX ? side : 0),
        );

        p.step(0.1);
        p.input.keys.add("KeyW");
        p.input.jumpQueued = true;
        p.step(2.2);

        const { x, z } = p.player.position;
        const across = alongX
          ? Math.sign(z - cz) === -side
          : Math.sign(x - cx) === -side;

        if (across) {
          crossed++;
        }
      }

      expect(tried, b.id).toBeGreaterThan(0);
      expect(crossed, b.id).toBe(tried);
    }
  });
});
