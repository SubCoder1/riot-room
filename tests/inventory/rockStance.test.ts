import { beforeEach, describe, expect, it } from "vitest";

import {
  ROCK_TIMING,
  RockStance,
  type RockInput,
} from "../../src/inventory/RockStance";

const DT = 1 / 60;

const base: RockInput = {
  selected: true,
  count: 3,
  aimHeld: false,
  throwPressed: false,
  armBusy: false,
};

describe("RockStance", () => {
  let stance: RockStance;

  const run = (seconds: number, input: Partial<RockInput> = {}): void => {
    for (let t = 0; t < seconds; t += DT) {
      stance.update(DT, { ...base, ...input });
    }
  };

  /** Selected, equipped and settled. */
  const equipped = (): void => {
    run(ROCK_TIMING.equip + 0.1);
  };

  beforeEach(() => {
    stance = new RockStance();
  });

  it("does nothing while ROCKS is not selected", () => {
    run(1, { selected: false });

    expect(stance.state).toBe("NORMAL");
    expect(stance.rockVisible).toBe(false);
    expect(stance.pose.weight).toBeLessThan(0.01);
  });

  it("selecting ROCKS plays a short equip, then holds a rock", () => {
    stance.update(DT, base);
    expect(stance.state).toBe("ROCK_EQUIPPING");
    // The hand goes to the pocket first, so no rock yet.
    expect(stance.rockVisible).toBe(false);
    expect(ROCK_TIMING.equip).toBeLessThan(0.5);

    run(ROCK_TIMING.equip * 0.7);
    expect(stance.rockVisible).toBe(true);

    equipped();
    expect(stance.state).toBe("ROCK_EQUIPPED");
    expect(stance.rockVisible).toBe(true);
    expect(stance.pose.weight).toBeGreaterThan(0.9);
    expect(stance.pose.ready).toBeGreaterThan(0.9);
  });

  it("with no rocks left, rocks cannot be equipped or aimed", () => {
    run(1, { count: 0, aimHeld: true });

    expect(stance.state).toBe("NORMAL");
    expect(stance.isAiming).toBe(false);
  });

  it("right click held aims, and releasing returns to equipped", () => {
    equipped();

    run(0.1, { aimHeld: true });
    expect(stance.state).toBe("ROCK_AIMING");
    expect(stance.isAiming).toBe(true);
    expect(stance.pose.aim).toBeGreaterThan(0.7);

    run(0.1, { aimHeld: false });
    expect(stance.state).toBe("ROCK_EQUIPPED");
  });

  it("aiming alone never throws", () => {
    equipped();
    run(1, { aimHeld: true });
    run(0.2, { aimHeld: false });

    expect(stance.consumeRelease()).toBe(false);
  });

  it("left click while aiming throws; the rock leaves the hand once, mid-throw", () => {
    equipped();
    run(0.1, { aimHeld: true });

    stance.update(DT, { ...base, aimHeld: true, throwPressed: true });
    expect(stance.state).toBe("ROCK_THROWING");
    expect(stance.consumedClick).toBe(true);
    expect(stance.consumeRelease()).toBe(false);
    expect(stance.rockVisible).toBe(true);

    let releases = 0;

    for (let t = 0; t < ROCK_TIMING.throw + 0.05; t += DT) {
      stance.update(DT, { ...base, count: 2, aimHeld: true });

      if (stance.consumeRelease()) {
        releases++;
        // Not at the very start, and the hand is empty from here on.
        expect(stance.elapsed).toBeGreaterThan(ROCK_TIMING.throw * 0.3);
      }
    }

    expect(releases).toBe(1);
    // Another rock is left: the hand goes to the pocket for it...
    expect(stance.state).toBe("ROCK_EQUIPPING");
    expect(stance.rockVisible).toBe(false);

    // ...and, still holding right click, is aiming with it once it is out.
    run(ROCK_TIMING.equip + 0.1, { count: 2, aimHeld: true });
    expect(stance.state).toBe("ROCK_AIMING");
    expect(stance.rockVisible).toBe(true);
  });

  it("the rock is gone from the hand after the release until the next one is out", () => {
    equipped();
    run(0.1, { aimHeld: true });
    stance.update(DT, { ...base, aimHeld: true, throwPressed: true });

    let sawEmptyHand = false;

    for (let t = 0; t < ROCK_TIMING.throw; t += DT) {
      stance.update(DT, { ...base, count: 2, aimHeld: true });

      if (!stance.rockVisible) {
        sawEmptyHand = true;
      }
    }

    expect(sawEmptyHand).toBe(true);
  });

  it("a click in the same frame the aim starts still throws (never a punch)", () => {
    equipped();

    stance.update(DT, { ...base, aimHeld: true, throwPressed: true });

    expect(stance.state).toBe("ROCK_THROWING");
    expect(stance.consumedClick).toBe(true);
  });

  it("a left click without aiming is a quick throw", () => {
    equipped();

    stance.update(DT, { ...base, throwPressed: true });

    expect(stance.consumedClick).toBe(true);
    expect(stance.state).toBe("ROCK_THROWING");

    let releases = 0;

    for (let t = 0; t < ROCK_TIMING.throw + 0.05; t += DT) {
      stance.update(DT, { ...base, count: 2 });
      if (stance.consumeRelease()) releases++;
    }

    expect(releases).toBe(1);
    expect(stance.state).toBe("ROCK_EQUIPPING");
  });

  it("a click while the arm is busy punching is left for the punch", () => {
    equipped();

    stance.update(DT, { ...base, throwPressed: true, armBusy: true });

    expect(stance.consumedClick).toBe(false);
    expect(stance.state).toBe("ROCK_EQUIPPED");
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
    expect(stance.state).toBe("ROCK_THROWING");
    expect(stance.canPunch).toBe(false);
  });

  it("cannot start another throw while one is in progress", () => {
    equipped();
    run(0.1, { aimHeld: true });
    stance.update(DT, { ...base, aimHeld: true, throwPressed: true });

    let releases = 0;

    for (let t = 0; t < ROCK_TIMING.throw * 0.9; t += DT) {
      // Hammering the throw button mid-throw.
      stance.update(DT, { ...base, aimHeld: true, throwPressed: true });

      if (stance.consumeRelease()) {
        releases++;
      }
    }

    expect(releases).toBe(1);
  });

  it("the last rock thrown goes back to the normal fists state", () => {
    equipped();
    run(0.1, { aimHeld: true });
    stance.update(DT, { ...base, count: 1, aimHeld: true, throwPressed: true });

    // The caller spends the rock and selects fists at the release.
    run(ROCK_TIMING.throw + 0.1, { count: 0, selected: false, aimHeld: true });

    expect(stance.state).toBe("NORMAL");
    expect(stance.rockVisible).toBe(false);
    expect(stance.isAiming).toBe(false);
  });

  it("switching away plays a put-away: hand to the pocket, rock vanishes, then normal", () => {
    equipped();

    stance.update(DT, { ...base, selected: false });
    expect(stance.state).toBe("ROCK_UNEQUIPPING");
    expect(stance.rockVisible).toBe(true);
    expect(ROCK_TIMING.unequip).toBeLessThan(0.5);

    run(ROCK_TIMING.unequip * 0.8, { selected: false });
    expect(stance.rockVisible).toBe(false);

    run(0.2, { selected: false });
    expect(stance.state).toBe("NORMAL");
    expect(stance.pose.weight).toBeLessThan(0.05);
  });

  it("switching away while aiming cancels the aim cleanly", () => {
    equipped();
    run(0.1, { aimHeld: true });

    run(0.05, { selected: false, aimHeld: true });
    expect(stance.isAiming).toBe(false);
    expect(stance.state).toBe("ROCK_UNEQUIPPING");

    run(1, { selected: false, aimHeld: true });
    expect(stance.state).toBe("NORMAL");
  });

  it("switching away mid-throw lets the throw finish, then puts the rest away", () => {
    equipped();
    run(0.1, { aimHeld: true });
    stance.update(DT, { ...base, aimHeld: true, throwPressed: true });

    let releases = 0;

    for (let t = 0; t < ROCK_TIMING.throw + 0.05; t += DT) {
      stance.update(DT, { ...base, count: 2, selected: false, aimHeld: true });

      if (stance.consumeRelease()) {
        releases++;
      }
    }

    expect(releases).toBe(1);
    expect(stance.state).toBe("ROCK_UNEQUIPPING");

    run(1, { count: 2, selected: false });
    expect(stance.state).toBe("NORMAL");
  });

  it("selecting rocks again during the put-away re-equips", () => {
    equipped();
    stance.update(DT, { ...base, selected: false });
    stance.update(DT, base);

    expect(stance.state).toBe("ROCK_EQUIPPING");
  });

  it("does not aim while the arm is busy punching or guarding, and keeps the rock", () => {
    equipped();

    run(0.5, { aimHeld: true, armBusy: true });

    expect(stance.state).toBe("ROCK_EQUIPPED");
    expect(stance.rockVisible).toBe(true);
    expect(stance.pose.weight).toBeLessThan(0.05);

    run(0.2, { aimHeld: true, armBusy: false });
    expect(stance.state).toBe("ROCK_AIMING");
  });

  it("pose weights always add up to one", () => {
    const sums: number[] = [];

    equipped();

    for (let t = 0; t < 1; t += DT) {
      stance.update(DT, { ...base, aimHeld: true, throwPressed: t > 0.3 });

      const p = stance.pose;

      sums.push(p.pocket + p.ready + p.aim + p.windup + p.release);
    }

    for (const sum of sums) {
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it("never gets stuck: after anything it settles to NORMAL when rocks are not wanted", () => {
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

describe("RockStance with a Molotov", () => {
  let stance: RockStance;

  const molotov: RockInput = { ...base, kind: "molotov", count: 2 };

  const run = (seconds: number, input: Partial<RockInput> = {}): void => {
    for (let t = 0; t < seconds; t += DT) {
      stance.update(DT, { ...molotov, ...input });
    }
  };

  beforeEach(() => {
    stance = new RockStance();
  });

  it("takes it out, lights it, then holds it lit, all in well under a second", () => {
    stance.update(DT, molotov);
    expect(stance.state).toBe("ROCK_EQUIPPING");
    expect(stance.heldKind).toBe("molotov");
    expect(stance.lit).toBe(false);

    // Brought up to be lit.
    run(ROCK_TIMING.equipMolotov * 0.5);
    expect(stance.rockVisible).toBe(true);
    expect(stance.lit).toBe(false);
    expect(stance.pose.light).toBeGreaterThan(0.5);

    run(ROCK_TIMING.equipMolotov * 0.35);
    expect(stance.lit).toBe(true);

    run(0.3);
    expect(stance.state).toBe("ROCK_EQUIPPED");
    expect(stance.lit).toBe(true);
    expect(stance.rockVisible).toBe(true);
    expect(ROCK_TIMING.equipMolotov).toBeGreaterThanOrEqual(0.4);
    expect(ROCK_TIMING.equipMolotov).toBeLessThanOrEqual(0.7);
  });

  it("with none left it cannot be equipped or aimed", () => {
    run(1, { count: 0, aimHeld: true });

    expect(stance.state).toBe("NORMAL");
    expect(stance.isAiming).toBe(false);
  });

  it("aims and throws like the rock (same states, same release)", () => {
    run(ROCK_TIMING.equipMolotov + 0.1);
    run(0.1, { aimHeld: true });
    expect(stance.state).toBe("ROCK_AIMING");
    expect(stance.canPunch).toBe(false);
    expect(stance.canBlock).toBe(false);

    stance.update(DT, { ...molotov, aimHeld: true, throwPressed: true });
    expect(stance.state).toBe("ROCK_THROWING");
    expect(stance.consumedClick).toBe(true);

    let releases = 0;

    for (let t = 0; t < ROCK_TIMING.throw + 0.05; t += DT) {
      stance.update(DT, { ...molotov, count: 1, aimHeld: true });

      if (stance.consumeRelease()) releases++;
    }

    expect(releases).toBe(1);
  });

  it("the flame is gone after the throw leaves the hand", () => {
    run(ROCK_TIMING.equipMolotov + 0.1);
    stance.update(DT, { ...molotov, throwPressed: true });
    expect(stance.lit).toBe(true);

    let litAfterRelease = false;

    for (let t = 0; t < ROCK_TIMING.throw; t += DT) {
      stance.update(DT, { ...molotov, count: 1 });

      if (stance.consumeRelease()) {
        litAfterRelease = stance.lit;
      }
    }

    expect(litAfterRelease).toBe(false);
  });

  it("the last one thrown returns to the normal state with no put-away", () => {
    run(ROCK_TIMING.equipMolotov + 0.1);
    stance.update(DT, { ...molotov, count: 1, throwPressed: true });
    run(ROCK_TIMING.throw + 0.1, {
      selected: false,
      count: 0,
      heldCount: 0,
    });

    expect(stance.state).toBe("NORMAL");
    expect(stance.rockVisible).toBe(false);
  });

  it("switching away puts it away without lighting anything", () => {
    run(ROCK_TIMING.equipMolotov + 0.1);

    stance.update(DT, { ...molotov, selected: false });
    expect(stance.state).toBe("ROCK_UNEQUIPPING");
    expect(stance.lit).toBe(false);

    run(ROCK_TIMING.unequip + 0.1, { selected: false });
    expect(stance.state).toBe("NORMAL");
    expect(stance.rockVisible).toBe(false);
  });

  it("going from rocks straight to a Molotov puts the rock away, then equips the bottle", () => {
    const rock: RockInput = { ...base, kind: "rock" };

    for (let t = 0; t < ROCK_TIMING.equip + 0.1; t += DT) {
      stance.update(DT, rock);
    }

    expect(stance.heldKind).toBe("rock");

    stance.update(DT, molotov);
    expect(stance.state).toBe("ROCK_UNEQUIPPING");

    let sawNormalOrEquip = false;

    for (let t = 0; t < ROCK_TIMING.unequip + 0.1; t += DT) {
      stance.update(DT, molotov);

      if (stance.state === "ROCK_EQUIPPING") {
        sawNormalOrEquip = true;
        expect(stance.heldKind).toBe("molotov");
        break;
      }
    }

    expect(sawNormalOrEquip).toBe(true);

    run(ROCK_TIMING.equipMolotov + 0.1);
    expect(stance.state).toBe("ROCK_EQUIPPED");
    expect(stance.heldKind).toBe("molotov");
    expect(stance.lit).toBe(true);
  });

  it("a rock is never lit", () => {
    const rock: RockInput = { ...base, kind: "rock" };

    for (let t = 0; t < 1; t += DT) {
      stance.update(DT, rock);
    }

    expect(stance.lit).toBe(false);
  });
});
