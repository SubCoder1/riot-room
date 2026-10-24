import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { CombatEvent } from "../../src/combat/CombatEvents";
import { CombatSystem } from "../../src/combat/CombatSystem";
import { ExplosionSystem } from "../../src/combat/Explosions";
import {
  FIRE_LIFETIME,
  FireSystem,
  zoneRadius,
} from "../../src/combat/FireZones";
import { FuelHazard } from "../../src/combat/FuelHazard";
import { MOLOTOV_CONFIG as C } from "../../src/combat/MolotovConfig";
import type { ThrowWorld } from "../../src/combat/ThrowableFlight";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";
import { TestFighter } from "./helpers";

const FLAT: ThrowWorld = { clearFraction: () => 1, surfaceY: () => 4 };
const spill = ARENA_LAYOUT.fuelSpills![0];

function setup() {
  const combat = new CombatSystem();
  const victim = new TestFighter("victim");
  const thrower = new TestFighter("thrower");
  const events: CombatEvent[] = [];

  victim.position.set(spill.x, spill.y, spill.z);
  thrower.position.set(spill.x, spill.y, spill.z + 8);
  combat.register(victim);
  combat.register(thrower);
  combat.events.subscribe((e) => events.push(e));

  const fires = new FireSystem(combat, FLAT);
  const explosions = new ExplosionSystem(combat, FLAT);
  const hazard = new FuelHazard([spill], combat, fires);

  return { combat, fires, explosions, hazard, events, victim };
}

const at = (x: number, z: number, y = spill.y) => new THREE.Vector3(x, y, z);

