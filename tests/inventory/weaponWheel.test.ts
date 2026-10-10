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

  it("has exactly five slots: Grenade, Molotov, Smoke, Fists and Empty", () => {
    expect(utilities.slots.map((s) => s.type)).toEqual([
      "GRENADE",
      "MOLOTOV",
      "SMOKE",
      "FISTS",
      "EMPTY",
    ]);
    expect(utilities.slots.map((s) => s.name)).toEqual([
      "Grenade",
      "Molotov",
      "Smoke",
      "Fists",
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

  it("the slots are spread evenly round the wheel, 72 degrees apart", () => {
    expect(utilities.slots.map((s) => s.angle)).toEqual([0, 72, 144, 216, 288]);
  });

  it("the Fists slot is the no-utility slot, shown with a boxing glove", () => {
    const fists = utilities.slots[3];

    expect(fists.type).toBe("FISTS");
    expect(fists.name).toBe("Fists");
    expect(fists.icon).toBe("glove");
    expect(fists.counted).toBe(false);
  });

  it("the last slot is reserved: nothing to count, nothing to equip", () => {
    const reserved = utilities.slots[4];

    expect(reserved.type).toBe("EMPTY");
    expect(reserved.reserved).toBe(true);
    expect(reserved.counted).toBe(false);
    expect(utilities.quantityOf("EMPTY")).toBeNull();
    expect(utilities.add("EMPTY", 3)).toBeNull();
    expect(utilities.remove("EMPTY")).toBe(false);
  });

  it("starts with the configured grenades and smoke grenades, no molotovs; Fists has no quantity", () => {
    expect(utilities.quantityOf("GRENADE")).toBe(
      GRENADE_CONFIG.GRENADE_START_QUANTITY,
    );
    expect(utilities.quantityOf("SMOKE")).toBe(
      SMOKE_CONFIG.SMOKE_START_QUANTITY,
    );
    expect(utilities.quantityOf("MOLOTOV")).toBe(0);
    expect(utilities.quantityOf("FISTS")).toBeNull();
  });

  it("quantities are live and independent: a pickup is just add()", () => {
    const grenades = utilities.quantityOf("GRENADE")!;
    const smoke = utilities.quantityOf("SMOKE")!;

    expect(utilities.add("GRENADE", 2)).toBe(grenades + 2);

    utilities.add("MOLOTOV");
    utilities.add("SMOKE", 4);

    expect(utilities.quantityOf("GRENADE")).toBe(grenades + 2);
    expect(utilities.quantityOf("MOLOTOV")).toBe(1);
    expect(utilities.quantityOf("SMOKE")).toBe(smoke + 4);
  });

  it("using one kind leaves the others alone", () => {
    const smoke = utilities.quantityOf("SMOKE")!;
    const grenades = utilities.quantityOf("GRENADE")!;

    expect(utilities.remove("GRENADE")).toBe(true);
    expect(utilities.quantityOf("GRENADE")).toBe(grenades - 1);
    expect(utilities.quantityOf("SMOKE")).toBe(smoke);
    expect(utilities.quantityOf("MOLOTOV")).toBe(0);
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
    expect(utilities.reservedSelected).toBe(false);
  });

  it("selecting Fists, or a utility with none left, falls back to fists", () => {
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

  it("the reserved slot can be selected but equips nothing, throws nothing and is not fists", () => {
    utilities.select("EMPTY");

    expect(utilities.selected).toBe("EMPTY");
    expect(utilities.reservedSelected).toBe(true);
    expect(utilities.active).toBeNull();
    expect(utilities.usingFists).toBe(false);
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

    expect(extended.slots).toHaveLength(6);
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

  it("scrolling back from the grenade goes round to the reserved slot", () => {
    utilities.select("GRENADE");
    wheel.scroll(-1);

    expect(utilities.selected).toBe("EMPTY");
    expect(wheel.isOpen).toBe(true);
  });

  it("steps GRENADE -> MOLOTOV -> SMOKE -> FISTS -> EMPTY -> GRENADE, one slot per step", () => {
    utilities.select("GRENADE");

    const seen = [utilities.selected];

    for (let k = 0; k < 5; k++) {
      wheel.scroll(1);
      seen.push(utilities.selected);
    }

    expect(seen).toEqual([
      "GRENADE",
      "MOLOTOV",
      "SMOKE",
      "FISTS",
      "EMPTY",
      "GRENADE",
    ]);
  });

  it("steps the other way round too", () => {
    utilities.select("GRENADE");

    const seen = [utilities.selected];

    for (let k = 0; k < 5; k++) {
      wheel.scroll(-1);
      seen.push(utilities.selected);
    }

    expect(seen).toEqual([
      "GRENADE",
      "EMPTY",
      "FISTS",
      "SMOKE",
      "MOLOTOV",
      "GRENADE",
    ]);
  });

  it("several steps at once move that many slots, wrapping", () => {
    utilities.select("GRENADE");

    wheel.scroll(2);
    expect(utilities.selected).toBe("SMOKE");

    wheel.scroll(5);
    expect(utilities.selected).toBe("SMOKE");

    wheel.scroll(-9);
    expect(utilities.selected).toBe("FISTS");
  });

  it("the highlighted index always points at the selected slot's own entry", () => {
    for (const [index, slot] of utilities.slots.entries()) {
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
    utilities.select("EMPTY");
    wheel.scroll(1); // Grenade

    expect(utilities.active).toBe("GRENADE");
    utilities.remove("GRENADE", GRENADE_CONFIG.GRENADE_START_QUANTITY);
    expect(utilities.active).toBeNull();
  });

  it("scrolling onto the reserved slot equips nothing", () => {
    utilities.select("FISTS");
    wheel.scroll(1);

    expect(utilities.selected).toBe("EMPTY");
    expect(utilities.active).toBeNull();
    expect(utilities.reservedSelected).toBe(true);
  });

  it("does not throw when slots without a quantity are selected", () => {
    expect(() => {
      wheel.scroll(3);
      wheel.scroll(1);
      wheel.scroll(-3);
    }).not.toThrow();
  });
});
