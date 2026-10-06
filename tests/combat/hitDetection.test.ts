import { describe, expect, it } from "vitest";

import { ATTACKS } from "../../src/combat/AttackDefinitions";
import { aimAt, eventsOf, makeScene, runAttack } from "./helpers";

describe("Hit registration", () => {
  it("one attack damages the same target only once", () => {
    const scene = makeScene();
    const { damage } = ATTACKS["light-punch"];

    scene.system.startAttack("attacker", "light-punch", "right");

    // Many small frames: the hitbox overlaps the target for several of them.
    for (let i = 0; i < 100; i++) {
      scene.system.update(0.005);
    }

    expect(scene.defender.health.current).toBe(100 - damage);
    expect(eventsOf(scene, "hit")).toHaveLength(1);
    expect(scene.defender.hits).toHaveLength(1);
  });

  it("two separate punches are two separate hits", () => {
    const scene = makeScene();
    const { damage } = ATTACKS["light-punch"];

    runAttack(scene, "light-punch");
    runAttack(scene, "light-punch");

    expect(scene.defender.health.current).toBe(100 - 2 * damage);
    expect(eventsOf(scene, "hit")).toHaveLength(2);
  });

  it("a replacing attack (combo chain) starts with a clean hit list", () => {
    const scene = makeScene();

    scene.system.startAttack("attacker", "light-punch", "right");
    scene.system.update(0.08);
    scene.system.startAttack("attacker", "light-punch", "left");
    scene.system.update(0.08);

    expect(eventsOf(scene, "hit")).toHaveLength(2);
  });

  it("a punch that misses deals nothing", () => {
    const scene = makeScene();

    scene.attacker.strike.set(10, 1.2, 10);

    expect(runAttack(scene, "light-punch")).toBe(0);
    expect(eventsOf(scene, "hit")).toHaveLength(0);
  });

  it("the attacker never hits themselves", () => {
    const scene = makeScene();

    scene.attacker.strike.set(
      scene.attacker.position.x,
      scene.attacker.position.y + 1.2,
      scene.attacker.position.z,
    );
    scene.defender.position.set(50, 0, 50);

    runAttack(scene, "light-punch");

    expect(scene.attacker.health.current).toBe(100);
  });

  it("reports the body part that was struck", () => {
    for (const part of ["head", "torso", "legs"] as const) {
      const scene = makeScene();

      aimAt(scene.attacker, scene.defender, part);
      runAttack(scene, "light-punch");

      expect(eventsOf(scene, "hit")[0]?.hurtbox).toBe(part);
    }
  });
});

describe("Attack timing", () => {
  it("startup: cannot hit", () => {
    const scene = makeScene();
    const { startup } = ATTACKS["light-punch"];

    scene.system.startAttack("attacker", "light-punch", "right");
    scene.system.update(startup * 0.9);

    expect(scene.system.getAttack("attacker")?.phase).toBe("startup");
    expect(scene.defender.health.current).toBe(100);
  });

  it("active: can hit", () => {
    const scene = makeScene();
    const { startup, active } = ATTACKS["light-punch"];

    scene.system.startAttack("attacker", "light-punch", "right");
    scene.system.update(startup + active / 2);

    expect(scene.system.getAttack("attacker")?.phase).toBe("active");
    expect(scene.defender.health.current).toBeLessThan(100);
  });

  it("recovery: cannot hit", () => {
    const scene = makeScene();
    const { startup, active } = ATTACKS["light-punch"];

    // The fist is out of reach until recovery begins, then moves onto the target.
    scene.attacker.strike.set(10, 1.2, 10);
    scene.system.startAttack("attacker", "light-punch", "right");
    scene.system.update(startup + active + 0.01);
    expect(scene.system.getAttack("attacker")?.phase).toBe("recovery");

    aimAt(scene.attacker, scene.defender, "torso");
    scene.system.update(0.01);

    expect(scene.defender.health.current).toBe(100);
  });

  it("the attack ends after startup + active + recovery", () => {
    const scene = makeScene();
    const { startup, active, recovery } = ATTACKS["light-punch"];

    scene.system.startAttack("attacker", "light-punch", "right");
    scene.system.update(startup + active + recovery + 0.001);

    expect(scene.system.getAttack("attacker")).toBeUndefined();
  });

  it("a cancelled attack deals nothing afterwards", () => {
    const scene = makeScene();

    scene.system.startAttack("attacker", "light-punch", "right");
    scene.system.cancelAttack("attacker");
    scene.system.update(0.2);

    expect(scene.defender.health.current).toBe(100);
  });

  it("a dead attacker cannot start an attack", () => {
    const scene = makeScene();

    scene.attacker.health.damage(1000);
    scene.system.startAttack("attacker", "light-punch", "right");

    expect(scene.system.getAttack("attacker")).toBeUndefined();
  });
});
