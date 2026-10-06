import { describe, expect, it } from "vitest";

import { ATTACKS } from "../../src/combat/AttackDefinitions";
import {
  COMBAT_CONFIG,
  guardAlignment,
  guardDotThreshold,
} from "../../src/combat/CombatConfig";
import { aimAt, eventsOf, makeScene, runAttack } from "./helpers";

const halfAngle = COMBAT_CONFIG.blockAngleDegrees / 2;

/** Light punch from `angle` against a guarding defender; true if it was blocked. */
function isBlocked(angle: number, defenderYaw = 0): boolean {
  const scene = makeScene(angle, defenderYaw);

  scene.defender.blocking = true;

  return runAttack(scene, "light-punch") === 0;
}

describe("Guard geometry", () => {
  it("guard is a cone, not 360 degrees", () => {
    expect(COMBAT_CONFIG.blockAngleDegrees).toBeGreaterThan(0);
    expect(COMBAT_CONFIG.blockAngleDegrees).toBeLessThan(360);
  });

  it("alignment is 1 ahead, 0 at the side, -1 behind", () => {
    expect(guardAlignment(0, 1, 0, 0, 0, 5)).toBeCloseTo(1);
    expect(guardAlignment(0, 1, 0, 0, 5, 0)).toBeCloseTo(0);
    expect(guardAlignment(0, 1, 0, 0, 0, -5)).toBeCloseTo(-1);
  });

  it("threshold matches the configured half angle", () => {
    expect(Math.acos(guardDotThreshold()) * (180 / Math.PI)).toBeCloseTo(
      halfAngle,
    );
  });
});

describe("Directional block (angle from the defender's facing)", () => {
  const inside = [0, 15, 30, Math.floor(halfAngle) - 1];

  it.each(inside)("%i deg to one side blocks", (angle) => {
    expect(isBlocked(angle)).toBe(true);
  });

  it.each(inside)("%i deg to the other side blocks", (angle) => {
    expect(isBlocked(-angle)).toBe(true);
  });

  it("just inside the configured boundary blocks, just outside hits (both sides)", () => {
    for (const sign of [1, -1]) {
      expect(isBlocked(sign * (halfAngle - 1))).toBe(true);
      expect(isBlocked(sign * (halfAngle + 1))).toBe(false);
    }
  });

  it.each([90, -90, 135, -135, 180])("%i deg is not blocked", (angle) => {
    expect(isBlocked(angle)).toBe(false);
  });

  it("emits blocked inside the cone and block-failed (with a reason) outside", () => {
    const front = makeScene(0);
    front.defender.blocking = true;
    runAttack(front, "light-punch");
    expect(eventsOf(front, "blocked")).toHaveLength(1);

    const rear = makeScene(180);
    rear.defender.blocking = true;
    runAttack(rear, "light-punch");
    expect(eventsOf(rear, "block-failed")[0]?.reason).toBe("rear");

    const side = makeScene(90);
    side.defender.blocking = true;
    runAttack(side, "light-punch");
    expect(eventsOf(side, "block-failed")[0]?.reason).toBe("outside-guard");
  });
});

describe("Guard follows the defender's rotation", () => {
  it.each([0, 90, 180, 270, 45])(
    "defender yaw %i deg: front blocks, behind hits",
    (yawDeg) => {
      const yaw = (yawDeg * Math.PI) / 180;

      expect(isBlocked(0, yaw)).toBe(true);
      expect(isBlocked(180, yaw)).toBe(false);
    },
  );

  it("the same world position is blocked or not depending on where the defender faces", () => {
    const attackFrom = (defenderYaw: number): boolean => {
      const scene = makeScene(0, 0);

      scene.defender.yaw = defenderYaw;
      scene.defender.blocking = true;
      scene.attacker.position.set(0, 0, 1.2);
      aimAt(scene.attacker, scene.defender, "torso");

      return runAttack(scene, "light-punch") === 0;
    };

    expect(attackFrom(0)).toBe(true); // facing +z: attacker in front
    expect(attackFrom(Math.PI / 2)).toBe(false); // facing +x: attacker at the side
    expect(attackFrom(Math.PI)).toBe(false); // facing -z: attacker behind
  });
});

describe("Block state", () => {
  it("not blocking: no block logic, full damage from the front", () => {
    const scene = makeScene(0);

    expect(runAttack(scene, "light-punch")).toBe(ATTACKS["light-punch"].damage);
    expect(eventsOf(scene, "blocked")).toHaveLength(0);
    expect(eventsOf(scene, "block-failed")).toHaveLength(0);
  });

  it("blocking + light + front: blocked", () => {
    expect(isBlocked(0)).toBe(true);
  });

  it("blocking + light + rear: damage", () => {
    expect(isBlocked(180)).toBe(false);
  });

  it("blocking + heavy: never blocked", () => {
    const scene = makeScene(0);

    scene.defender.blocking = true;
    runAttack(scene, "heavy-run-punch");

    expect(eventsOf(scene, "blocked")).toHaveLength(0);
    expect(scene.defender.health.current).toBeLessThan(100);
  });

  it("a dead defender is not blocking", () => {
    const scene = makeScene(0);

    scene.defender.blocking = true;
    scene.defender.health.damage(1000);

    expect(scene.defender.isBlocking()).toBe(false);
  });

  it("a level guard does not cover the head or legs of a standing defender", () => {
    for (const part of ["head", "legs"] as const) {
      const scene = makeScene(0);

      scene.defender.blocking = true;
      aimAt(scene.attacker, scene.defender, part);

      expect(runAttack(scene, "light-punch")).toBe(
        ATTACKS["light-punch"].damage,
      );
    }
  });
});
