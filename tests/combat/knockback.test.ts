import { describe, expect, it } from "vitest";

import { ATTACKS, type AttackId } from "../../src/combat/AttackDefinitions";
import { makeScene, runAttack } from "./helpers";

const ids: AttackId[] = ["light-punch", "heavy-run-punch", "flying-heavy-punch"];

describe("Knockback", () => {
  it.each(ids)("%s carries its configured knockback", (id) => {
    const scene = makeScene();

    runAttack(scene, id);

    expect(scene.defender.hits[0].knockback).toBe(ATTACKS[id].knockback);
  });

  it("heavier attacks push further", () => {
    const push = (id: AttackId): number => {
      const scene = makeScene();

      runAttack(scene, id);

      return scene.defender.hits[0].knockback;
    };

    expect(push("heavy-run-punch")).toBeGreaterThan(push("light-punch"));
    expect(push("flying-heavy-punch")).toBeGreaterThan(push("heavy-run-punch"));
  });

  it.each([0, 45, 90, 180, 270])(
    "direction is away from the attacker (attacker at %i deg)",
    (angle) => {
      const scene = makeScene(angle);

      runAttack(scene, "light-punch");

      const { knockbackDirection } = scene.defender.hits[0];
      const away = scene.defender.position
        .clone()
        .sub(scene.attacker.position)
        .setY(0)
        .normalize();

      expect(knockbackDirection.length()).toBeCloseTo(1);
      expect(knockbackDirection.y).toBe(0);
      expect(knockbackDirection.distanceTo(away)).toBeLessThan(1e-6);
    },
  );

  it("rotating the setup rotates the knockback with it", () => {
    const a = makeScene(0, 0);
    const b = makeScene(0, Math.PI / 2);

    runAttack(a, "heavy-run-punch");
    runAttack(b, "heavy-run-punch");

    expect(
      a.defender.hits[0].knockbackDirection.angleTo(
        b.defender.hits[0].knockbackDirection,
      ),
    ).toBeCloseTo(Math.PI / 2, 5);
  });

  it("a blocked light punch goes to onBlocked, not onHit", () => {
    const scene = makeScene(0);

    scene.defender.blocking = true;
    runAttack(scene, "light-punch");

    expect(scene.defender.hits).toHaveLength(0);
    expect(scene.defender.blockedHits).toHaveLength(1);
  });
});
