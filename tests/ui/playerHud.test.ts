import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";

import { Health, MAX_HEALTH } from "../../src/combat/Combatant";
import { PlayerCombatant } from "../../src/combat/PlayerCombatant";
import { PlayerUtilities } from "../../src/inventory/PlayerUtilities";
import { EquippedHud, describeEquipped } from "../../src/ui/EquippedHud";
import { Minimap } from "../../src/ui/Minimap";
import {
  CRITICAL_AT,
  PlayerHealthBar,
  SEGMENTS,
} from "../../src/ui/PlayerHealthBar";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";

const player = (): PlayerCombatant =>
  new PlayerCombatant(
    { createHurtboxes: () => [] } as never,
    () => 0,
    () => false,
    () => new THREE.Vector3(),
    () => new THREE.Vector3(),
    () => false,
    () => 0,
  );

describe("Health: 100 at most, never below 0", () => {
  it("starts at exactly 100 (the player's too)", () => {
    expect(MAX_HEALTH).toBe(100);
    expect(new Health().current).toBe(100);
    expect(new Health().max).toBe(100);
    expect(player().health.current).toBe(100);
  });

  it("never goes below 0 or above max, whatever the damage", () => {
    const health = new Health();

    expect(health.damage(30)).toBe(30);
    expect(health.current).toBe(70);
    expect(health.damage(500)).toBe(70);
    expect(health.current).toBe(0);
    expect(health.damage(10)).toBe(0);
    expect(health.current).toBe(0);
    expect(health.damage(-25)).toBe(0);
    expect(health.damage(Number.NaN)).toBe(0);
    expect(health.current).toBe(0);
    health.reset();
    expect(health.damage(-50)).toBe(0);
    expect(health.current).toBe(100);
  });
});

describe("PlayerHealthBar: number and seven segments; red at 25 or below", () => {
  let bar: PlayerHealthBar;

  beforeEach(() => {
    document.body.innerHTML = "";
    bar = new PlayerHealthBar(document.body);
  });

  const lit = (): number =>
    document.querySelectorAll(".player-health__segment.on").length;

  it("shows the number and the lit segments in step at 100, 75, 50, 25, 10 and 0", () => {
    for (const [hp, segments, red] of [
      [100, 7, false],
      [75, 6, false],
      [50, 4, false],
      [26, 2, false],
      [25, 2, true],
      [10, 1, true],
      [0, 0, true],
    ] as const) {
      bar.update({ current: hp, max: 100 });
      expect(bar.text).toBe(String(hp));
      expect(lit(), `${hp} HP`).toBe(segments);
      expect(bar.isCritical, `${hp} HP`).toBe(red);
      expect(
        document
          .querySelector(".player-health")!
          .classList.contains("critical"),
      ).toBe(red);
    }

    expect(CRITICAL_AT).toBe(25);
    expect(SEGMENTS).toBe(7);
  });

  it("is the number and a bar of seven rectangles, in that order, with no icon", () => {
    const root = document.querySelector(".player-health")!;

    expect(
      [...root.children].map(
        (c) => (c.getAttribute("class") ?? "").split(" ")[0],
      ),
    ).toEqual(["player-health__value", "player-health__bar"]);
    expect(root.querySelectorAll(".player-health__segment")).toHaveLength(7);
  });

  it("goes red and back across the threshold, on the real value", () => {
    bar.update({ current: 26, max: 100 });
    expect(bar.isCritical).toBe(false);
    bar.update({ current: 25, max: 100 });
    expect(bar.isCritical).toBe(true);
    bar.update({ current: 26, max: 100 });
    expect(bar.isCritical).toBe(false);
  });

  it("never shows more than max or less than zero, and only whole numbers", () => {
    bar.update({ current: 140, max: 100 });
    expect(bar.text).toBe("100");
    expect(lit()).toBe(7);
    bar.update({ current: -20, max: 100 });
    expect(bar.text).toBe("0");
    expect(lit()).toBe(0);
    bar.update({ current: 36.4, max: 100 });
    expect(bar.text).toBe("37");
  });

  it("the number follows the health in the same update (no animation delay)", () => {
    bar.update({ current: 100, max: 100 });
    bar.update({ current: 37, max: 100 });
    expect(document.querySelector(".player-health__value")!.textContent).toBe(
      "37",
    );
  });

  it("dispose removes it", () => {
    bar.dispose();
    expect(document.querySelectorAll(".player-health")).toHaveLength(0);
  });
});

