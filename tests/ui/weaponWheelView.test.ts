import { beforeEach, describe, expect, it } from "vitest";

import { PlayerUtilities } from "../../src/inventory/PlayerUtilities";
import { WeaponWheel } from "../../src/inventory/WeaponWheel";
import { WeaponWheelView } from "../../src/ui/WeaponWheelView";

describe("WeaponWheelView", () => {
  let utilities: PlayerUtilities;
  let wheel: WeaponWheel;
  let view: WeaponWheelView;

  const text = (selector: string): string =>
    view.root.querySelector(selector)?.textContent ?? "";
  const sectors = (): Element[] =>
    Array.from(view.root.querySelectorAll(".ww-sector"));
  const selected = (): string[] =>
    sectors()
      .filter((s) => s.classList.contains("is-selected"))
      .map((s) => (s as SVGElement).dataset.type ?? "");
  const slotOf = (type: string): SVGElement =>
    Array.from(view.root.querySelectorAll<SVGElement>(".ww-slot")).find(
      (g) => g.dataset.type === type,
    )!;
  const slotText = (type: string): string => slotOf(type)?.textContent ?? "";

  /** One scroll, then draw (as the game loop does). */
  const scroll = (steps: number): void => {
    wheel.scroll(steps);
    view.render();
  };

  beforeEach(() => {
    document.body.innerHTML = "";
    utilities = new PlayerUtilities();
    wheel = new WeaponWheel(utilities);
    view = new WeaponWheelView(document.body, utilities, wheel);
  });

  it("is hidden until the player scrolls, shows at once on a scroll, and hides by itself", () => {
    expect(view.root.dataset.open).toBe("false");

    scroll(1);
    expect(view.root.dataset.open).toBe("true");

    wheel.update(5);
    view.render();
    expect(view.root.dataset.open).toBe("false");
  });

  it("draws exactly seven slots, in order, ending with the two reserved gun slots", () => {
    expect(sectors()).toHaveLength(7);
    expect(view.root.querySelectorAll(".ww-slot")).toHaveLength(7);

    const types = Array.from(
      view.root.querySelectorAll<SVGElement>(".ww-slot"),
    ).map((g) => g.dataset.type);

    expect(types).toEqual([
      "GRENADE",
      "MOLOTOV",
      "SMOKE",
      "FISTS",
      "DYNAMITE",
      "GUN_1",
      "GUN_2",
    ]);

    const names = Array.from(view.root.querySelectorAll(".ww-name")).map(
      (n) => n.textContent,
    );

    // The placeholders carry no name.
    expect(names).toEqual([
      "GRENADE",
      "MOLOTOV",
      "SMOKE",
      "FISTS",
      "DYNAMITE",
      "",
      "",
    ]);
    expect(view.root.textContent).not.toMatch(/rock/i);
  });

  it("lays the seven slots out evenly round the wheel, the grenade at the top", () => {
    const place = (type: string): { x: number; y: number } => {
      const m = /translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(
        slotOf(type).getAttribute("transform")!,
      )!;

      return { x: Number(m[1]), y: Number(m[2]) };
    };
    const types = [
      "GRENADE",
      "MOLOTOV",
      "SMOKE",
      "FISTS",
      "DYNAMITE",
      "GUN_1",
      "GUN_2",
    ];

    // Every block is on one circle, 360 / 7 degrees from the next, clockwise
    // from the top.
    const radius = Math.hypot(place("GRENADE").x, place("GRENADE").y);

    types.forEach((type, k) => {
      const { x, y } = place(type);
      const angle = (k * 2 * Math.PI) / 7;

      expect(Math.hypot(x, y)).toBeCloseTo(radius, 1);
      expect(x).toBeCloseTo(radius * Math.sin(angle), 1);
      expect(y).toBeCloseTo(-radius * Math.cos(angle), 1);
    });

    expect(place("GRENADE").y).toBeLessThan(-50);
    expect(place("MOLOTOV").x).toBeGreaterThan(50);
    // The two gun slots sit together at the upper left, mirroring the
    // grenade's neighbour on the right.
    expect(place("GUN_1").x).toBeLessThan(-50);
    expect(place("GUN_2").x).toBeLessThan(-30);
    expect(place("GUN_2").y).toBeLessThan(place("GUN_1").y);
  });

  it("keeps the blocks apart: no two neighbouring slots are closer than the width of a name", () => {
    const point = (type: string): [number, number] => {
      const m = /translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(
        slotOf(type).getAttribute("transform")!,
      )!;

      return [Number(m[1]), Number(m[2])];
    };
    const types = utilities.slots.map((s) => s.type);

    types.forEach((type, k) => {
      const [x0, y0] = point(type);
      const [x1, y1] = point(types[(k + 1) % types.length]);

      expect(Math.hypot(x1 - x0, y1 - y0)).toBeGreaterThan(75);
    });
  });

  it("every slot has its own icon and the rock is gone", () => {
    const icons = Array.from(
      view.root.querySelectorAll(".ww-icon:not([data-placeholder])"),
    ).map((g) => (g as SVGElement).dataset.icon);

    expect(icons).toEqual([
      "grenade",
      "molotov",
      "smoke",
      "glove",
      "dynamite",
      "empty",
      "empty",
    ]);
    expect(new Set(icons).size).toBe(6);
  });

  it("shows the quantities on the slots, read from the inventory", () => {
    expect(slotText("GRENADE")).toContain("×1");
    expect(slotText("MOLOTOV")).toContain("×1");
    expect(slotText("SMOKE")).toContain("×1");

    utilities.add("GRENADE", 2);
    utilities.add("MOLOTOV", 1);
    view.render();

    expect(slotText("GRENADE")).toContain("×3");
    expect(slotText("MOLOTOV")).toContain("×2");
  });

  it("the two gun slots have no quantity, no name, and are marked as placeholders", () => {
    for (const type of ["GUN_1", "GUN_2"]) {
      const reserved = slotOf(type);

      expect(reserved.querySelector(".ww-qty")).toBeNull();
      expect(reserved.querySelector(".ww-name")?.textContent).toBe("");
      expect(reserved.dataset.reserved).toBe("true");
    }
  });

  it("the dynamite slot is locked until the dynamite is taken, then shows its name at once", () => {
    expect(slotOf("DYNAMITE").dataset.locked).toBe("true");
    expect(slotOf("DYNAMITE").querySelector(".ww-qty")).toBeNull();

    utilities.add("DYNAMITE");
    view.render();

    expect(slotOf("DYNAMITE").dataset.locked).toBe("false");
    expect(slotText("DYNAMITE")).toContain("DYNAMITE");

    utilities.remove("DYNAMITE");
    view.render();
    expect(slotOf("DYNAMITE").dataset.locked).toBe("true");
  });

  it("only an available slot is ever highlighted: never the locked dynamite or a gun slot", () => {
    for (let k = 0; k < 12; k++) {
      scroll(1);

      expect(selected()).toHaveLength(1);
      expect(["DYNAMITE", "GUN_1", "GUN_2"]).not.toContain(selected()[0]);
    }

    utilities.add("DYNAMITE");
    utilities.select("FISTS");
    scroll(1);
    expect(selected()).toEqual(["DYNAMITE"]);
    expect(text(".ww-center-name")).toBe("DYNAMITE");
    expect(text(".ww-center-qty")).toBe("");
  });

  it("the placeholders take no pointer: the wheel is a display only", () => {
    expect(view.root.querySelector("a, button, input")).toBeNull();
    for (const type of ["GUN_1", "GUN_2"]) {
      const before = utilities.selected;

      slotOf(type).dispatchEvent(new MouseEvent("click", { bubbles: true }));
      view.render();
      expect(utilities.selected).toBe(before);
    }
  });

  it("the Fists slot shows a boxing glove, not an X, and has no quantity", () => {
    const fists = slotOf("FISTS");
    const icon = fists.querySelector(".ww-icon") as SVGElement;

    expect(icon.dataset.icon).toBe("glove");
    // Not the old two-line cross.
    expect(icon.querySelectorAll("line")).not.toHaveLength(2);
    expect(icon.children.length).toBeGreaterThan(2);
    expect(fists.querySelector(".ww-qty")).toBeNull();
  });

  it("the centre text is centred: a lone name sits in the exact middle, a name with a quantity is a balanced pair", () => {
    const y = (selector: string): number =>
      Number(view.root.querySelector(selector)!.getAttribute("y"));

    utilities.select("GRENADE");
    wheel.scroll(3); // Fists
    view.render();
    expect(text(".ww-center-qty")).toBe("");
    expect(y(".ww-center-name")).toBeGreaterThan(0);

    wheel.scroll(2); // Grenade
    view.render();
    expect(text(".ww-center-qty")).not.toBe("");
    // The pair straddles the middle: name above it, quantity below it.
    expect(y(".ww-center-name")).toBeLessThan(0);
    expect(y(".ww-center-qty")).toBeGreaterThan(0);
  });

  it("highlights exactly one slot, and the centre follows each scroll at once", () => {
    utilities.remove("MOLOTOV", 1); // (the test starts with none)
    utilities.remove("MOLOTOV", 1);
    utilities.add("DYNAMITE");
    utilities.select("DYNAMITE");
    scroll(1);

    expect(selected()).toEqual(["GRENADE"]);
    expect(text(".ww-center-name")).toBe("GRENADE");
    expect(text(".ww-center-qty")).toBe("×1");

    scroll(1);
    expect(selected()).toEqual(["MOLOTOV"]);
    expect(text(".ww-center-name")).toBe("MOLOTOV");
    expect(text(".ww-center-qty")).toBe("×0");

    scroll(1);
    expect(selected()).toEqual(["SMOKE"]);
    expect(text(".ww-center-name")).toBe("SMOKE");
    expect(text(".ww-center-qty")).toBe("×1");

    scroll(1);
    expect(selected()).toEqual(["FISTS"]);
    expect(text(".ww-center-name")).toBe("FISTS");
    expect(text(".ww-center-qty")).toBe("");

    scroll(1);
    expect(selected()).toEqual(["DYNAMITE"]);
    expect(text(".ww-center-name")).toBe("DYNAMITE");
    expect(text(".ww-center-qty")).toBe("");
  });

  it("the centre quantity changes when the inventory does", () => {
    utilities.remove("MOLOTOV", 1); // (the test starts with none)
    utilities.select("GRENADE");
    scroll(-1);
    scroll(1); // back to the grenade
    expect(text(".ww-center-qty")).toBe("×1");

    utilities.add("GRENADE", 2);
    view.render();
    expect(text(".ww-center-qty")).toBe("×3");
  });

  it("a slot that is used up is drawn quietly but is still there", () => {
    utilities.remove("MOLOTOV", 1); // (the test starts with none)
    utilities.remove("GRENADE", 1);
    view.render();

    const grenades = slotOf("GRENADE");

    expect(grenades.dataset.empty).toBe("true");
    expect(slotText("GRENADE")).toContain("×0");
  });

  it("draws a new utility without any change to the view", () => {
    const more = new PlayerUtilities([
      ...utilities.slots,
      {
        type: "FLASH" as never,
        name: "Flash",
        icon: "smoke",
        counted: true,
        startingQuantity: 2,
        angle: 45,
      },
    ]);

    document.body.innerHTML = "";
    view = new WeaponWheelView(document.body, more, new WeaponWheel(more));

    expect(view.root.querySelectorAll(".ww-slot")).toHaveLength(8);
    expect(slotText("FLASH")).toContain("×2");
  });

  it("dispose removes it from the page", () => {
    view.dispose();
    expect(document.querySelectorAll(".weapon-wheel")).toHaveLength(0);
  });
});
