import { describe, expect, it } from "vitest";

import {
  CEILING_SLAB_AREA,
  CEILING_SLAB_ID,
  CEILING_SLAB_ROLES,
  CEILING_SLAB_COVER,
  CEILING_SLAB_COVER_TOP,
  CEILING_SLAB_TOP,
  CeilingSlabState,
  onCeilingSlab,
} from "../../src/world/CeilingSlab";
import { POWER_BULB } from "../../src/world/JunkRoom";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";
import { ArenaCollision } from "../../src/world/ArenaCollision";
import { spawnPlayer, world } from "./playerHarness";

const cx = (CEILING_SLAB_AREA.minX + CEILING_SLAB_AREA.maxX) / 2;
const cz = (CEILING_SLAB_AREA.minZ + CEILING_SLAB_AREA.maxZ) / 2;
const ON = { x: cx, z: cz, feetY: CEILING_SLAB_COVER_TOP };

describe("The Generator Room's wooden slab", () => {
  it("is centred over the bulb, and larger than a body needs", () => {
    expect(cx).toBeCloseTo(POWER_BULB.x);
    expect(cz).toBeCloseTo(POWER_BULB.z);
    expect(
      CEILING_SLAB_AREA.maxX - CEILING_SLAB_AREA.minX,
    ).toBeGreaterThanOrEqual(2);
    expect(world.groundHeight(cx, cz, 5)).toBeCloseTo(4);
  });

  it("lies in the roof, flush, over clear floor beside the generator", () => {
    const slab = ARENA_LAYOUT.platforms.find((p) => p.id === CEILING_SLAB_ID);

    expect(slab?.height).toBeCloseTo(CEILING_SLAB_COVER_TOP);
    expect(slab?.bottom).toBeCloseTo(CEILING_SLAB_COVER_TOP - 0.3);
    // The boards lie on the roof: 10 cm over it, 20 to 25% wider than the
    // opening, reaching past it on every side.
    expect(CEILING_SLAB_COVER_TOP).toBeCloseTo(CEILING_SLAB_TOP + 0.1);

    const grown =
      (CEILING_SLAB_COVER.maxX - CEILING_SLAB_COVER.minX) /
      (CEILING_SLAB_AREA.maxX - CEILING_SLAB_AREA.minX);

    expect(grown).toBeGreaterThan(1.2);
    expect(grown).toBeLessThan(1.25);
    expect(CEILING_SLAB_AREA.minX - CEILING_SLAB_COVER.minX).toBeGreaterThan(
      0.2,
    );
    expect(CEILING_SLAB_COVER.maxZ - CEILING_SLAB_AREA.maxZ).toBeGreaterThan(
      0.2,
    );
    // It is the only roof piece over its area.
    const over = ARENA_LAYOUT.platforms.filter(
      (p) =>
        p.role === "roof" &&
        p.id !== CEILING_SLAB_ID &&
        p.minX < CEILING_SLAB_AREA.maxX &&
        p.maxX > CEILING_SLAB_AREA.minX &&
        p.minZ < CEILING_SLAB_AREA.maxZ &&
        p.maxZ > CEILING_SLAB_AREA.minZ,
    );

    expect(over).toHaveLength(0);
  });

  it("prompts only on top of it", () => {
    expect(onCeilingSlab(ON)).toBe(true);
    // Underneath, in the room.
    expect(onCeilingSlab({ ...ON, feetY: 4 })).toBe(false);
    // Beside it on the roof, and far away.
    expect(onCeilingSlab({ ...ON, x: CEILING_SLAB_AREA.maxX + 0.5 })).toBe(
      false,
    );
    expect(onCeilingSlab({ ...ON, x: -20, z: 10 })).toBe(false);
  });

  it("breaks once: both roles allowed, repeats and rivals change nothing", () => {
    expect(CEILING_SLAB_ROLES).toEqual(["batman", "thug"]);

    const state = new CeilingSlabState();

    expect(state.tryBreak("a", "thug", { ...ON, feetY: 4 })).toBe("denied");
    expect(state.broken).toBe(false);
    expect(state.tryBreak("a", "thug", ON)).toBe("broken");
    expect(state.tryBreak("a", "thug", ON)).toBe("already");
    expect(state.tryBreak("b", "batman", ON)).toBe("already");
    expect(state.brokenBy).toBe("a");

    const other = new CeilingSlabState();

    expect(other.tryBreak("b", "batman", ON)).toBe("broken");
  });

  it("is solid until broken, then a passable opening", () => {
    const w = new ArenaCollision();

    expect(w.groundHeight(cx, cz, CEILING_SLAB_TOP)).toBeCloseTo(
      CEILING_SLAB_COVER_TOP,
    );
    expect(w.setOpen(CEILING_SLAB_ID, true)).toBe(true);
    expect(w.groundHeight(cx, cz, CEILING_SLAB_TOP)).toBeCloseTo(4);
  });

  it.each([
    ["the middle", 0, 0],
    ["near an edge", 0.9, 0],
    ["near a corner", 0.9, 0.9],
    ["the other corner", -0.9, -0.9],
  ])(
    "drops a player standing at %s to the floor, who can then walk",
    (_n, dx, dz) => {
      const w = world;
      const run = spawnPlayer(cx + dx, CEILING_SLAB_COVER_TOP, cz + dz);

      run.step(0.3);
      expect(run.feet()).toBeCloseTo(CEILING_SLAB_COVER_TOP, 1);
      w.setOpen(CEILING_SLAB_ID, true);
      run.step(2);

      try {
        expect(run.feet()).toBeCloseTo(4, 1);
        expect(run.player.position.x).toBeGreaterThan(CEILING_SLAB_AREA.minX);
        expect(run.player.position.x).toBeLessThan(CEILING_SLAB_AREA.maxX);

        const z = run.player.position.z;

        run.input.keys.add("KeyS");
        run.step(1);
        expect(Math.abs(run.player.position.z - z)).toBeGreaterThan(0.5);
        expect(run.feet()).toBeCloseTo(4, 1);
      } finally {
        w.setOpen(CEILING_SLAB_ID, false);
      }
    },
  );
});