describe("Minimap: the M-key plan, small", () => {
  let map: Minimap;

  beforeEach(() => {
    document.body.innerHTML = "";
    map = new Minimap(document.body, ARENA_LAYOUT);
  });

  it("is one round canvas in the corner, with no frame, legend or labels in the DOM", () => {
    const root = document.querySelector(".minimap")!;

    expect(root.querySelectorAll("canvas")).toHaveLength(1);
    expect(root.textContent).toBe("");
  });

  it("takes the local player and the teammate feed without touching the network", () => {
    map.setTeammateSource(() => [
      { id: "a", x: 0, y: 0, z: 0, yaw: 0, alive: true },
      { id: "b", x: 5, y: 4, z: 5, yaw: 1, alive: false },
    ]);
    expect(() => map.update(0, 0, 0, 0.5, 1 / 60)).not.toThrow();
    expect(() => map.update(3, 0, -4, 1.2, 1 / 60)).not.toThrow();
  });

  it("hides while told to (the full map is up) and shows again", () => {
    const root = document.querySelector(".minimap")!;

    map.setVisible(false);
    expect(root.classList.contains("hidden")).toBe(true);
    map.setVisible(true);
    expect(root.classList.contains("hidden")).toBe(false);
  });

  it("dispose removes it", () => {
    map.dispose();
    expect(document.querySelectorAll(".minimap")).toHaveLength(0);
  });
});

describe("EquippedHud: only the item in hand", () => {
  const carry = (type: string): number => (type === "MOLOTOV" ? 1 : 2);
  let utilities: PlayerUtilities;
  let hud: EquippedHud;

  beforeEach(() => {
    document.body.innerHTML = "";
    utilities = new PlayerUtilities();
    hud = new EquippedHud(document.body, utilities, carry);
  });

  const root = (): HTMLElement => document.querySelector(".equipped")!;

  it("shows fists with no counter at the start", () => {
    expect(root().dataset.type).toBe("FISTS");
    expect(root().querySelector(".equipped__count")).toBeNull();
    expect(root().querySelectorAll("svg")).toHaveLength(1);
  });

  it("shows a throwable's icon with have / carry limit, from the real inventory", () => {
    utilities.select("GRENADE");
    hud.update();
    expect(root().dataset.type).toBe("GRENADE");
    expect(root().querySelector(".equipped__count")!.textContent).toBe("1 / 2");

    utilities.add("GRENADE", 1);
    hud.update();
    expect(root().querySelector(".equipped__count")!.textContent).toBe("2 / 2");

    utilities.remove("GRENADE", 2);
    hud.update();
    expect(root().querySelector(".equipped__count")!.textContent).toBe("0 / 2");
    expect(root().classList.contains("is-spent")).toBe(true);

    utilities.select("MOLOTOV");
    hud.update();
    expect(root().querySelector(".equipped__count")!.textContent).toBe("1 / 1");
  });

  it("shows nothing for the reserved empty slot, and never lists the others", () => {
    utilities.select("EMPTY");
    hud.update();
    expect(root().classList.contains("is-empty")).toBe(true);
    expect(root().querySelectorAll("svg")).toHaveLength(0);
  });

  it("describeEquipped reads the inventory (never its own copy)", () => {
    utilities.select("SMOKE");
    expect(describeEquipped(utilities, carry)).toMatchObject({
      type: "SMOKE",
      primary: 1,
      secondary: 2,
    });
  });
});
