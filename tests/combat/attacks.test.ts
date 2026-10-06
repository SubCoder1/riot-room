import { describe, expect, it } from "vitest";

import { ATTACKS, type AttackId } from "../../src/combat/AttackDefinitions";

const ids = Object.keys(ATTACKS) as AttackId[];

describe("Attack definitions", () => {
  it.each([
    ["light-punch", true],
    ["flying-light-punch", true],
    ["heavy-run-punch", false],
    ["flying-heavy-punch", false],
  ] as const)("%s canBeBlocked = %s", (id, blockable) => {
    expect(ATTACKS[id].canBeBlocked).toBe(blockable);
  });

  it("keys match their ids", () => {
    for (const id of ids) {
      expect(ATTACKS[id].id).toBe(id);
    }
  });

  it.each(ids)("%s has valid damage, timing and knockback", (id) => {
    const attack = ATTACKS[id];

    expect(attack.damage).toBeGreaterThan(0);
    expect(attack.startup).toBeGreaterThanOrEqual(0);
    expect(attack.active).toBeGreaterThan(0);
    expect(attack.recovery).toBeGreaterThanOrEqual(0);
    expect(attack.knockback).toBeGreaterThan(0);
    expect(attack.hitstun).toBeGreaterThanOrEqual(0);
    expect(attack.hitboxRadius).toBeGreaterThan(0);
    expect(attack.guardedDamageMultiplier).toBeGreaterThan(0);
    expect(attack.guardedDamageMultiplier).toBeLessThanOrEqual(1);
  });

  it("heavy attacks hit harder and push further than their light versions", () => {
    expect(ATTACKS["heavy-run-punch"].damage).toBeGreaterThan(
      ATTACKS["light-punch"].damage,
    );
    expect(ATTACKS["heavy-run-punch"].knockback).toBeGreaterThan(
      ATTACKS["light-punch"].knockback,
    );
    expect(ATTACKS["flying-heavy-punch"].damage).toBeGreaterThan(
      ATTACKS["flying-light-punch"].damage,
    );
    expect(ATTACKS["flying-heavy-punch"].knockback).toBeGreaterThan(
      ATTACKS["flying-light-punch"].knockback,
    );
  });
});
