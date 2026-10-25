import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TacticalMap, type TeamMarker } from "../../src/ui/TacticalMap";
import { InputManager } from "../../src/input/InputManager";
import { ARENA_LAYOUT as layout } from "../../src/world/UpperFloorMap";

const own = (): string =>
  document
    .querySelector(".tactical-map-marker > g")!
    .getAttribute("transform")!;

/** The sheet's transform: 18 px a metre, the -32, -24 corner at (24, 24). */
const sheet = (x: number, z: number): [number, number] => [
  24 + (x + 32) * 18,
  24 + (z + 24) * 18,
];

const mates = (): SVGGElement[] =>
  [...document.querySelectorAll(".tactical-map-marker > g")].slice(
    1,
  ) as SVGGElement[];

const at = (el: SVGGElement): [number, number] => {
  const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(
    el.getAttribute("transform") ?? "",
  )!;

  return [Number(m[1]), Number(m[2])];
};

const mate = (id: string, x: number, z: number, over = {}): TeamMarker => ({
  id,
  name: id.toUpperCase(),
  x,
  y: 4,
  z,
  yaw: 0,
  alive: true,
  ...over,
});

describe("The M-key tactical map", () => {
  let map: TacticalMap;
  let time = 0;
  let team: TeamMarker[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (f: () => void) => {
      f();

      return 0;
    });
    // (jsdom has no canvas: the plan is skipped, the overlay still works.)
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    map = new TacticalMap(document.body, layout);
    team = [];
    time = 0;
    map.setTeammateSource(() => team);
  });

  afterEach(() => {
    map.dispose();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const tick = (x = 0, z = 0, yaw = 0, seconds = 0.016): void => {
    time += seconds;
    map.update(x, z, yaw, time);
  };

  it("starts closed, opens and closes, and never takes the pointer", () => {
    const root = document.querySelector<HTMLElement>(".tactical-map")!;

    expect(root.classList.contains("shown")).toBe(false);
    map.toggle();
    expect(map.isOpen).toBe(true);
    expect(root.classList.contains("open")).toBe(true);
    map.toggle();
    expect(map.isOpen).toBe(false);
    vi.advanceTimersByTime(500);
    expect(root.classList.contains("shown")).toBe(false);
  });

  it("puts the local marker where the player is, on the plan's world coordinates", () => {
    map.setOpen(true);
    tick(0, 0);

    const [x, y] = sheet(0, 0);

    expect(own()).toBe(`translate(${x}.0 ${y}.0) rotate(0.0)`);
    tick(-10, 5);
    expect(own()).toContain(
      `translate(${sheet(-10, 5)[0]}.0 ${sheet(-10, 5)[1]}.0)`,
    );
  });

  it("turns the facing arrow with the camera's yaw", () => {
    map.setOpen(true);
    tick(0, 0, Math.PI / 2);
    // Yaw grows toward -x (west): anticlockwise on a north-up plan.
    expect(own()).toContain("rotate(-90.0)");
    tick(0, 0, -Math.PI / 2);
    expect(own()).toContain("rotate(90.0)");
  });

  it("only moves markers while it is open", () => {
    team = [mate("a", 5, 5)];
    tick(5, 5, 1);
    expect(mates()).toHaveLength(0);
    expect(map.teammateCount).toBe(0);
  });

  describe("teammates", () => {
    beforeEach(() => map.setOpen(true));

    it("shows each reported teammate once, where the report puts them", () => {
      team = [mate("a", -10, 8), mate("b", 12, -6), mate("a", -10, 8)];
      tick();

      expect(map.teammateCount).toBe(2);
      expect(mates()).toHaveLength(2);

      const [ax, ay] = at(mates()[0]);

      expect(ax).toBeCloseTo(sheet(-10, 8)[0], 0);
      expect(ay).toBeCloseTo(sheet(-10, 8)[1], 0);
    });

    it("faces them the way they look, and follows them as they move", () => {
      team = [mate("a", 0, 0, { yaw: Math.PI / 2 })];
      tick();
      expect(mates()[0].getAttribute("transform")).toContain("rotate(-90.0)");

      team = [mate("a", 3, 0)];

      for (let i = 0; i < 40; i++) {
        tick();
      }

      expect(at(mates()[0])[0]).toBeCloseTo(sheet(3, 0)[0], 0);
    });

    it("smooths a small jump instead of snapping, and a respawn does snap", () => {
      team = [mate("a", 0, 0)];
      tick();
      team = [mate("a", 1, 0)];
      tick();

      const eased = at(mates()[0])[0];

      expect(eased).toBeGreaterThan(sheet(0, 0)[0]);
      expect(eased).toBeLessThan(sheet(1, 0)[0]);

      // Down, then back up across the map: no slide through the walls.
      team = [mate("a", 20, 15, { alive: false })];
      tick();
      expect(map.teammateCount).toBe(0);
      team = [mate("a", 20, 15)];
      tick();
      expect(at(mates()[0])[0]).toBeCloseTo(sheet(20, 15)[0], 0);

      // A teleport on an up player snaps as well.
      team = [mate("a", -25, -15)];
      tick();
      expect(at(mates()[0])[0]).toBeCloseTo(sheet(-25, -15)[0], 0);
    });

    it("removes a marker the moment its player leaves, and never leaves duplicates", () => {
      team = [mate("a", 0, 0), mate("b", 5, 5)];
      tick();
      expect(mates()).toHaveLength(2);
      team = [mate("b", 5, 5)];
      tick();
      expect(mates()).toHaveLength(1);
      team = [];
      tick();
      expect(mates()).toHaveLength(0);
      team = [mate("a", 0, 0)];
      tick();
      tick();
      expect(mates()).toHaveLength(1);
    });

    it("names a teammate only when another marker is close enough to confuse", () => {
      team = [mate("a", -20, 10), mate("b", 20, -10)];
      tick(0, 0);
      expect(mates().map((m) => m.querySelector("text")!.textContent)).toEqual([
        "",
        "",
      ]);
      team = [mate("a", -20, 10), mate("b", -19.5, 10)];
      tick(0, 0);
      expect(mates().map((m) => m.querySelector("text")!.textContent)).toEqual([
        "A",
        "B",
      ]);
    });

    it("starts every marker where its player is when the map is opened again", () => {
      team = [mate("a", 0, 0)];
      tick();
      map.setOpen(false);
      vi.advanceTimersByTime(300);
      team = [mate("a", 25, 15)];
      map.setOpen(true);
      tick();
      expect(at(mates()[0])[0]).toBeCloseTo(sheet(25, 15)[0], 0);
    });
  });
});

describe("The M key in the input manager", () => {
  it("is one press however the key is held, and nothing else is disturbed", () => {
    const input = new InputManager(document.createElement("canvas"));

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyM" }));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyM", repeat: true }),
    );
    expect(input.consumeMapToggle()).toBe(true);
    expect(input.consumeMapToggle()).toBe(false);
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyM", repeat: true }),
    );
    expect(input.consumeMapToggle()).toBe(false);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyM" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    expect(input.isPressed("KeyW")).toBe(true);
    expect(input.consumeMapToggle()).toBe(false);
    input.dispose();
  });
});
