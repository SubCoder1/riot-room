import { describe, expect, it } from "vitest";

import { ATTACKS, type AttackId } from "../../src/combat/AttackDefinitions";
import { eventsOf, makeScene, runAttack } from "./helpers";

const FRONT = 0;
const SIDE = 90;
const BEHIND = 180;

function damageTaken(
  attack: AttackId,
  angle: number,
  blocking: boolean,
): number {
  const scene = makeScene(angle);

  scene.defender.blocking = blocking;

  return runAttack(scene, attack);
}

describe.each(["light-punch", "flying-light-punch"] as const)(
  "%s vs block",
  (id) => {
    const { damage } = ATTACKS[id];

    it("not blocking: full damage", () => {
      expect(damageTaken(id, FRONT, false)).toBe(damage);
    });

    it("blocking from the front: 0 damage", () => {
      expect(damageTaken(id, FRONT, true)).toBe(0);
    });

    it("blocking, attacker outside the guard angle: full damage", () => {
      expect(damageTaken(id, SIDE, true)).toBe(damage);
    });

    it("blocking, attacker behind: full damage", () => {
      expect(damageTaken(id, BEHIND, true)).toBe(damage);
    });
  },
);

describe.each(["heavy-run-punch", "flying-heavy-punch"] as const)(
  "%s vs block",
  (id) => {
    const { damage, guardedDamageMultiplier } = ATTACKS[id];

    it("not blocking: full damage", () => {
      expect(damageTaken(id, FRONT, false)).toBe(damage);
    });

    it("is never blocked or cancelled, from any direction", () => {
      for (const angle of [FRONT, SIDE, -SIDE, BEHIND]) {
        const scene = makeScene(angle);

        scene.defender.blocking = true;

        expect(runAttack(scene, id)).toBeGreaterThan(0);
        expect(eventsOf(scene, "blocked")).toHaveLength(0);
      }
    });

    it("blocking from the side or behind: no reduction at all", () => {
      for (const angle of [SIDE, -SIDE, BEHIND]) {
        expect(damageTaken(id, angle, true)).toBe(damage);
      }
    });

    // The game deliberately softens a heavy hit that lands on a correctly
    // placed guard (requested after manual testing): reduced, never negated.
    it("blocking from the front: only the configured guarded share is removed", () => {
      expect(damageTaken(id, FRONT, true)).toBe(
        Math.round(damage * guardedDamageMultiplier),
      );
    });
  },
);
