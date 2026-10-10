import { beforeEach, describe, expect, it } from "vitest";

import {
  THROW_TIMING,
  ThrowStance,
  type ThrowInput,
} from "../../src/inventory/ThrowStance";

const DT = 1 / 60;

/** A grenade's throw: the quick pin pull, then the throw itself. */
const GRENADE_THROW = THROW_TIMING.grenadePin + THROW_TIMING.throw;
const GRENADE_TOTAL = GRENADE_THROW;

const base: ThrowInput = {
  selected: true,
  count: 3,
  aimHeld: false,
  throwPressed: false,
  armBusy: false,
};

describe("ThrowStance", () => {
  let stance: ThrowStance;

  const run = (seconds: number, input: Partial<ThrowInput> = {}): void => {
    for (let t = 0; t < seconds; t += DT) {
      stance.update(DT, { ...base, ...input });
    }
  };

  /** Selected, equipped and settled. */
  const equipped = (): void => {
    run(THROW_TIMING.equip + 0.1);
  };

  beforeEach(() => {
    stance = new ThrowStance();
  });

  it("does nothing while the grenade is not selected", () => {
    run(1, { selected: false });

    expect(stance.state).toBe("NORMAL");
    expect(stance.itemVisible).toBe(false);
    expect(stance.pose.weight).toBeLessThan(0.01);
  });

  it("selecting the grenade plays a short equip, then holds a grenade", () => {
    stance.update(DT, base);
    expect(stance.state).toBe("THROW_EQUIPPING");
    // The hand goes to the pocket first, so no grenade yet.
    expect(stance.itemVisible).toBe(false);
    expect(THROW_TIMING.equip).toBeLessThan(0.5);

    run(THROW_TIMING.equip * 0.7);
    expect(stance.itemVisible).toBe(true);

    equipped();
    expect(stance.state).toBe("THROW_EQUIPPED");
    expect(stance.itemVisible).toBe(true);
    expect(stance.pose.weight).toBeGreaterThan(0.9);
    expect(stance.pose.ready).toBeGreaterThan(0.9);
  });

  it("with no grenades left, they cannot be equipped or aimed", () => {
    run(1, { count: 0, aimHeld: true });

    expect(stance.state).toBe("NORMAL");
    expect(stance.isAiming).toBe(false);
  });

  it("right click held aims, and releasing returns to equipped", () => {
    equipped();

    run(0.1, { aimHeld: true });
    expect(stance.state).toBe("THROW_AIMING");
    expect(stance.isAiming).toBe(true);
    expect(stance.pose.aim).toBeGreaterThan(0.7);

    run(0.1, { aimHeld: false });
    expect(stance.state).toBe("THROW_EQUIPPED");
  });

  it("aiming alone never throws", () => {
    equipped();
    run(1, { aimHeld: true });
    run(0.2, { aimHeld: false });

    expect(stance.consumeRelease()).toBe(false);
  });

  it("left click while aiming throws; the grenade leaves the hand once, mid-throw", () => {
    equipped();
    run(0.1, { aimHeld: true });

    stance.update(DT, { ...base, aimHeld: true, throwPressed: true });
    expect(stance.state).toBe("THROW_THROWING");
    expect(stance.consumedClick).toBe(true);
    expect(stance.consumeRelease()).toBe(false);
    expect(stance.itemVisible).toBe(true);

    let releases = 0;

    for (let t = 0; t < GRENADE_THROW + 0.05; t += DT) {
      stance.update(DT, { ...base, count: 2, aimHeld: true });

      if (stance.consumeRelease()) {
        releases++;
        // Not at the very start, and the hand is empty from here on.
        expect(stance.elapsed).toBeGreaterThan(GRENADE_THROW * 0.3);
      }
    }

    expect(releases).toBe(1);
    // Another grenade is left: the hand goes to the pocket for it...
    expect(stance.state).toBe("THROW_EQUIPPING");
    expect(stance.itemVisible).toBe(false);

    // ...and, still holding right click, is aiming with it once it is out.
    run(THROW_TIMING.equip + 0.1, { count: 2, aimHeld: true });
    expect(stance.state).toBe("THROW_AIMING");
    expect(stance.itemVisible).toBe(true);
  });

  it("the grenade is gone from the hand after the release until the next one is out", () => {
    equipped();
    run(0.1, { aimHeld: true });
    stance.update(DT, { ...base, aimHeld: true, throwPressed: true });

    let sawEmptyHand = false;

    for (let t = 0; t < GRENADE_THROW; t += DT) {
      stance.update(DT, { ...base, count: 2, aimHeld: true });

      if (!stance.itemVisible) {
        sawEmptyHand = true;
      }
    }

    expect(sawEmptyHand).toBe(true);
  });

  it("a click in the same frame the aim starts still throws (never a punch)", () => {
    equipped();

    stance.update(DT, { ...base, aimHeld: true, throwPressed: true });

    expect(stance.state).toBe("THROW_THROWING");
    expect(stance.consumedClick).toBe(true);
  });

  it("a left click without aiming is a quick throw", () => {
    equipped();

    stance.update(DT, { ...base, throwPressed: true });

    expect(stance.consumedClick).toBe(true);
    expect(stance.state).toBe("THROW_THROWING");

    let releases = 0;

    for (let t = 0; t < GRENADE_THROW + 0.05; t += DT) {
      stance.update(DT, { ...base, count: 2 });
      if (stance.consumeRelease()) releases++;
    }

    expect(releases).toBe(1);
    expect(stance.state).toBe("THROW_EQUIPPING");
  });

  it("a click while the arm is busy punching is left for the punch", () => {
    equipped();

    stance.update(DT, { ...base, throwPressed: true, armBusy: true });

    expect(stance.consumedClick).toBe(false);
    expect(stance.state).toBe("THROW_EQUIPPED");
  });

  it("cannot punch or guard while aiming or throwing", () => {
    equipped();
    expect(stance.canPunch).toBe(true);
    expect(stance.canBlock).toBe(true);

    run(0.1, { aimHeld: true });
    expect(stance.canPunch).toBe(false);
    expect(stance.canBlock).toBe(false);
    expect(stance.pointsAtCrosshair).toBe(true);

    stance.update(DT, { ...base, aimHeld: true, throwPressed: true });
    expect(stance.state).toBe("THROW_THROWING");
    expect(stance.canPunch).toBe(false);
  });

  it("cannot start another throw while one is in progress", () => {
    equipped();
    run(0.1, { aimHeld: true });
    stance.update(DT, { ...base, aimHeld: true, throwPressed: true });

    let releases = 0;

    for (let t = 0; t < GRENADE_THROW * 0.9; t += DT) {
      // Hammering the throw button mid-throw.
      stance.update(DT, { ...base, aimHeld: true, throwPressed: true });

      if (stance.consumeRelease()) {
        releases++;
      }
    }

    expect(releases).toBe(1);
  });

  it("the last grenade thrown goes back to the normal fists state", () => {
    equipped();
    run(0.1, { aimHeld: true });
    stance.update(DT, { ...base, count: 1, aimHeld: true, throwPressed: true });

    // The caller spends the grenade and selects fists at the release.
    run(GRENADE_THROW + 0.1, { count: 0, selected: false, aimHeld: true });

    expect(stance.state).toBe("NORMAL");
    expect(stance.itemVisible).toBe(false);
    expect(stance.isAiming).toBe(false);
  });

  it("switching away plays a put-away: hand to the pocket, grenade vanishes, then normal", () => {
    equipped();

    stance.update(DT, { ...base, selected: false });
    expect(stance.state).toBe("THROW_UNEQUIPPING");
    expect(stance.itemVisible).toBe(true);
    expect(THROW_TIMING.unequip).toBeLessThan(0.5);

    run(THROW_TIMING.unequip * 0.8, { selected: false });
    expect(stance.itemVisible).toBe(false);

    run(0.2, { selected: false });
    expect(stance.state).toBe("NORMAL");
    expect(stance.pose.weight).toBeLessThan(0.05);
  });

  it("switching away while aiming cancels the aim cleanly", () => {
    equipped();
    run(0.1, { aimHeld: true });

    run(0.05, { selected: false, aimHeld: true });
    expect(stance.isAiming).toBe(false);
    expect(stance.state).toBe("THROW_UNEQUIPPING");

    run(1, { selected: false, aimHeld: true });
    expect(stance.state).toBe("NORMAL");
  });

  it("switching away mid-throw lets the throw finish, then puts the rest away", () => {
    equipped();
    run(0.1, { aimHeld: true });
    stance.update(DT, { ...base, aimHeld: true, throwPressed: true });

    let releases = 0;

    for (let t = 0; t < GRENADE_THROW + 0.05; t += DT) {
      stance.update(DT, { ...base, count: 2, selected: false, aimHeld: true });

      if (stance.consumeRelease()) {
        releases++;
      }
    }

    expect(releases).toBe(1);
    expect(stance.state).toBe("THROW_UNEQUIPPING");

    run(1, { count: 2, selected: false });
    expect(stance.state).toBe("NORMAL");
  });

  it("selecting grenades again during the put-away re-equips", () => {
    equipped();
    stance.update(DT, { ...base, selected: false });
    stance.update(DT, base);

    expect(stance.state).toBe("THROW_EQUIPPING");
  });

  it("does not aim while the arm is busy punching or guarding, and keeps the grenade", () => {
    equipped();

    run(0.5, { aimHeld: true, armBusy: true });

    expect(stance.state).toBe("THROW_EQUIPPED");
    expect(stance.itemVisible).toBe(true);
    expect(stance.pose.weight).toBeLessThan(0.05);

    run(0.2, { aimHeld: true, armBusy: false });
    expect(stance.state).toBe("THROW_AIMING");
  });

  it("pose weights always add up to one", () => {
    const sums: number[] = [];

    equipped();

    for (let t = 0; t < 1; t += DT) {
      stance.update(DT, { ...base, aimHeld: true, throwPressed: t > 0.3 });

      const p = stance.pose;

      sums.push(p.pocket + p.light + p.ready + p.aim + p.windup + p.release);
    }

    for (const sum of sums) {
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it("never gets stuck: after anything it settles to NORMAL when grenades are not wanted", () => {
    equipped();
    run(0.1, { aimHeld: true });
    stance.update(DT, { ...base, aimHeld: true, throwPressed: true });
    run(0.1, { aimHeld: true });
    stance.consumeRelease();
    run(2, { selected: false, count: 0 });

    expect(stance.state).toBe("NORMAL");
  });

  it("reset returns to normal", () => {
    equipped();
    stance.reset();

    expect(stance.state).toBe("NORMAL");
    expect(stance.consumeRelease()).toBe(false);
  });
});

describe("ThrowStance with a Molotov", () => {
  let stance: ThrowStance;

  const molotov: ThrowInput = { ...base, kind: "molotov", count: 2 };

  const run = (seconds: number, input: Partial<ThrowInput> = {}): void => {
    for (let t = 0; t < seconds; t += DT) {
      stance.update(DT, { ...molotov, ...input });
    }
  };

  beforeEach(() => {
    stance = new ThrowStance();
  });

  it("takes it out, lights it, then holds it lit, all in well under a second", () => {
    stance.update(DT, molotov);
    expect(stance.state).toBe("THROW_EQUIPPING");
    expect(stance.heldKind).toBe("molotov");
    expect(stance.lit).toBe(false);

    // Brought up to be lit.
    run(THROW_TIMING.equipMolotov * 0.5);
    expect(stance.itemVisible).toBe(true);
    expect(stance.lit).toBe(false);
    expect(stance.pose.light).toBeGreaterThan(0.5);

    run(THROW_TIMING.equipMolotov * 0.35);
    expect(stance.lit).toBe(true);

    run(0.3);
    expect(stance.state).toBe("THROW_EQUIPPED");
    expect(stance.lit).toBe(true);
    expect(stance.itemVisible).toBe(true);
    expect(THROW_TIMING.equipMolotov).toBeGreaterThanOrEqual(0.4);
    expect(THROW_TIMING.equipMolotov).toBeLessThanOrEqual(0.7);
  });

  it("with none left it cannot be equipped or aimed", () => {
    run(1, { count: 0, aimHeld: true });

    expect(stance.state).toBe("NORMAL");
    expect(stance.isAiming).toBe(false);
  });

  it("aims and throws like the grenade (same states, same release)", () => {
    run(THROW_TIMING.equipMolotov + 0.1);
    run(0.1, { aimHeld: true });
    expect(stance.state).toBe("THROW_AIMING");
    expect(stance.canPunch).toBe(false);
    expect(stance.canBlock).toBe(false);

    stance.update(DT, { ...molotov, aimHeld: true, throwPressed: true });
    expect(stance.state).toBe("THROW_THROWING");
    expect(stance.consumedClick).toBe(true);

    let releases = 0;

    for (let t = 0; t < THROW_TIMING.throw + 0.05; t += DT) {
      stance.update(DT, { ...molotov, count: 1, aimHeld: true });

      if (stance.consumeRelease()) releases++;
    }

    expect(releases).toBe(1);
  });

  it("the flame is gone after the throw leaves the hand", () => {
    run(THROW_TIMING.equipMolotov + 0.1);
    stance.update(DT, { ...molotov, throwPressed: true });
    expect(stance.lit).toBe(true);

    let litAfterRelease = false;

    for (let t = 0; t < THROW_TIMING.throw; t += DT) {
      stance.update(DT, { ...molotov, count: 1 });

      if (stance.consumeRelease()) {
        litAfterRelease = stance.lit;
      }
    }

    expect(litAfterRelease).toBe(false);
  });

  it("the last one thrown returns to the normal state with no put-away", () => {
    run(THROW_TIMING.equipMolotov + 0.1);
    stance.update(DT, { ...molotov, count: 1, throwPressed: true });
    run(THROW_TIMING.throw + 0.1, {
      selected: false,
      count: 0,
      heldCount: 0,
    });

    expect(stance.state).toBe("NORMAL");
    expect(stance.itemVisible).toBe(false);
  });

  it("switching away puts it away without lighting anything", () => {
    run(THROW_TIMING.equipMolotov + 0.1);

    stance.update(DT, { ...molotov, selected: false });
    expect(stance.state).toBe("THROW_UNEQUIPPING");
    expect(stance.lit).toBe(false);

    run(THROW_TIMING.unequip + 0.1, { selected: false });
    expect(stance.state).toBe("NORMAL");
    expect(stance.itemVisible).toBe(false);
  });

  it("going from grenades straight to a Molotov puts the grenade away, then equips the bottle", () => {
    const grenade: ThrowInput = { ...base, kind: "grenade" };

    for (let t = 0; t < THROW_TIMING.equip + 0.1; t += DT) {
      stance.update(DT, grenade);
    }

    expect(stance.heldKind).toBe("grenade");

    stance.update(DT, molotov);
    expect(stance.state).toBe("THROW_UNEQUIPPING");

    let sawNormalOrEquip = false;

    for (let t = 0; t < THROW_TIMING.unequip + 0.1; t += DT) {
      stance.update(DT, molotov);

      if (stance.state === "THROW_EQUIPPING") {
        sawNormalOrEquip = true;
        expect(stance.heldKind).toBe("molotov");
        break;
      }
    }

    expect(sawNormalOrEquip).toBe(true);

    run(THROW_TIMING.equipMolotov + 0.1);
    expect(stance.state).toBe("THROW_EQUIPPED");
    expect(stance.heldKind).toBe("molotov");
    expect(stance.lit).toBe(true);
  });

  it("a grenade is never lit", () => {
    const grenade: ThrowInput = { ...base, kind: "grenade" };

    for (let t = 0; t < 1; t += DT) {
      stance.update(DT, grenade);
    }

    expect(stance.lit).toBe(false);
  });
});

describe("ThrowStance with a smoke grenade", () => {
  let stance: ThrowStance;

  const smoke: ThrowInput = { ...base, kind: "smoke", count: 2 };

  const run = (seconds: number, input: Partial<ThrowInput> = {}): void => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      stance.update(DT, { ...smoke, ...input });
    }
  };

  beforeEach(() => {
    stance = new ThrowStance();
  });

  it("is equipped like the Molotov: out of the pocket, up to the chest, then ready", () => {
    run(0.01);
    expect(stance.state).toBe("THROW_EQUIPPING");
    expect(stance.heldKind).toBe("smoke");
    expect(stance.pose.pocket).toBeGreaterThan(0.5);

    // The same longer equip as the Molotov, and the hand comes up to the chest.
    run(THROW_TIMING.equipMolotov * 0.5);
    expect(stance.itemVisible).toBe(true);
    expect(stance.pose.light).toBeGreaterThan(0.5);

    run(THROW_TIMING.equipMolotov * 0.6);
    expect(stance.state).toBe("THROW_EQUIPPED");
    expect(stance.itemVisible).toBe(true);
    // No flame and no lighter: only the Molotov is lit.
    expect(stance.lit).toBe(false);
    expect(stance.lighting).toBe(false);
  });

  it("aims, throws and releases once, like every throwable", () => {
    run(THROW_TIMING.equipMolotov + 0.1);
    run(0.1, { aimHeld: true });
    expect(stance.state).toBe("THROW_AIMING");

    let releases = 0;

    stance.update(DT, { ...smoke, aimHeld: true, throwPressed: true });

    for (let t = 0; t < THROW_TIMING.throw + 0.05; t += DT) {
      stance.update(DT, { ...smoke, aimHeld: true });

      if (stance.consumeRelease()) {
        releases++;
      }
    }

    expect(releases).toBe(1);
  });

  it("the pin is pulled during every equip, in the first and in each one after a throw", () => {
    const pulled = (): number[] => {
      const seen: number[] = [];

      for (let t = 0; t < THROW_TIMING.equipMolotov + 0.05; t += DT) {
        stance.update(DT, { ...smoke });
        seen.push(stance.pinPull);
      }

      return seen;
    };

    const first = pulled();

    // In at the start, out by the end, and it never goes back in on the way.
    expect(first[0]).toBe(0);
    expect(first[first.length - 1]).toBe(1);
    expect(first.some((v) => v > 0 && v < 1)).toBe(true);
    expect([...first].sort((a, b) => a - b)).toEqual(first);

    // Throw it: the next one comes out of the pocket with its pin in again.
    stance.update(DT, { ...smoke, aimHeld: true });
    stance.update(DT, { ...smoke, aimHeld: true, throwPressed: true });

    for (let t = 0; t < THROW_TIMING.throw + 0.05; t += DT) {
      stance.update(DT, { ...smoke, aimHeld: true });
    }

    expect(stance.state).toBe("THROW_EQUIPPING");

    const second = pulled();

    expect(second[0]).toBeLessThan(0.2);
    expect(second.some((v) => v > 0 && v < 1)).toBe(true);
    expect(second[second.length - 1]).toBe(1);
  });

  it("a grenade's pin stays in until the throw", () => {
    run(THROW_TIMING.equipMolotov + 0.1, { kind: "grenade" });
    expect(stance.pinPull).toBe(0);
  });

  it("changing from one throwable to another puts the first away", () => {
    run(THROW_TIMING.equipMolotov + 0.1);
    run(0.02, { kind: "grenade" });

    expect(stance.state).toBe("THROW_UNEQUIPPING");
  });
});

describe("ThrowStance: a grenade's pin is pulled only when the throw is made", () => {
  let stance: ThrowStance;

  const grenade: ThrowInput = { ...base, kind: "grenade", count: 3 };
  const run = (seconds: number, input: Partial<ThrowInput> = {}): void => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      stance.update(DT, { ...grenade, ...input });
    }
  };

  beforeEach(() => {
    stance = new ThrowStance();
  });

  it("equipping and aiming leave the pin in", () => {
    run(THROW_TIMING.equip + 0.1);
    expect(stance.state).toBe("THROW_EQUIPPED");
    expect(stance.pinPull).toBe(0);

    run(0.3, { aimHeld: true });
    expect(stance.state).toBe("THROW_AIMING");
    expect(stance.pinPull).toBe(0);
  });

  it("the equip is the quick one: no chest-up preparation", () => {
    run(THROW_TIMING.equip + 0.05);
    expect(stance.state).toBe("THROW_EQUIPPED");
  });

  it("a click pulls the pin quickly, and only then does the throw start", () => {
    run(THROW_TIMING.equip + 0.1);
    run(0.1, { aimHeld: true });
    stance.update(DT, { ...grenade, aimHeld: true, throwPressed: true });

    expect(stance.state).toBe("THROW_THROWING");

    let released = -1;
    let seen = 0;
    const pulls: number[] = [];

    for (let t = 0; t < GRENADE_TOTAL + 0.1; t += DT) {
      stance.update(DT, { ...grenade, aimHeld: true });
      pulls.push(stance.pinPull);
      seen += DT;

      if (released < 0 && stance.consumeRelease()) {
        released = seen;
      }
    }

    expect(THROW_TIMING.grenadePin).toBeLessThanOrEqual(0.25);
    // The pin is fully out before the item leaves the hand...
    expect(Math.max(...pulls)).toBe(1);
    expect(released).toBeGreaterThan(THROW_TIMING.grenadePin);
    // ...and the release comes after the pull plus the first part of the throw.
    expect(released).toBeLessThan(GRENADE_TOTAL);
  });

  it("every grenade gets its own pull: the pin is back in for the next one", () => {
    run(THROW_TIMING.equip + 0.1);
    stance.update(DT, { ...grenade, throwPressed: true });
    run(GRENADE_TOTAL + 0.05);

    // Another is out of the pocket: equipping again, pin in.
    expect(stance.state).toBe("THROW_EQUIPPING");
    expect(stance.pinPull).toBe(0);
  });
});
