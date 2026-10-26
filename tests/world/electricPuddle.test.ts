import { describe, expect, it } from "vitest";

import {
  ElectricHazard,
  SHOCK_DAMAGE,
  SHOCK_INTERVAL,
} from "../../src/combat/ElectricHazard";
import { CombatSystem } from "../../src/combat/CombatSystem";
import { UPPER_FLOOR_Y as F } from "../../src/world/ArenaLayout";
import { ARENA_LAYOUT as layout } from "../../src/world/UpperFloorMap";
import { TestFighter } from "../combat/helpers";
import { distanceAtHeight, walkField, world } from "./nav";

const puddle = layout.electricPuddles![0];
const cutoff = layout.powerCutoff!;
const power = layout.rooms.find((r) => r.id === "room-switch")!;
const junk = layout.rooms.find((r) => r.id === "room-archive")!;

function scene(): {
  hazard: ElectricHazard;
  fighter: TestFighter;
  run: (seconds: number) => void;
} {
  const combat = new CombatSystem();
  const fighter = new TestFighter("player");

  combat.register(fighter);

  const hazard = new ElectricHazard(combat, layout.electricPuddles!);

  return {
    hazard,
    fighter,
    run: (seconds) => {
      for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
        hazard.update(1 / 60);
        combat.update(1 / 60);
      }
    },
  };
}

describe("The live puddle at the Power Room's door", () => {
  it("lies across the door and the floor just inside, on the Power Room's own floor", () => {
    const door = power.doors.find((d) => d.side === "s")!;

    expect(puddle.y).toBe(F);
    expect(Math.abs(puddle.x - door.at)).toBeLessThan(puddle.rx * 0.5);
    // Spans the doorway on both sides of the wall (z -17).
    expect(puddle.z - puddle.rz).toBeLessThan(power.maxZ - 0.5);
    expect(puddle.z + puddle.rz).toBeGreaterThan(power.maxZ + 0.5);
    // ...and covers the whole opening, so it cannot be walked round.
    expect(puddle.rx).toBeGreaterThan(door.width / 2);
  });

  it("shocks someone standing in it, once, then again only after the interval", () => {
    const { hazard, fighter, run } = scene();

    fighter.position.set(puddle.x, F, puddle.z);
    run(1 / 60);
    expect(fighter.health.current).toBe(100 - SHOCK_DAMAGE);

    // Not every frame.
    run(SHOCK_INTERVAL * 0.5);
    expect(fighter.health.current).toBe(100 - SHOCK_DAMAGE);

    run(SHOCK_INTERVAL);
    expect(fighter.health.current).toBe(100 - 2 * SHOCK_DAMAGE);
    expect(hazard.live).toBe(true);
  });

  it("does not hurt anyone on dry ground, at the edge's far side, or on another floor", () => {
    const { fighter, run } = scene();

    // Just past the puddle's edge (x), beyond it (z), and a floor below.
    for (const [x, y, z] of [
      [puddle.x + puddle.rx + 0.15, F, puddle.z],
      [3, F, -15.9 + 1.8 + 0.15], // beyond the walkway puddle's far edge
      [puddle.x, F, -24.5], // behind the room's own wall line
      [puddle.x, F - 4, puddle.z],
      [puddle.x, F + 4, puddle.z],
    ] as const) {
      fighter.position.set(x, y, z);
      run(2);
      expect(fighter.health.current, `${x},${y},${z}`).toBe(100);
    }
  });

  it("stops shocking once the power is cut, and starts again on a new round", () => {
    const { hazard, fighter, run } = scene();

    hazard.setLive(false);
    fighter.position.set(puddle.x, F, puddle.z);
    run(3);
    expect(fighter.health.current).toBe(100);

    hazard.reset();
    run(1 / 60);
    expect(fighter.health.current).toBe(100 - SHOCK_DAMAGE);
  });
});

describe("The cutoff lever and the way to it", () => {
  it("is on the main panel inside the Power Room, at a reachable height, facing the room", () => {
    expect(cutoff.x).toBeGreaterThan(power.minX);
    expect(cutoff.x).toBeLessThan(power.maxX);
    expect(cutoff.z).toBeGreaterThanOrEqual(power.minZ);
    expect(cutoff.z).toBeLessThanOrEqual(power.minZ + 1);
    expect(cutoff.y - F).toBeGreaterThan(1);
    expect(cutoff.y - F).toBeLessThan(1.7);
    expect(Math.hypot(cutoff.nx, cutoff.nz)).toBeCloseTo(1, 5);
    // Where the player stands to use it is open floor.
    expect(world.isBlocked(cutoff.x, cutoff.z + cutoff.nz * 0.8, F, 0.3)).toBe(
      false,
    );
  });

  it("can be walked to from inside the Junk Room (by its doorway into the Power Room)", () => {
    const standAt = {
      x: cutoff.x,
      z: cutoff.z + cutoff.nz * 0.8,
    };
    // Start inside the Junk Room, on its floor.
    const from = { x: junk.minX + 4, z: (junk.minZ + junk.maxZ) / 2 };
    const reach = walkField(from.x, from.z, F, { hop: true });

    expect(distanceAtHeight(reach, standAt.x, standAt.z, F)).not.toBe(Infinity);
  });
});

describe("The walkway in front of the door", () => {
  it("stops short of the north vent's grate: the grate strip and the floor past it are dry", () => {
    const { hazard } = scene();

    for (const z of [-13.6, -13, -12.4, -12.1]) {
      expect(hazard.inWater(3, z, F), `z ${z}`).toBe(false);
    }

    expect(hazard.inWater(3, -14.5, F)).toBe(true);
  });

  it("is under the same current right in front of the door", () => {
    const { hazard, fighter, run } = scene();

    for (const z of [-16.5, -15.5, -14.5]) {
      for (const x of [1.5, 3, 4.5]) {
        expect(hazard.inWater(x, z, F), `${x},${z}`).toBe(true);
      }
    }

    fighter.position.set(3, F, -15.5);
    run(1 / 60);
    expect(fighter.health.current).toBeLessThan(100);

    hazard.setLive(false);
    fighter.health.reset();
    run(3);
    expect(fighter.health.current).toBe(100);
  });
});

describe("The Junk Room's low gap over the platform", () => {
  it("is a vault from the platform's top and too high from the floor beside it", () => {
    const platform = layout.walls.find(
      (w) => w.id === "support-north-2-platform",
    )!;
    const gap = layout.walls.filter(
      (w) =>
        w.id.startsWith("room-archive-wall-s-1~") &&
        w.minX < platform.maxX &&
        w.maxX > platform.minX,
    );

    expect(gap.length).toBeGreaterThan(0);

    const top = Math.max(...gap.map((w) => w.height));

    // From the platform: 0.5 to 1.45 m up. From the floor: out of reach.
    expect(top - platform.height).toBeGreaterThan(0.5);
    expect(top - platform.height).toBeLessThanOrEqual(1.45);
    expect(top - F).toBeGreaterThan(2.2);

    // The vault itself: from the platform it is found; from the floor it is not.
    expect(world.findVault(-2.7, -15.6, 0, -1, platform.height)).not.toBeNull();
    expect(world.findVault(-2.7, -15.6, 0, -1, F)).toBeNull();
    // The rest of the wall is whole.
    expect(
      layout.walls.some(
        (w) => w.id.startsWith("room-archive-wall-s-1~") && w.height - F > 3.7,
      ),
    ).toBe(true);
  });
});
