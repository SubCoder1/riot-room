import { beforeEach, describe, expect, it } from "vitest";

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

  it("has exactly four slots: Rocks, Molotov, Smoke and Fists", () => {
    expect(utilities.slots.map((s) => s.type)).toEqual([
      "ROCKS",
      "MOLOTOV",
      "SMOKE",
      "FISTS",
    ]);
    expect(utilities.slots.map((s) => s.name)).toEqual([
      "Rocks",
      "Molotov",
      "Smoke",
      "Fists",
    ]);
  });

  it("the fourth slot is Fists: the no-utility slot, shown with a boxing glove", () => {
    const fists = utilities.slots[3];

    expect(fists.type).toBe("FISTS");
    expect(fists.name).toBe("Fists");
    expect(fists.icon).toBe("glove");
    expect(fists.counted).toBe(false);

    // There is no slot called Empty any more.
    expect(
      utilities.slots.some((s) => /empty/i.test(`${s.type} ${s.name}`)),
    ).toBe(false);
  });

  it("starts with 3 rocks, no molotovs and no smoke; Fists has no quantity", () => {
    expect(utilities.quantityOf("ROCKS")).toBe(3);
    expect(utilities.quantityOf("MOLOTOV")).toBe(0);
    expect(utilities.quantityOf("SMOKE")).toBe(0);
    expect(utilities.quantityOf("FISTS")).toBeNull();
  });

  it("quantities are live: a pickup is just add()", () => {
    expect(utilities.add("ROCKS", 2)).toBe(5);
    expect(utilities.quantityOf("ROCKS")).toBe(5);

    utilities.add("MOLOTOV");
    utilities.add("SMOKE", 4);

    expect(utilities.quantityOf("MOLOTOV")).toBe(1);
    expect(utilities.quantityOf("SMOKE")).toBe(4);
  });

  it("add and remove ignore nonsense and never go below zero", () => {
    utilities.add("ROCKS", -3);
    utilities.add("ROCKS", 0);
    utilities.add("ROCKS", Number.NaN);
    expect(utilities.quantityOf("ROCKS")).toBe(3);

    expect(utilities.remove("ROCKS", 4)).toBe(false);
    expect(utilities.quantityOf("ROCKS")).toBe(3);

    expect(utilities.remove("ROCKS", 3)).toBe(true);
    expect(utilities.quantityOf("ROCKS")).toBe(0);
    expect(utilities.remove("ROCKS")).toBe(false);

    // The Fists slot has nothing to add to or take from.
    expect(utilities.add("FISTS", 2)).toBeNull();
    expect(utilities.remove("FISTS")).toBe(false);
  });

  it("starts on fists (Fists) so the game plays exactly as before", () => {
    expect(utilities.selected).toBe("FISTS");
    expect(utilities.usingFists).toBe(true);
    expect(utilities.active).toBeNull();
  });

  it("selecting Fists, or a utility with none left, falls back to fists", () => {
    utilities.select("ROCKS");
    expect(utilities.usingFists).toBe(false);
    expect(utilities.active).toBe("ROCKS");

    utilities.select("MOLOTOV");
    expect(utilities.selected).toBe("MOLOTOV");
    expect(utilities.usingFists).toBe(true);
    expect(utilities.active).toBeNull();

    utilities.add("MOLOTOV");
    expect(utilities.active).toBe("MOLOTOV");

    utilities.select("FISTS");
    expect(utilities.usingFists).toBe(true);

    // Running out of the selected utility drops back to fists by itself.
    utilities.select("ROCKS");
    utilities.remove("ROCKS", 3);
    expect(utilities.selected).toBe("ROCKS");
    expect(utilities.usingFists).toBe(true);
  });

  it("selecting something that isn't a slot changes nothing", () => {
    utilities.select("ROCKS");
    utilities.select("GRENADE" as never);
    expect(utilities.selected).toBe("ROCKS");
  });

  it("each player has their own inventory and selection", () => {
    const other = new PlayerUtilities();

    utilities.add("ROCKS", 5);
    utilities.select("SMOKE");

    expect(other.quantityOf("ROCKS")).toBe(3);
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

    expect(extended.slots).toHaveLength(5);
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
    utilities.select("ROCKS");
    wheel.scroll(1);

    expect(wheel.isOpen).toBe(true);
    expect(utilities.selected).toBe("MOLOTOV");
    expect(wheel.highlighted).toBe("MOLOTOV");
  });

  it("scrolling from the start (fists / Fists) goes to Rocks first", () => {
    expect(utilities.selected).toBe("FISTS");

    wheel.scroll(1);

    expect(utilities.selected).toBe("ROCKS");
    expect(utilities.usingFists).toBe(false);
  });

  it("scrolling the other way goes to the previous slot", () => {
    utilities.select("ROCKS");
    wheel.scroll(-1);

    expect(utilities.selected).toBe("FISTS");
    expect(wheel.isOpen).toBe(true);
  });

  it("steps ROCKS -> MOLOTOV -> SMOKE -> FISTS -> ROCKS, one slot per step", () => {
    utilities.select("ROCKS");

    const seen = [utilities.selected];

    for (let k = 0; k < 4; k++) {
      wheel.scroll(1);
      seen.push(utilities.selected);
    }

    expect(seen).toEqual(["ROCKS", "MOLOTOV", "SMOKE", "FISTS", "ROCKS"]);
  });

  it("steps ROCKS -> FISTS -> SMOKE -> MOLOTOV -> ROCKS the other way", () => {
    utilities.select("ROCKS");

    const seen = [utilities.selected];

    for (let k = 0; k < 4; k++) {
      wheel.scroll(-1);
      seen.push(utilities.selected);
    }

    expect(seen).toEqual(["ROCKS", "FISTS", "SMOKE", "MOLOTOV", "ROCKS"]);
  });

  it("several steps at once move that many slots, wrapping", () => {
    utilities.select("ROCKS");

    wheel.scroll(2);
    expect(utilities.selected).toBe("SMOKE");

    wheel.scroll(5);
    expect(utilities.selected).toBe("FISTS");

    wheel.scroll(-9);
    expect(utilities.selected).toBe("SMOKE");
  });

  it("no scroll means no change and no wheel", () => {
    utilities.select("SMOKE");
    wheel.scroll(0);
    wheel.scroll(0.4);

    expect(wheel.isOpen).toBe(false);
    expect(utilities.selected).toBe("SMOKE");
  });

  it("the wheel stays up for a second or two after the last scroll, then vanishes", () => {
    expect(WHEEL_VISIBLE_SECONDS).toBeGreaterThanOrEqual(1);
    expect(WHEEL_VISIBLE_SECONDS).toBeLessThanOrEqual(2);

    wheel.scroll(1);
    wheel.update(WHEEL_VISIBLE_SECONDS - 0.1);
    expect(wheel.isOpen).toBe(true);

    wheel.update(0.2);
    expect(wheel.isOpen).toBe(false);
  });

  it("scrolling again restarts the timer, and the selection stays when it closes", () => {
    wheel.scroll(1); // Rocks
    wheel.update(1);
    wheel.scroll(1); // Molotov
    wheel.update(1);

    expect(wheel.isOpen).toBe(true);
    expect(utilities.selected).toBe("MOLOTOV");

    wheel.update(1);
    expect(wheel.isOpen).toBe(false);
    expect(utilities.selected).toBe("MOLOTOV");
  });

  it("when it reopens it shows what is already selected, with nothing lost", () => {
    wheel.scroll(1); // Rocks
    wheel.update(5);
    expect(wheel.isOpen).toBe(false);

    wheel.scroll(1);
    expect(utilities.selected).toBe("MOLOTOV");
    expect(wheel.highlightedIndex).toBe(1);
  });

  it("choosing Fists returns the player to fists; a utility with none left does too", () => {
    utilities.select("ROCKS");
    expect(utilities.usingFists).toBe(false);

    wheel.scroll(-1); // Fists
    expect(utilities.selected).toBe("FISTS");
    expect(utilities.usingFists).toBe(true);

    wheel.scroll(2); // Rocks, then Molotov (none)
    expect(utilities.selected).toBe("MOLOTOV");
    expect(utilities.usingFists).toBe(true);
  });

  it("an equipped utility is equipped for real: it can be used up and gives way to fists", () => {
    wheel.scroll(1);

    expect(utilities.active).toBe("ROCKS");
    utilities.remove("ROCKS", 3);
    expect(utilities.active).toBeNull();
  });

  it("does not throw when slots without a quantity are selected", () => {
    expect(() => {
      wheel.scroll(3);
      wheel.scroll(1);
      wheel.scroll(-3);
    }).not.toThrow();
  });
});
