import { describe, expect, it } from "vitest";

import { ATTACKS } from "../../src/combat/AttackDefinitions";
import { eventsOf, makeScene, step } from "./helpers";

describe("Combat pipeline", () => {
  it("light punch: start -> active -> hit -> damage -> knockback -> reaction", () => {
    const scene = makeScene(0);
    const def = ATTACKS["light-punch"];

    scene.system.startAttack("attacker", "light-punch", "right");
    expect(scene.system.getAttack("attacker")?.phase).toBe("startup");

    step(scene, def.startup + 0.01);
    expect(scene.system.getAttack("attacker")?.phase).toBe("active");

    expect(scene.defender.health.current).toBe(100 - def.damage);
    expect(scene.defender.hits).toHaveLength(1);
    expect(scene.defender.hits[0].knockback).toBe(def.knockback);
    expect(scene.defender.hits[0].hitstun).toBe(def.hitstun);

    step(scene, def.active + def.recovery);
    expect(scene.system.getAttack("attacker")).toBeUndefined();

    expect(scene.events.map((e) => e.type)).toEqual([
      "attack-started",
      "attack-active",
      "hit",
      "attack-ended",
    ]);
  });

  it("light punch vs a front guard: blocked, no damage, no hit reaction", () => {
    const scene = makeScene(0);

    scene.defender.blocking = true;
    scene.system.startAttack("attacker", "light-punch", "right");
    step(scene, 0.2);

    expect(scene.defender.health.current).toBe(100);
    expect(scene.defender.hits).toHaveLength(0);
    expect(scene.defender.blockedHits).toHaveLength(1);
    expect(eventsOf(scene, "blocked")).toHaveLength(1);
    expect(eventsOf(scene, "hit")).toHaveLength(0);
  });

  it("heavy punch vs a front guard: never blocked, damage and knockback still land", () => {
    const scene = makeScene(0);
    const def = ATTACKS["heavy-run-punch"];

    scene.defender.blocking = true;
    scene.system.startAttack("attacker", "heavy-run-punch", "right");
    step(scene, def.startup + 0.01);

    expect(eventsOf(scene, "blocked")).toHaveLength(0);
    expect(scene.defender.blockedHits).toHaveLength(0);
    expect(scene.defender.hits).toHaveLength(1);
    expect(scene.defender.hits[0].knockback).toBe(def.knockback);
    expect(scene.defender.health.current).toBeLessThan(100);
  });

  it("heavy punch from behind a guarding defender: guard ignored, full damage", () => {
    const scene = makeScene(180);

    scene.defender.blocking = true;
    scene.system.startAttack("attacker", "heavy-run-punch", "right");
    step(scene, 0.5);

    expect(eventsOf(scene, "guard-ignored")).toHaveLength(1);
    expect(scene.defender.health.current).toBe(
      100 - ATTACKS["heavy-run-punch"].damage,
    );
  });

  it("a combo of light punches kills a dummy exactly once", () => {
    const scene = makeScene(0);
    const needed = Math.ceil(100 / ATTACKS["light-punch"].damage);

    for (let i = 0; i < needed + 3; i++) {
      scene.system.startAttack(
        "attacker",
        "light-punch",
        i % 2 ? "left" : "right",
      );
      step(scene, 0.3);
    }

    expect(scene.defender.health.current).toBe(0);
    expect(eventsOf(scene, "hit")).toHaveLength(needed);
    expect(eventsOf(scene, "died")).toHaveLength(1);
  });
});
