import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { ATTACKS } from "../../src/combat/AttackDefinitions";
import type { CombatEvent } from "../../src/combat/CombatEvents";
import { CombatSystem } from "../../src/combat/CombatSystem";
import { TrainingDummy } from "../../src/combat/TrainingDummy";
import { TestFighter } from "./helpers";

const SPAWN = new THREE.Vector3(2, 0, 3);
const LOOK_AT = new THREE.Vector3();

/** The real training dummy; its (unloaded) rig is replaced by a simple hurtbox. */
function makeDummyScene() {
  const system = new CombatSystem();
  const dummy = new TrainingDummy(system.events, SPAWN.clone(), 50);
  const attacker = new TestFighter("attacker");
  const events: CombatEvent[] = [];

  system.events.subscribe((e) => events.push(e));

  for (const box of dummy.getHurtboxes()) {
    box.getShape = (out) => {
      const p = dummy.getPosition();

      out.start.set(p.x, p.y + 1.2, p.z);
      out.end.copy(out.start);
      out.radius = 0.3;

      return true;
    };
  }

  system.register(attacker);
  system.register(dummy);

  attacker.position.set(SPAWN.x, 0, SPAWN.z + 1.2);
  attacker.yaw = Math.PI;

  const punch = (): void => {
    attacker.strike.set(dummy.getPosition().x, 1.2, dummy.getPosition().z);
    system.startAttack("attacker", "heavy-run-punch", "right");

    for (let i = 0; i < 100; i++) {
      system.update(0.01);
    }
  };

  return { system, dummy, events, punch };
}

describe("Training dummy", () => {
  it("starts alive at full health", () => {
    const { dummy } = makeDummyScene();

    expect(dummy.isDead()).toBe(false);
    expect(dummy.health.current).toBe(dummy.health.max);
  });

  it("takes damage and is knocked back away from the attacker", () => {
    const { dummy, punch } = makeDummyScene();

    punch();
    dummy.update(0.3, LOOK_AT);

    expect(dummy.health.current).toBe(
      dummy.health.max - ATTACKS["heavy-run-punch"].damage,
    );
    expect(dummy.getPosition().z).toBeLessThan(SPAWN.z);
  });

  it("dies at 0 HP and cannot be damaged further", () => {
    const { dummy, events, punch } = makeDummyScene();

    dummy.health.damage(dummy.health.max - 1);
    punch();
    punch();

    expect(dummy.health.current).toBe(0);
    expect(dummy.isDead()).toBe(true);
    expect(events.filter((e) => e.type === "died")).toHaveLength(1);
  });

  it("respawns: full HP, back at spawn, alive, hittable again", () => {
    const { dummy, events, punch } = makeDummyScene();

    dummy.health.damage(dummy.health.max - 1);
    punch();
    dummy.update(0.2, LOOK_AT);
    expect(dummy.isDead()).toBe(true);

    // Still dead shortly after dying...
    dummy.update(1, LOOK_AT);
    expect(dummy.isDead()).toBe(true);

    // ...and back after the respawn delay.
    dummy.update(3, LOOK_AT);

    expect(dummy.isDead()).toBe(false);
    expect(dummy.health.current).toBe(dummy.health.max);
    expect(dummy.getPosition().distanceTo(SPAWN)).toBeLessThan(1e-6);
    expect(events.filter((e) => e.type === "respawned")).toHaveLength(1);

    punch();

    expect(dummy.health.current).toBe(
      dummy.health.max - ATTACKS["heavy-run-punch"].damage,
    );
  });

  it("respawn clears the dev toggles", () => {
    const { dummy, punch } = makeDummyScene();

    dummy.crouched = true;
    dummy.lookUp = true;
    dummy.health.damage(dummy.health.max - 1);
    punch();
    dummy.update(4, LOOK_AT);

    expect(dummy.crouched).toBe(false);
    expect(dummy.lookUp).toBe(false);
  });

  it("a dead dummy does not block", () => {
    const { dummy, punch } = makeDummyScene();

    dummy.blockHeld = true;
    expect(dummy.isBlocking()).toBe(true);

    dummy.health.damage(dummy.health.max - 1);
    punch();

    expect(dummy.isBlocking()).toBe(false);
  });
});
