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
  const slotText = (name: string): string =>
    Array.from(view.root.querySelectorAll(".ww-slot")).find(
      (g) => g.querySelector(".ww-name")?.textContent === name,
    )?.textContent ?? "";

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

  it("draws exactly five slots, in order, ending with the reserved one", () => {
    expect(sectors()).toHaveLength(5);
    expect(view.root.querySelectorAll(".ww-slot")).toHaveLength(5);

    const names = Array.from(view.root.querySelectorAll(".ww-name")).map(
      (n) => n.textContent,
    );

    expect(names).toEqual(["GRENADE", "MOLOTOV", "SMOKE", "FISTS", "EMPTY"]);
    expect(view.root.textContent).not.toMatch(/rock/i);
  });

  it("lays the five slots out evenly round the wheel, the grenade at the top", () => {
    const place = (name: string): { x: number; y: number } => {
      const g = Array.from(view.root.querySelectorAll(".ww-slot")).find(
        (e) => e.querySelector(".ww-name")?.textContent === name,
      )!;
      const m = /translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(
        g.getAttribute("transform")!,
      )!;

      return { x: Number(m[1]), y: Number(m[2]) };
    };

    // Top, upper right, lower right, lower left, upper left.
    expect(place("GRENADE").y).toBeLessThan(-50);
    expect(Math.abs(place("GRENADE").x)).toBeLessThan(1);
    expect(place("MOLOTOV").x).toBeGreaterThan(50);
    expect(place("MOLOTOV").y).toBeLessThan(0);
    expect(place("SMOKE").x).toBeGreaterThan(30);
    expect(place("SMOKE").y).toBeGreaterThan(30);
    expect(place("FISTS").x).toBeLessThan(-30);
    expect(place("FISTS").y).toBeGreaterThan(30);
    expect(place("EMPTY").x).toBeLessThan(-50);
    expect(place("EMPTY").y).toBeLessThan(0);
  });

  it("every slot has its own icon and the rock is gone", () => {
    const icons = Array.from(view.root.querySelectorAll(".ww-icon")).map(
      (g) => (g as SVGElement).dataset.icon,
    );

    expect(icons).toEqual(["grenade", "molotov", "smoke", "glove", "empty"]);
    expect(new Set(icons).size).toBe(5);
  });

  it("shows the quantities on the slots, read from the inventory", () => {
    expect(slotText("GRENADE")).toContain("×3");
    expect(slotText("MOLOTOV")).toContain("×0");
    expect(slotText("SMOKE")).toContain("×2");

    utilities.add("GRENADE", 2);
    utilities.add("MOLOTOV", 1);
    view.render();

    expect(slotText("GRENADE")).toContain("×5");
    expect(slotText("MOLOTOV")).toContain("×1");
  });

  it("the reserved slot has no quantity and is marked as a placeholder", () => {
    const reserved = Array.from(view.root.querySelectorAll(".ww-slot")).find(
      (g) => g.querySelector(".ww-name")?.textContent === "EMPTY",
    ) as SVGElement;

    expect(reserved.querySelector(".ww-qty")).toBeNull();
    expect(reserved.dataset.reserved).toBe("true");
  });

  it("the Fists slot shows a boxing glove, not an X, and has no quantity", () => {
    const fists = Array.from(view.root.querySelectorAll(".ww-slot")).find(
      (g) => g.querySelector(".ww-name")?.textContent === "FISTS",
    )!;
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
    utilities.select("EMPTY");
    scroll(1);

    expect(selected()).toEqual(["GRENADE"]);
    expect(text(".ww-center-name")).toBe("GRENADE");
    expect(text(".ww-center-qty")).toBe("×3");

    scroll(1);
    expect(selected()).toEqual(["MOLOTOV"]);
    expect(text(".ww-center-name")).toBe("MOLOTOV");
    expect(text(".ww-center-qty")).toBe("×0");

    scroll(1);
    expect(selected()).toEqual(["SMOKE"]);
    expect(text(".ww-center-name")).toBe("SMOKE");
    expect(text(".ww-center-qty")).toBe("×2");

    scroll(1);
    expect(selected()).toEqual(["FISTS"]);
    expect(text(".ww-center-name")).toBe("FISTS");
    expect(text(".ww-center-qty")).toBe("");

    scroll(1);
    expect(selected()).toEqual(["EMPTY"]);
    expect(text(".ww-center-name")).toBe("EMPTY");
    expect(text(".ww-center-qty")).toBe("");
  });

  it("the centre quantity changes when the inventory does", () => {
    utilities.select("GRENADE");
    scroll(-1);
    scroll(1); // back to the grenade
    expect(text(".ww-center-qty")).toBe("×3");

    utilities.add("GRENADE", 2);
    view.render();
    expect(text(".ww-center-qty")).toBe("×5");
  });

  it("a slot that is used up is drawn quietly but is still there", () => {
    utilities.remove("GRENADE", 3);
    view.render();

    const grenades = Array.from(view.root.querySelectorAll(".ww-slot")).find(
      (g) => g.querySelector(".ww-name")?.textContent === "GRENADE",
    ) as SVGElement;

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

    expect(view.root.querySelectorAll(".ww-slot")).toHaveLength(6);
    expect(slotText("FLASH")).toContain("×2");
  });

  it("dispose removes it from the page", () => {
    view.dispose();
    expect(document.querySelectorAll(".weapon-wheel")).toHaveLength(0);
  });
});
