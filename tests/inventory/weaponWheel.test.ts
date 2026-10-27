import { beforeEach, describe, expect, it } from "vitest";

import { GRENADE_CONFIG } from "../../src/combat/GrenadeConfig";
import { SMOKE_CONFIG } from "../../src/combat/SmokeConfig";
import {
  PlayerUtilities,
  UTILITY_SLOTS,
  type UtilityDefinition,
} from "../../src/inventory/PlayerUtilities";
import {
  WHEEL_VISIBLE_SECONDS,
  WeaponWheel,
} from "../../src/inventory/WeaponWheel";

describe("PlayerUtilities", () => {
  let utilities: PlayerUtilities;

  beforeEach(() => {
    utilities = new PlayerUtilities();
  });

  it("has exactly seven slots: Grenade, Molotov, Smoke, Fists, Dynamite and two gun slots", () => {
    expect(utilities.slots.map((s) => s.type)).toEqual([
      "GRENADE",
      "MOLOTOV",
      "SMOKE",
      "FISTS",
      "DYNAMITE",
      "GUN_1",
      "GUN_2",
    ]);
    expect(utilities.slots.map((s) => s.name)).toEqual([
      "Grenade",
      "Molotov",
      "Smoke",
      "Fists",
      "Dynamite",
      "Empty",
      "Empty",
    ]);
  });

  it("has no Rocks slot or icon any more", () => {
    expect(
      utilities.slots.some((s) =>
        /rock/i.test(`${s.type} ${s.name} ${s.icon}`),
      ),
    ).toBe(false);
    expect(utilities.quantityOf("ROCKS" as never)).toBeNull();
  });

  it("the Grenade takes the first (former rock) slot, at the top of the wheel", () => {
    expect(utilities.slots[0].type).toBe("GRENADE");
    expect(utilities.slots[0].icon).toBe("grenade");
    expect(utilities.slots[0].angle).toBe(0);
  });

  it("the slots are spread evenly round the wheel, 360 / 7 degrees apart", () => {
    utilities.slots.forEach((slot, k) => {
      expect(slot.angle).toBeCloseTo((k * 360) / 7, 6);
    });
  });

  it("the Fists slot is the no-utility slot, shown with a boxing glove", () => {
    const fists = utilities.slots[3];

    expect(fists.type).toBe("FISTS");
    expect(fists.name).toBe("Fists");
    expect(fists.icon).toBe("glove");
    expect(fists.counted).toBe(false);
  });

  it("the last two slots are reserved for guns: nothing to count, nothing to equip", () => {
    for (const k of [5, 6]) {
      const reserved = utilities.slots[k];

      expect(reserved.reserved).toBe(true);
      expect(reserved.counted).toBe(false);
      expect(utilities.isAvailable(reserved.type)).toBe(false);
      expect(utilities.quantityOf(reserved.type)).toBeNull();
      expect(utilities.add(reserved.type, 3)).toBeNull();
      expect(utilities.remove(reserved.type)).toBe(false);
    }
  });

  it("the dynamite is locked until it is picked up, then available, and never more than one", () => {
    expect(utilities.slots[4].type).toBe("DYNAMITE");
    expect(utilities.quantityOf("DYNAMITE")).toBe(0);
    expect(utilities.isAvailable("DYNAMITE")).toBe(false);

    utilities.select("DYNAMITE");
    expect(utilities.selected).toBe("FISTS");

    expect(utilities.add("DYNAMITE", 1)).toBe(1);
    expect(utilities.add("DYNAMITE", 1)).toBe(1);
    expect(utilities.isAvailable("DYNAMITE")).toBe(true);

    utilities.select("DYNAMITE");
    expect(utilities.selected).toBe("DYNAMITE");
  });

  it("the dynamite in hand is held: not thrown, not fists, nothing active", () => {
    utilities.add("DYNAMITE");
    utilities.select("DYNAMITE");

    expect(utilities.missionSelected).toBe(true);
    expect(utilities.active).toBeNull();
    expect(utilities.usingFists).toBe(false);
  });

  it("a used or reset dynamite gives way to fists by itself", () => {
    utilities.add("DYNAMITE");
    utilities.select("DYNAMITE");
    utilities.remove("DYNAMITE");

    expect(utilities.isAvailable("DYNAMITE")).toBe(false);
    expect(utilities.selected).toBe("FISTS");
    expect(utilities.missionSelected).toBe(false);
    expect(utilities.usingFists).toBe(true);
  });

  it("the gun slots can never be selected", () => {
    utilities.select("GRENADE");
    utilities.select("GUN_1");
    expect(utilities.selected).toBe("GRENADE");
    utilities.select("GUN_2");
    expect(utilities.selected).toBe("GRENADE");
  });

  it("starts with exactly one grenade, one smoke grenade and one molotov; Fists has no quantity", () => {
    expect(utilities.quantityOf("GRENADE")).toBe(
      GRENADE_CONFIG.GRENADE_START_QUANTITY,
    );
    expect(utilities.quantityOf("SMOKE")).toBe(
      SMOKE_CONFIG.SMOKE_START_QUANTITY,
    );
    expect(utilities.quantityOf("GRENADE")).toBe(1);
    expect(utilities.quantityOf("SMOKE")).toBe(1);
    expect(utilities.quantityOf("MOLOTOV")).toBe(1);
    expect(utilities.quantityOf("FISTS")).toBeNull();
  });

  it("quantities are live and independent: a pickup is just add()", () => {
    const grenades = utilities.quantityOf("GRENADE")!;
    const smoke = utilities.quantityOf("SMOKE")!;

    expect(utilities.add("GRENADE", 2)).toBe(grenades + 2);

    utilities.add("MOLOTOV");
    utilities.add("SMOKE", 4);

    expect(utilities.quantityOf("GRENADE")).toBe(grenades + 2);
    expect(utilities.quantityOf("MOLOTOV")).toBe(2);
    expect(utilities.quantityOf("SMOKE")).toBe(smoke + 4);
  });

  it("using one kind leaves the others alone", () => {
    const smoke = utilities.quantityOf("SMOKE")!;
    const grenades = utilities.quantityOf("GRENADE")!;

    expect(utilities.remove("GRENADE")).toBe(true);
    expect(utilities.quantityOf("GRENADE")).toBe(grenades - 1);
    expect(utilities.quantityOf("SMOKE")).toBe(smoke);
    expect(utilities.quantityOf("MOLOTOV")).toBe(1);
  });

  it("add and remove ignore nonsense and never go below zero", () => {
    const grenades = utilities.quantityOf("GRENADE")!;

    utilities.add("GRENADE", -3);
    utilities.add("GRENADE", 0);
    utilities.add("GRENADE", Number.NaN);
    expect(utilities.quantityOf("GRENADE")).toBe(grenades);

    expect(utilities.remove("GRENADE", grenades + 1)).toBe(false);
    expect(utilities.quantityOf("GRENADE")).toBe(grenades);

    expect(utilities.remove("GRENADE", grenades)).toBe(true);
    expect(utilities.quantityOf("GRENADE")).toBe(0);
    expect(utilities.remove("GRENADE")).toBe(false);
    expect(utilities.quantityOf("GRENADE")).toBe(0);

    // The Fists slot has nothing to add to or take from.
    expect(utilities.add("FISTS", 2)).toBeNull();
    expect(utilities.remove("FISTS")).toBe(false);
  });

  it("starts on fists so the game plays exactly as before", () => {
    expect(utilities.selected).toBe("FISTS");
    expect(utilities.usingFists).toBe(true);
    expect(utilities.active).toBeNull();
    expect(utilities.missionSelected).toBe(false);
  });

  it("selecting Fists, or a utility with none left, falls back to fists", () => {
    utilities.remove("MOLOTOV", 1); // (the test starts with none)
    utilities.select("GRENADE");
    expect(utilities.usingFists).toBe(false);
    expect(utilities.active).toBe("GRENADE");

    utilities.select("MOLOTOV");
    expect(utilities.selected).toBe("MOLOTOV");
    expect(utilities.usingFists).toBe(true);
    expect(utilities.active).toBeNull();

    utilities.add("MOLOTOV");
    expect(utilities.active).toBe("MOLOTOV");

    utilities.select("FISTS");
    expect(utilities.usingFists).toBe(true);

    // Running out of the selected utility drops back to fists by itself.
    utilities.select("GRENADE");
    utilities.remove("GRENADE", GRENADE_CONFIG.GRENADE_START_QUANTITY);
    expect(utilities.selected).toBe("GRENADE");
    expect(utilities.usingFists).toBe(true);
  });

  it("switching slots never resets any quantity", () => {
    utilities.remove("GRENADE");
    utilities.add("MOLOTOV", 2);

    const before = ["GRENADE", "MOLOTOV", "SMOKE"].map((t) =>
      utilities.quantityOf(t as never),
    );

    for (const slot of utilities.slots) {
      utilities.select(slot.type);
    }

    utilities.select("FISTS");

    expect(
      ["GRENADE", "MOLOTOV", "SMOKE"].map((t) =>
        utilities.quantityOf(t as never),
      ),
    ).toEqual(before);
  });

  it("selecting something that isn't a slot changes nothing", () => {
    utilities.select("GRENADE");
    utilities.select("ROCKS" as never);
    expect(utilities.selected).toBe("GRENADE");
  });

  it("each player has their own inventory and selection", () => {
    const other = new PlayerUtilities();
    const grenades = other.quantityOf("GRENADE")!;

    utilities.add("GRENADE", 5);
    utilities.select("SMOKE");

    expect(other.quantityOf("GRENADE")).toBe(grenades);
    expect(other.selected).toBe("FISTS");
  });

  it("a new utility is one more entry in the list", () => {
    const flash: UtilityDefinition = {
      type: "FLASH" as never,
      name: "Flash",
      icon: "smoke",
      counted: true,
      startingQuantity: 2,
      angle: 45,
    };
    const extended = new PlayerUtilities([...UTILITY_SLOTS, flash]);

    expect(extended.slots).toHaveLength(8);
    expect(extended.quantityOf("FLASH" as never)).toBe(2);
    extended.add("FLASH" as never, 1);
    expect(extended.quantityOf("FLASH" as never)).toBe(3);
  });
});