describe("Fuel spill (the designated fuel hazard)", () => {
  it("there is exactly one, on the Junk Room's floor, away from its middle", () => {
    expect(ARENA_LAYOUT.fuelSpills).toHaveLength(1);
    expect(spill.x).toBeGreaterThan(-13.7);
    expect(spill.x).toBeLessThan(-1.3);
    expect(spill.z).toBeGreaterThan(-23.7);
    expect(spill.z).toBeLessThan(-16.3);
    // Pooled round the doorway between the two rooms (x -1, z -21 to -19).
    expect(Math.abs(spill.x + 1)).toBeLessThan(2);
    expect(Math.abs(spill.z + 20)).toBeLessThan(1);
  });

  it("a Molotov that breaks on it lights it with one fire at its centre", () => {
    const { fires, hazard } = setup();

    fires.ignite("thrower", at(spill.x + 0.9, spill.z + 0.5));

    expect(hazard.stateOf(spill.id)).toBe("burning");
    expect(fires.zones).toHaveLength(2);
    expect(fires.zones[1].position.x).toBeCloseTo(spill.fire!.x);
    expect(fires.zones[1].ownerId).toBe("thrower");
  });

  it("a Molotov that breaks at its heart is its fire (no second one)", () => {
    const { fires, hazard } = setup();

    fires.ignite("thrower", at(spill.x + 0.2, spill.z));

    expect(hazard.stateOf(spill.id)).toBe("burning");
    expect(fires.zones).toHaveLength(1);
  });

  it("a Molotov elsewhere in the room leaves it alone", () => {
    const { fires, hazard } = setup();

    fires.ignite("thrower", at(-9, -17.5));

    expect(hazard.stateOf(spill.id)).toBe("intact");
    expect(fires.zones).toHaveLength(1);
  });

  it("the puddle reaches through the east doorway into the Generator Room, and a bottle breaking there lights it", () => {
    const lobe = spill.lobes!.find((l) => l.x > -1)!;

    expect(lobe).toBeDefined();
    // Only a little way in (not deep across the rooms).
    expect(lobe.x + lobe.r).toBeLessThan(2);

    const { fires, hazard } = setup();

    fires.ignite("thrower", at(lobe.x + 0.4, lobe.z));
    expect(hazard.stateOf(spill.id)).toBe("burning");
    // The one fire is at the heart of the puddle.
    expect(
      fires.zones.some((z) => Math.abs(z.position.x - spill.fire!.x) < 0.01),
    ).toBe(true);

    const off = setup();

    off.fires.ignite("thrower", at(lobe.x + lobe.r + 2.5, lobe.z));
    expect(off.hazard.stateOf(spill.id)).toBe("intact");
  });

  it("a grenade close to it lights it, one far off does not", () => {
    const near = setup();

    near.explosions.detonate("thrower", at(spill.x - 1.5, spill.z - 1.2));
    expect(near.hazard.stateOf(spill.id)).toBe("burning");
    expect(near.fires.zones).toHaveLength(1);

    const far = setup();

    far.explosions.detonate("thrower", at(-9, -17.5));
    expect(far.hazard.stateOf(spill.id)).toBe("intact");
    expect(far.fires.zones).toHaveLength(0);
  });

  it("burns once: more fire or blasts on it add nothing, and it is spent when the fire is out", () => {
    const { combat, fires, explosions, hazard, events } = setup();

    fires.ignite("thrower", at(spill.x, spill.z + 0.3));
    explosions.detonate("thrower", at(spill.x, spill.z));
    fires.ignite("thrower", at(spill.x + 0.5, spill.z));

    // The blast and the bottle are separate events; the pool made nothing more.
    expect(fires.zones).toHaveLength(2);
    expect(events.filter((e) => e.type === "explosion")).toHaveLength(1);

    for (let t = 0; t < FIRE_LIFETIME + 4; t += 1 / 30) {
      fires.update(1 / 30);
    }

    expect(fires.zones).toHaveLength(0);
    expect(hazard.stateOf(spill.id)).toBe("spent");

    // A spent pool does not burn again this round.
    fires.ignite("thrower", at(spill.x, spill.z));
    expect(fires.zones).toHaveLength(1);

    hazard.reset();
    expect(hazard.stateOf(spill.id)).toBe("intact");
    void combat;
  });

  it("a Molotov's fire on it lasts the same time as anywhere else", () => {
    const { fires } = setup();

    fires.ignite("thrower", at(spill.x + 1.0, spill.z));

    const lit = fires.zones[1];
    let t = 0;

    while (fires.zones.includes(lit) && t < 60) {
      fires.update(1 / 30);
      t += 1 / 30;
    }

    // A fuel fire burns a few seconds longer than a Molotov's own.
    expect(t).toBeCloseTo(FIRE_LIFETIME + C.FUEL_FIRE_EXTRA_DURATION, 1);
  });

  it("burns a body standing in it (the usual fire damage, no extra)", () => {
    const { fires, victim } = setup();
    const before = victim.health.current;

    fires.ignite("thrower", at(spill.x, spill.z));

    for (let t = 0; t < 3; t += 1 / 30) {
      fires.update(1 / 30);
    }

    expect(victim.health.current).toBeLessThan(before);
  });

  it("a burning pool is a violent fuel fire: it reaches the leaking drum and is too high to jump over", () => {
    const { fires, victim } = setup();

    fires.ignite("thrower", at(spill.x, spill.z));

    const zone = fires.zones[0];

    expect(zone.fuel).toBe(true);

    for (let t = 0; t < 1.5; t += 1 / 30) {
      fires.update(1 / 30);
    }

    // Its radius reaches the drum's mouth where the oil runs out.
    expect(zoneRadius(zone)).toBeGreaterThan(
      Math.hypot(
        spill.source.x - spill.fire!.x,
        spill.source.z - spill.fire!.z,
      ),
    );

    // A body in mid-jump (2 m up) still burns.
    victim.position.set(spill.x + 1, spill.y + 2.0, spill.z);

    const before = victim.health.current;

    for (let t = 0; t < 1.5; t += 1 / 30) {
      fires.update(1 / 30);
    }

    expect(victim.health.current).toBeLessThan(before);
  });

  it("a fuel fire hurts more than an ordinary Molotov fire", () => {
    const burnt = (fuel: boolean): number => {
      const { fires, victim } = setup();
      const at0 = fuel ? at(spill.x, spill.z) : at(-9, -17.5);

      victim.position.set(at0.x, at0.y, at0.z);
      fires.ignite("thrower", at0);

      for (let t = 0; t < 1.6; t += 1 / 30) {
        fires.update(1 / 30);
      }

      return 100 - victim.health.current;
    };

    expect(burnt(true)).toBeGreaterThan(burnt(false) * 2);
  });

  it("a Molotov thrown beside it lights it once the fire's edge grows over it", () => {
    const { fires, hazard } = setup();
    const maxRadius = zoneRadius({ age: 3, fuel: false });

    // Too far to touch at first, near enough for the grown fire.
    fires.ignite(
      "thrower",
      at(spill.x, spill.z + spill.radius * 0.8 + maxRadius * 0.8),
    );
    expect(hazard.stateOf(spill.id)).toBe("intact");

    for (let t = 0; t < 8; t += 0.1) {
      fires.update(0.1);
      hazard.update();
    }

    expect(hazard.stateOf(spill.id)).toBe("burning");
    expect(fires.zones.some((z) => z.fuel)).toBe(true);
  });

  it("a fire far from the pool never lights it", () => {
    const { fires, hazard } = setup();

    fires.ignite("thrower", at(spill.x, spill.z + 8));

    for (let t = 0; t < 8; t += 0.1) {
      fires.update(0.1);
      hazard.update();
    }

    expect(hazard.stateOf(spill.id)).toBe("intact");
  });
});
