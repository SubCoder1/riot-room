import { describe, expect, it } from "vitest";

import { ATTACKS, type AttackId } from "../../src/combat/AttackDefinitions";
import { Health } from "../../src/combat/Combatant";
import { eventsOf, makeScene, runAttack } from "./helpers";

describe("Damage", () => {
  it.each(Object.keys(ATTACKS) as AttackId[])(
    "%s removes exactly its configured damage",
    (id) => {
      const scene = makeScene();

      runAttack(scene, id);

      expect(scene.defender.health.current).toBe(100 - ATTACKS[id].damage);
    },
  );

  it("light then heavy stack", () => {
    const scene = makeScene();

    runAttack(scene, "light-punch");
    runAttack(scene, "heavy-run-punch");

    expect(scene.defender.health.current).toBe(
      100 - ATTACKS["light-punch"].damage - ATTACKS["heavy-run-punch"].damage,
    );
  });

  it("the hit event reports damage and remaining health", () => {
    const scene = makeScene();

    runAttack(scene, "light-punch");

    const [hit] = eventsOf(scene, "hit");

    expect(hit.damage).toBe(ATTACKS["light-punch"].damage);
    expect(hit.healthLeft).toBe(100 - ATTACKS["light-punch"].damage);
  });
});

describe("Health boundaries", () => {
  it("never goes below zero", () => {
    const scene = makeScene();

    scene.defender.health.damage(90); // 10 HP left

    runAttack(scene, "heavy-run-punch");

    expect(scene.defender.health.current).toBe(0);
  });

  it("Health.damage returns the damage actually dealt", () => {
    const health = new Health(10);

    expect(health.damage(25)).toBe(10);
    expect(health.current).toBe(0);
    expect(health.damage(5)).toBe(0);
  });

  it("negative damage does not heal", () => {
    const health = new Health(50);

    health.damage(-20);

    expect(health.current).toBe(50);
  });

  it("reset restores full health", () => {
    const health = new Health(50);

    health.damage(50);
    health.reset();

    expect(health.current).toBe(50);
    expect(health.isDead).toBe(false);
  });

  it("a dead target cannot be damaged again", () => {
    const scene = makeScene();

    scene.defender.health.damage(1000);
    runAttack(scene, "light-punch");

    expect(scene.defender.health.current).toBe(0);
    expect(eventsOf(scene, "hit")).toHaveLength(0);
  });
});

describe("Death", () => {
  it("alive above 0, dead at 0", () => {
    const health = new Health(100);

    expect(health.isDead).toBe(false);
    health.damage(99);
    expect(health.isDead).toBe(false);
    health.damage(1);
    expect(health.isDead).toBe(true);
  });

  it("the died event fires exactly once, however many attacks follow", () => {
    const scene = makeScene();

    scene.defender.health.damage(95);

    runAttack(scene, "light-punch");
    runAttack(scene, "light-punch");
    runAttack(scene, "heavy-run-punch");

    expect(scene.defender.isDead()).toBe(true);
    expect(eventsOf(scene, "died")).toHaveLength(1);
    expect(eventsOf(scene, "hit")).toHaveLength(1);
  });

  it("a dead target is not hit and does not block", () => {
    const scene = makeScene();

    scene.defender.blocking = true;
    scene.defender.health.damage(1000);
    runAttack(scene, "light-punch");

    expect(eventsOf(scene, "blocked")).toHaveLength(0);
    expect(scene.defender.hits).toHaveLength(0);
  });
});
