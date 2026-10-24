import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { CombatEvent } from "../../src/combat/CombatEvents";
import { CombatSystem } from "../../src/combat/CombatSystem";
import { ExplosionSystem } from "../../src/combat/Explosions";
import { FIRE_LIFETIME, FireSystem } from "../../src/combat/FireZones";
import { FuelHazard } from "../../src/combat/FuelHazard";
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
    // Not in the lane between the south door (x -8) and the east door (z -20).
    expect(Math.hypot(spill.x + 8, spill.z + 17)).toBeGreaterThan(3);
  });

  it("a Molotov that breaks on it lights it with one fire at its centre", () => {
    const { fires, hazard } = setup();

    fires.ignite("thrower", at(spill.x + 0.9, spill.z + 0.5));

    expect(hazard.stateOf(spill.id)).toBe("burning");
    expect(fires.zones).toHaveLength(2);
    expect(fires.zones[1].position.x).toBeCloseTo(spill.x);
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

    fires.ignite("thrower", at(-9, -19));

    expect(hazard.stateOf(spill.id)).toBe("intact");
    expect(fires.zones).toHaveLength(1);
  });

  it("a grenade close to it lights it, one far off does not", () => {
    const near = setup();

    near.explosions.detonate("thrower", at(spill.x - 1.5, spill.z - 1.2));
    expect(near.hazard.stateOf(spill.id)).toBe("burning");
    expect(near.fires.zones).toHaveLength(1);

    const far = setup();

    far.explosions.detonate("thrower", at(-10, -17));
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

    for (let t = 0; t < FIRE_LIFETIME + 0.5; t += 1 / 30) {
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

    expect(t).toBeCloseTo(FIRE_LIFETIME, 1);
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
});
