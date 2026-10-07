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

  it("draws exactly four slots, the last being Fists", () => {
    expect(sectors()).toHaveLength(4);
    expect(view.root.querySelectorAll(".ww-slot")).toHaveLength(4);

    const names = Array.from(view.root.querySelectorAll(".ww-name")).map(
      (n) => n.textContent,
    );

    expect(names).toEqual(["ROCKS", "MOLOTOV", "SMOKE", "FISTS"]);
    expect(view.root.textContent?.toLowerCase()).not.toContain("empty");
  });

  it("lays the slots out as ROCKS up, MOLOTOV right, SMOKE left and FISTS down", () => {
    const place = (name: string): { x: number; y: number } => {
      const g = Array.from(view.root.querySelectorAll(".ww-slot")).find(
        (e) => e.querySelector(".ww-name")?.textContent === name,
      )!;
      const m = /translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(
        g.getAttribute("transform")!,
      )!;

      return { x: Number(m[1]), y: Number(m[2]) };
    };

    expect(place("ROCKS").y).toBeLessThan(-50);
    expect(Math.abs(place("ROCKS").x)).toBeLessThan(1);
    expect(place("MOLOTOV").x).toBeGreaterThan(50);
    expect(place("SMOKE").x).toBeLessThan(-50);
    expect(place("FISTS").y).toBeGreaterThan(50);
  });

  it("shows the quantities on the slots, read from the inventory", () => {
    expect(slotText("ROCKS")).toContain("×3");
    expect(slotText("MOLOTOV")).toContain("×0");
    expect(slotText("SMOKE")).toContain("×0");

    utilities.add("ROCKS", 2);
    utilities.add("MOLOTOV", 1);
    view.render();

    expect(slotText("ROCKS")).toContain("×5");
    expect(slotText("MOLOTOV")).toContain("×1");
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

    utilities.select("ROCKS");
    wheel.scroll(-1); // Fists
    view.render();
    expect(text(".ww-center-qty")).toBe("");
    expect(y(".ww-center-name")).toBeGreaterThan(0);

    wheel.scroll(1); // Rocks
    view.render();
    expect(text(".ww-center-qty")).not.toBe("");
    // The pair straddles the middle: name above it, quantity below it.
    expect(y(".ww-center-name")).toBeLessThan(0);
    expect(y(".ww-center-qty")).toBeGreaterThan(0);
  });

  it("highlights exactly one slot, and the centre follows each scroll at once", () => {
    utilities.select("FISTS");
    scroll(1);

    expect(selected()).toEqual(["ROCKS"]);
    expect(text(".ww-center-name")).toBe("ROCKS");
    expect(text(".ww-center-qty")).toBe("×3");

    scroll(1);
    expect(selected()).toEqual(["MOLOTOV"]);
    expect(text(".ww-center-name")).toBe("MOLOTOV");
    expect(text(".ww-center-qty")).toBe("×0");

    scroll(1);
    expect(selected()).toEqual(["SMOKE"]);
    expect(text(".ww-center-name")).toBe("SMOKE");
    expect(text(".ww-center-qty")).toBe("×0");

    scroll(1);
    expect(selected()).toEqual(["FISTS"]);
    expect(text(".ww-center-name")).toBe("FISTS");
    expect(text(".ww-center-qty")).toBe("");
  });

  it("the centre quantity changes when the inventory does", () => {
    utilities.select("ROCKS");
    scroll(-1);
    scroll(1); // back to Rocks
    expect(text(".ww-center-qty")).toBe("×3");

    utilities.add("ROCKS", 2);
    view.render();
    expect(text(".ww-center-qty")).toBe("×5");
  });

  it("a slot that is used up is drawn quietly but is still there", () => {
    utilities.remove("ROCKS", 3);
    view.render();

    const rocks = Array.from(view.root.querySelectorAll(".ww-slot")).find(
      (g) => g.querySelector(".ww-name")?.textContent === "ROCKS",
    ) as SVGElement;

    expect(rocks.dataset.empty).toBe("true");
    expect(slotText("ROCKS")).toContain("×0");
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

    expect(view.root.querySelectorAll(".ww-slot")).toHaveLength(5);
    expect(slotText("FLASH")).toContain("×2");
  });

  it("dispose removes it from the page", () => {
    view.dispose();
    expect(document.querySelectorAll(".weapon-wheel")).toHaveLength(0);
  });
});