describe("WeaponWheel: opens on scroll, equips at once, fades by itself", () => {
  let utilities: PlayerUtilities;
  let wheel: WeaponWheel;

  beforeEach(() => {
    utilities = new PlayerUtilities();
    wheel = new WeaponWheel(utilities);
  });

  it("is closed until the player scrolls", () => {
    expect(wheel.isOpen).toBe(false);
    wheel.update(1);
    expect(wheel.isOpen).toBe(false);
  });

  it("one scroll opens the wheel and equips the next slot in the same moment", () => {
    utilities.select("GRENADE");
    wheel.scroll(1);

    expect(wheel.isOpen).toBe(true);
    expect(utilities.selected).toBe("MOLOTOV");
    expect(wheel.highlighted).toBe("MOLOTOV");
  });

  const walk = (steps: number): string[] => {
    const seen: string[] = [utilities.selected];

    for (let k = 0; k < Math.abs(steps); k++) {
      wheel.scroll(Math.sign(steps));
      seen.push(utilities.selected);
    }

    return seen;
  };

  it("scrolling back from the grenade goes round to the fists: the locked dynamite and the gun slots are skipped", () => {
    utilities.select("GRENADE");
    wheel.scroll(-1);

    expect(utilities.selected).toBe("FISTS");
    expect(wheel.isOpen).toBe(true);
  });

  it("before the pickup, steps GRENADE -> MOLOTOV -> SMOKE -> FISTS -> GRENADE (the dynamite and guns skipped)", () => {
    utilities.select("GRENADE");

    expect(walk(4)).toEqual([
      "GRENADE",
      "MOLOTOV",
      "SMOKE",
      "FISTS",
      "GRENADE",
    ]);
  });

  it("after the pickup, the dynamite is a stop between the fists and the grenade", () => {
    utilities.add("DYNAMITE");
    utilities.select("GRENADE");

    expect(walk(5)).toEqual([
      "GRENADE",
      "MOLOTOV",
      "SMOKE",
      "FISTS",
      "DYNAMITE",
      "GRENADE",
    ]);
  });

  it("steps the other way round too, never onto a slot that is not available", () => {
    utilities.add("DYNAMITE");
    utilities.select("GRENADE");

    expect(walk(-5)).toEqual([
      "GRENADE",
      "DYNAMITE",
      "FISTS",
      "SMOKE",
      "MOLOTOV",
      "GRENADE",
    ]);
  });

  it("several steps at once move that many available slots, wrapping", () => {
    utilities.select("GRENADE");

    wheel.scroll(2);
    expect(utilities.selected).toBe("SMOKE");

    wheel.scroll(5); // four to a lap: one more than a lap
    expect(utilities.selected).toBe("FISTS");

    wheel.scroll(-9);
    expect(utilities.selected).toBe("SMOKE");
  });

  it("many scrolls in a row never land on a slot that cannot be selected", () => {
    for (let k = 0; k < 40; k++) {
      wheel.scroll(k % 3 === 0 ? -1 : 1);

      expect(utilities.isAvailable(utilities.selected)).toBe(true);
      expect(["DYNAMITE", "GUN_1", "GUN_2"]).not.toContain(utilities.selected);
    }
  });

  it("the highlighted index always points at the selected slot's own entry", () => {
    utilities.add("DYNAMITE");

    for (const [index, slot] of utilities.slots.entries()) {
      if (!utilities.isAvailable(slot.type)) {
        continue;
      }

      utilities.select(slot.type);

      expect(wheel.highlightedIndex).toBe(index);
      expect(utilities.slots[wheel.highlightedIndex].type).toBe(slot.type);
    }
  });

  it("no scroll means no change and no wheel", () => {
    utilities.select("SMOKE");
    wheel.scroll(0);
    wheel.scroll(0.4);

    expect(wheel.isOpen).toBe(false);
    expect(utilities.selected).toBe("SMOKE");
  });

  it("the wheel stays up briefly after the last scroll, then vanishes", () => {
    expect(WHEEL_VISIBLE_SECONDS).toBeGreaterThanOrEqual(0.5);
    expect(WHEEL_VISIBLE_SECONDS).toBeLessThanOrEqual(1);

    wheel.scroll(1);
    wheel.update(WHEEL_VISIBLE_SECONDS - 0.1);
    expect(wheel.isOpen).toBe(true);

    wheel.update(0.2);
    expect(wheel.isOpen).toBe(false);
  });

  it("scrolling again restarts the timer, and the selection stays when it closes", () => {
    const most = WHEEL_VISIBLE_SECONDS * 0.7;

    utilities.select("GRENADE");
    wheel.scroll(1); // Molotov
    wheel.update(most);
    wheel.scroll(1); // Smoke
    wheel.update(most);

    expect(wheel.isOpen).toBe(true);
    expect(utilities.selected).toBe("SMOKE");

    wheel.update(most);
    expect(wheel.isOpen).toBe(false);
    expect(utilities.selected).toBe("SMOKE");
  });

  it("when it reopens it shows what is already selected, with nothing lost", () => {
    utilities.select("GRENADE");
    wheel.scroll(1); // Molotov
    wheel.update(5);
    expect(wheel.isOpen).toBe(false);

    wheel.scroll(1);
    expect(utilities.selected).toBe("SMOKE");
    expect(wheel.highlightedIndex).toBe(2);
  });

  it("choosing Fists returns the player to fists; a utility with none left does too", () => {
    utilities.remove("MOLOTOV", 1); // (the test starts with none)
    utilities.select("GRENADE");
    expect(utilities.usingFists).toBe(false);

    wheel.scroll(3); // Fists
    expect(utilities.selected).toBe("FISTS");
    expect(utilities.usingFists).toBe(true);

    wheel.scroll(-2); // Molotov (none)
    expect(utilities.selected).toBe("MOLOTOV");
    expect(utilities.usingFists).toBe(true);
  });

  it("an equipped utility is equipped for real: it can be used up and gives way to fists", () => {
    utilities.select("FISTS");
    wheel.scroll(1); // Grenade (the dynamite is locked)

    expect(utilities.active).toBe("GRENADE");
    utilities.remove("GRENADE", GRENADE_CONFIG.GRENADE_START_QUANTITY);
    expect(utilities.active).toBeNull();
  });

  it("scrolling onto the dynamite holds it: nothing to throw, nothing to punch with", () => {
    utilities.add("DYNAMITE");
    utilities.select("FISTS");
    wheel.scroll(1);

    expect(utilities.selected).toBe("DYNAMITE");
    expect(utilities.active).toBeNull();
    expect(utilities.missionSelected).toBe(true);
  });

  it("picking the dynamite up while the game runs is felt by the next scroll, with no reload", () => {
    utilities.select("FISTS");
    wheel.scroll(1);
    expect(utilities.selected).toBe("GRENADE");

    utilities.add("DYNAMITE");
    utilities.select("FISTS");
    wheel.scroll(1);
    expect(utilities.selected).toBe("DYNAMITE");
  });

  it("does not throw when slots without a quantity are selected", () => {
    expect(() => {
      wheel.scroll(3);
      wheel.scroll(1);
      wheel.scroll(-3);
    }).not.toThrow();
  });
});
