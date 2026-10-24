import { describe, expect, it } from "vitest";

import { throwableCount } from "../../src/world/ArmoryStash";
import { ARMORY } from "../../src/world/ArmoryMechanisms";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";
import { spawnPlayer, world } from "./playerHarness";

/**
 * The Armory is an improvised stash: crates of three kinds, a worktable with
 * guns on it, damaged shelving, and exactly twelve throwables. The middle of the
 * room stays clear, and nothing in the stash is a pick-up or changes the rules.
 */
describe("The Armory stash", () => {
  it("holds exactly four grenades, four smoke grenades and four Molotovs", () => {
    expect(throwableCount()).toEqual({ grenade: 4, smoke: 4, molotov: 4 });
  });

  it("makes each of the twelve a pick-up on a surface in the room", () => {
    const stash = ARENA_LAYOUT.pickups.filter((pickup) =>
      pickup.id.startsWith("armory-"),
    );

    for (const type of ["GRENADE", "SMOKE", "MOLOTOV"] as const) {
      expect(stash.filter((pickup) => pickup.type === type)).toHaveLength(4);
    }

    for (const pickup of stash) {
      expect(pickup.x).toBeGreaterThan(-31.7);
      expect(pickup.x).toBeLessThan(-20.5);
      expect(pickup.z).toBeGreaterThan(5.3);
      expect(pickup.z).toBeLessThan(12);
      // On a surface the player can reach from the floor (not on the floor).
      expect(pickup.y - ARMORY.FLOOR).toBeGreaterThan(0.1);
      expect(pickup.y - ARMORY.FLOOR).toBeLessThan(1.8);
    }
  });

  it("has the three crate styles, the worktable's guns and the clutter", () => {
    const ids = new Set(ARENA_LAYOUT.piles.map((pile) => pile.id));

    for (const id of [
      "armory-crates-north",
      "armory-crates-west",
      "armory-south-kit",
      "armory-debris",
      "table-armory",
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("keeps the way from the shutter to the hatch and the table clear", () => {
    // Walk from the shutter's doorway to the hatch, round the table, and from
    // the hatch to the bays: nobody is stopped by the stash.
    const routes: Array<[number, number, number, number]> = [
      [-21.2, 8.0, -26.0, 11.2],
      [-26.0, 11.2, -30.5, 11.0],
      [-21.2, 8.0, -30.4, 7.2],
      [-26.0, 10.6, -22.0, 10.4],
    ];

    for (const [sx, sz, ex, ez] of routes) {
      const p = spawnPlayer(sx, ARMORY.FLOOR, sz);
      const yaw = Math.atan2(-(ex - sx), -(ez - sz));

      p.input.yaw = yaw;
      p.input.keys.add("KeyW");

      let t = 0;

      while (
        t < 8 &&
        Math.hypot(p.player.position.x - ex, p.player.position.z - ez) > 0.6
      ) {
        p.step(1 / 20);
        t += 1 / 20;
      }

      const at = p.player.position;

      expect(
        Math.hypot(at.x - ex, at.z - ez),
        `${sx},${sz} -> ${ex},${ez} ended ${at.x.toFixed(2)},${at.z.toFixed(2)}`,
      ).toBeLessThan(0.7);
    }
  });

  it("puts nothing in the doorways", () => {
    for (const z of [7.3, 8.0, 8.7]) {
      expect(world.isBlocked(-21.6, z, ARMORY.FLOOR, 0.45)).toBe(false);
    }

    for (const x of [-26.6, -26.0, -25.4]) {
      expect(world.isBlocked(x, 11.2, ARMORY.FLOOR, 0.45)).toBe(false);
    }
  });

  it("stops shots: every prop and crate in the room is solid to a line through it", () => {
    const F = ARMORY.FLOOR;
    // [description, from, to, height above the floor]
    const lines: Array<[string, number, number, number, number, number]> = [
      ["table clutter", -27.8, 8.6, -24.8, 8.6, 1.0],
      ["closed crate stack", -26.6, 5.82, -25.2, 5.82, 0.3],
      ["weapons crate on the stack", -26.3, 5.8, -25.4, 5.8, 0.7],
      ["grenade crate", -25.0, 5.85, -23.9, 5.85, 0.3],
      ["broken crate", -23.6, 5.86, -22.4, 5.86, 0.3],
      ["west closed crates", -30.7, 8.3, -28.9, 8.3, 0.4],
      ["bottle crate", -29.8, 10.6, -28.6, 10.6, 0.25],
      ["locker", -23.3, 11.7, -23.9, 11.7, 1.0],
      ["trolley", -22.7, 11.6, -21.9, 11.6, 0.6],
      ["open ammo crate", -24.8, 11.68, -24.1, 11.68, 0.2],
      ["closed ammo boxes", -21.6, 11.62, -20.8, 11.62, 0.4],
      ["emptied can", -27.2, 6.55, -26.6, 6.55, 0.1],
    ];

    for (const [name, x0, z0, x1, z1, h] of lines) {
      expect(world.segmentBlocked(x0, F + h, z0, x1, F + h, z1), name).toBe(
        true,
      );
    }

    // A line well over them goes through.
    expect(world.segmentBlocked(-27.8, F + 1.5, 8.6, -24.8, F + 1.5, 8.6)).toBe(
      false,
    );
  });
});
