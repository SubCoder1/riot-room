import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";

import { ATTACKS } from "../../src/combat/AttackDefinitions";
import {
  BAR_WIDTH,
  MAX_DISTANCE,
  WorldHealthBars,
  headTopOf,
} from "../../src/ui/WorldHealthBars";
import {
  TestFighter,
  makeScene,
  runAttack,
  type Scene,
} from "../combat/helpers";

describe("WorldHealthBars: a plain bar above the enemy's head", () => {
  let scene: Scene;
  let bars: WorldHealthBars;
  let camera: THREE.PerspectiveCamera;
  let combatants: TestFighter[];
  let rolls: number[];

  const W = window.innerWidth;
  const H = window.innerHeight;

  const aimCamera = (x: number, y: number, z: number): void => {
    camera.position.set(x, y, z);
    camera.lookAt(0, 1.3, 0);
    camera.updateMatrixWorld(true);
  };

  /** Where a world point lands on screen, in pixels. */
  const screenOf = (point: THREE.Vector3): { x: number; y: number } => {
    const p = point.clone().project(camera);

    return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H };
  };

  const at = (element: HTMLElement): { x: number; y: number } => {
    const m = /translate\((-?\d+)px, (-?\d+)px\)/.exec(
      element.style.transform,
    )!;

    return { x: Number(m[1]), y: Number(m[2]) };
  };

  const barEl = (): HTMLElement => bars.barElement("defender")!;

  const numbers = (): HTMLElement[] =>
    Array.from(document.querySelectorAll(".enemy-hp__number"));

  /** Width of the red fill in pixels (full health = BAR_WIDTH). */
  const fillPx = (): number =>
    Number(
      /([\d.]+)px/.exec(
        (barEl().querySelector(".enemy-hp__fill") as HTMLElement).style.width,
      )![1],
    );

  const head = (): THREE.Vector3 => {
    const out = new THREE.Vector3();

    headTopOf(scene.defender, out);

    return out;
  };

  const scaleOf = (el: HTMLElement): number =>
    Number(/scale\(([\d.]+)\)/.exec(el.style.transform)![1]);

  beforeEach(() => {
    document.body.innerHTML = "";
    scene = makeScene();
    combatants = [scene.attacker, scene.defender];
    camera = new THREE.PerspectiveCamera(65, W / H, 0.01, 150);
    aimCamera(0, 1.7, -6);

    // A repeatable stream for the side and spread choices.
    rolls = [0.2, 0.5, 0.9, 0.1, 0.7, 0.3];

    let n = 0;

    bars = new WorldHealthBars(
      document.body,
      scene.system.events,
      () => combatants,
      "attacker",
      () => rolls[n++ % rolls.length],
    );
  });

  it("has a bar for the enemy and none for the player", () => {
    expect(bars.barElement("attacker")).toBeUndefined();
    bars.update(0, camera);
    expect(bars.barElement("attacker")).toBeUndefined();
    expect(barEl()).toBeDefined();
    expect(barEl().style.visibility).toBe("visible");
  });

  it("sits above the head, centred on it, and follows when the enemy moves", () => {
    bars.update(0, camera);

    const headScreen = screenOf(head());
    const first = at(barEl());

    expect(first.y).toBeLessThan(headScreen.y - 5);
    expect(Math.abs(first.x - headScreen.x)).toBeLessThanOrEqual(1);

    scene.defender.position.x += 1.5;
    bars.update(0, camera);

    const moved = at(barEl());
    const movedHead = screenOf(head());

    expect(Math.abs(moved.x - first.x)).toBeGreaterThan(20);
    expect(Math.abs(moved.x - movedHead.x)).toBeLessThanOrEqual(1);
    expect(moved.y).toBeLessThan(movedHead.y - 5);
  });

  it("is one size on screen at every distance: a position only, no scaling or fading", () => {
    for (const z of [-3, -8, -14]) {
      aimCamera(0, 1.7, z);
      bars.update(0, camera);

      expect(barEl().style.visibility).toBe("visible");
      expect(barEl().style.transform).toMatch(
        /^translate\(-?\d+px, -?\d+px\) translate\(-50%, -100%\)$/,
      );
      expect(barEl().style.transform).not.toMatch(/rotate|scale|matrix/);
      expect(barEl().style.opacity).toBe("");
      expect(fillPx()).toBe(BAR_WIDTH);
    }
  });

  it("is only shown within a set distance", () => {
    aimCamera(0, 1.7, -(MAX_DISTANCE - 2));
    bars.update(0, camera);
    expect(barEl().style.visibility).toBe("visible");

    aimCamera(0, 1.7, -(MAX_DISTANCE + 2));
    bars.update(0, camera);
    expect(barEl().style.visibility).toBe("hidden");

    aimCamera(0, 1.7, -6);
    bars.update(0, camera);
    expect(barEl().style.visibility).toBe("visible");
  });

  it("is hidden behind the camera and behind cover", () => {
    bars.update(0, camera);
    expect(barEl().style.visibility).toBe("visible");

    // Behind the camera.
    camera.position.set(0, 1.7, -6);
    camera.lookAt(0, 1.7, -20);
    camera.updateMatrixWorld(true);
    bars.update(0, camera);
    expect(barEl().style.visibility).toBe("hidden");

    // Behind cover.
    aimCamera(0, 1.7, -6);
    bars.lineOfSight = () => false;
    bars.update(0, camera);
    expect(barEl().style.visibility).toBe("hidden");

    // Visible again once the way is clear.
    bars.lineOfSight = () => true;
    bars.update(0, camera);
    expect(barEl().style.visibility).toBe("visible");
  });

  it("is a solid left-aligned bar that shortens from the right as health drops", () => {
    bars.update(0, camera);
    expect(fillPx()).toBe(BAR_WIDTH);

    const before = at(barEl());

    runAttack(scene, "light-punch");
    bars.update(0, camera);

    const damage = ATTACKS["light-punch"].damage;

    expect(fillPx()).toBe(Math.round(((100 - damage) / 100) * BAR_WIDTH));
    expect(barEl().dataset.hp).toBe(String(100 - damage));

    // The bar itself stays where it was: nothing slides or re-centres.
    expect(at(barEl())).toEqual(before);

    // The fill is the only thing drawn: no trail, gloss, flash or frame.
    expect(barEl().querySelectorAll(".enemy-hp__fill")).toHaveLength(1);
    expect(
      barEl().querySelectorAll(
        ".enemy-hp__trail, .enemy-hp__gloss, .enemy-hp__flash, .enemy-hp__frame",
      ),
    ).toHaveLength(0);
  });

  it("shows the real damage as -N for light, heavy and flying hits", () => {
    bars.update(0, camera);

    for (const attack of [
      "light-punch",
      "heavy-run-punch",
      "flying-light-punch",
      "flying-heavy-punch",
    ] as const) {
      scene.defender.health.reset();
      runAttack(scene, attack);
      bars.update(0, camera);

      const last = numbers()[numbers().length - 1];

      expect(last.textContent).toBe(`-${ATTACKS[attack].damage}`);
      expect(last.dataset.kind).toBe(
        attack === "light-punch"
          ? "light"
          : attack === "heavy-run-punch"
            ? "heavy"
            : "flying",
      );
      // Light attacks are drawn yellow, heavy ones red.
      expect(last.dataset.weight).toBe(
        attack.includes("heavy") ? "heavy" : "light",
      );
    }
  });

  it("a damage number pops in beside the enemy, rises toward the bar while drifting, then fades and is removed", () => {
    bars.update(0, camera);
    runAttack(scene, "light-punch");
    bars.update(0, camera);

    const number = numbers()[0];
    const start = at(number);
    const headScreen = screenOf(head());
    const barScreen = at(barEl());

    // Beside the enemy: clearly off to one side of the head, below the bar.
    expect(Math.abs(start.x - headScreen.x)).toBeGreaterThan(25);
    expect(start.y).toBeGreaterThan(barScreen.y);
    // Pop-in: starts small and fully visible.
    expect(scaleOf(number)).toBeCloseTo(0.7, 1);
    expect(Number(number.style.opacity)).toBe(1);

    bars.update(0.12, camera);
    expect(scaleOf(number)).toBeCloseTo(1, 1);

    // Mid-flight: higher on screen and closer to the head's column.
    bars.update(0.3, camera);

    const mid = at(number);

    expect(mid.y).toBeLessThan(start.y - 20);
    expect(Math.abs(mid.x - headScreen.x)).toBeLessThan(
      Math.abs(start.x - headScreen.x),
    );

    // Near the end: fading and a little smaller, up by the bar.
    bars.update(0.4, camera);
    expect(Number(number.style.opacity)).toBeLessThan(0.6);
    expect(scaleOf(number)).toBeLessThan(1);
    expect(at(number).y).toBeLessThan(barScreen.y + 40);

    // Gone after the animation, and not left in the page.
    bars.update(0.2, camera);
    expect(bars.floatingCount).toBe(0);
    expect(numbers()).toHaveLength(0);
  });

  it("rapid hits each get their own number, in different places", () => {
    bars.update(0, camera);

    for (let k = 0; k < 3; k++) {
      runAttack(scene, "light-punch");
      bars.update(1 / 60, camera);
    }

    expect(bars.floatingCount).toBe(3);
    expect(new Set(numbers().map((n) => n.style.transform)).size).toBe(3);

    // They finish independently and clean themselves up.
    for (let k = 0; k < 90; k++) bars.update(1 / 60, camera);

    expect(bars.floatingCount).toBe(0);
  });

  it("never lets numbers pile up without limit", () => {
    bars.update(0, camera);

    for (let k = 0; k < 80; k++) {
      scene.defender.health.reset();
      runAttack(scene, "light-punch");
      bars.update(0.005, camera);
    }

    expect(bars.floatingCount).toBeLessThanOrEqual(24);
    expect(numbers().length).toBeLessThanOrEqual(24);
  });

  it("a blocked attack shows no number and does not touch the bar", () => {
    bars.update(0, camera);
    scene.defender.blocking = true;
    runAttack(scene, "light-punch");
    bars.update(0, camera);

    expect(scene.defender.health.current).toBe(100);
    expect(numbers()).toHaveLength(0);
    expect(fillPx()).toBe(BAR_WIDTH);
    expect(
      (barEl().querySelector(".enemy-hp__tag") as HTMLElement).textContent,
    ).toBe("BLOCKED");
  });

  it("a hit of zero damage shows no number", () => {
    bars.update(0, camera);
    scene.system.events.emit({
      type: "hit",
      attackerId: "attacker",
      attackId: "light-punch",
      targetId: "defender",
      targetName: "defender",
      hurtbox: "torso",
      damage: 0,
      knockback: 0,
      healthLeft: 100,
    });
    bars.update(0, camera);

    expect(numbers()).toHaveLength(0);
  });

  it("a dead enemy has no bar; a respawn brings it back full", () => {
    bars.update(0, camera);
    scene.defender.health.damage(95);
    runAttack(scene, "heavy-run-punch");
    bars.update(0, camera);

    expect(scene.defender.health.current).toBe(0);
    expect(barEl().style.visibility).toBe("hidden");
    expect(numbers()[0].dataset.kind).toBe("ko");

    scene.defender.health.reset();
    bars.update(0, camera);
    expect(barEl().style.visibility).toBe("visible");
    expect(fillPx()).toBe(BAR_WIDTH);
  });

  it("an enemy that is removed takes its bar and numbers with it", () => {
    bars.update(0, camera);
    runAttack(scene, "light-punch");
    bars.update(0, camera);
    expect(numbers()).toHaveLength(1);

    combatants = [scene.attacker];
    bars.update(0, camera);

    expect(bars.barElement("defender")).toBeUndefined();
    expect(document.querySelectorAll(".enemy-hp")).toHaveLength(0);
    expect(bars.floatingCount).toBe(0);
  });

  it("reads health from the combatant: the UI never invents or changes it", () => {
    bars.update(0, camera);
    scene.defender.health.damage(37);
    bars.update(0, camera);

    expect(fillPx()).toBe(Math.round(0.63 * BAR_WIDTH));
    expect(scene.defender.health.current).toBe(63);
  });

  it("each enemy shows its own health", () => {
    const other = new TestFighter("other");

    other.position.set(3, 0, 3);
    combatants.push(other);
    other.health.damage(60);
    bars.update(0, camera);

    expect(bars.barElement("defender")!.dataset.hp).toBe("100");
    expect(bars.barElement("other")!.dataset.hp).toBe("40");
  });

  it("dispose removes everything and stops listening", () => {
    bars.update(0, camera);
    bars.dispose();
    expect(document.querySelectorAll(".enemy-hp-layer")).toHaveLength(0);

    runAttack(scene, "light-punch");
    expect(document.querySelectorAll(".enemy-hp__number")).toHaveLength(0);
  });
});
