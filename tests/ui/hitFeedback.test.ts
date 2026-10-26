import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";

import { ATTACKS } from "../../src/combat/AttackDefinitions";
import { HitFeedback, MAX_DISTANCE, headTopOf } from "../../src/ui/HitFeedback";
import {
  TestFighter,
  makeScene,
  runAttack,
  type Scene,
} from "../combat/helpers";

describe("HitFeedback: damage numbers and the block tag, never a health bar", () => {
  let scene: Scene;
  let bars: HitFeedback;
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

  const numbers = (): HTMLElement[] =>
    Array.from(document.querySelectorAll(".hit-number"));

  /** Shows the BLOCKED tag by blocking one punch. */
  const blockOne = (): HTMLElement => {
    bars.update(0, camera);
    scene.defender.blocking = true;
    runAttack(scene, "light-punch");
    bars.update(0, camera);

    return bars.tagElement("defender")!;
  };

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

    bars = new HitFeedback(
      document.body,
      scene.system.events,
      () => combatants,
      "attacker",
      () => rolls[n++ % rolls.length],
    );
  });

  it("puts nothing over anyone's head that shows health: no bar, no fill, no hp", () => {
    bars.update(0, camera);
    scene.defender.health.damage(37);
    runAttack(scene, "light-punch");
    bars.update(0, camera);

    expect(
      document.querySelectorAll(".enemy-hp, .enemy-hp__fill"),
    ).toHaveLength(0);
    expect(document.querySelector("[data-hp]")).toBeNull();
    // The only things in the layer are damage numbers and the (empty) tag.
    const text = document.querySelector(".hit-feedback-layer")!.textContent;

    expect(text).not.toMatch(/\d+ ?\/ ?\d+/);
    expect(bars.tagElement("attacker")).toBeUndefined();
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

  it("a damage number pops in beside the enemy, rises toward the head while drifting, then fades and is removed", () => {
    bars.update(0, camera);
    runAttack(scene, "light-punch");
    bars.update(0, camera);

    const number = numbers()[0];
    const start = at(number);
    const headScreen = screenOf(head());
    const headTop = screenOf(head());

    // Beside the enemy: clearly off to one side of the head, below its top.
    expect(Math.abs(start.x - headScreen.x)).toBeGreaterThan(25);
    expect(start.y).toBeGreaterThan(headTop.y);
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

    // Near the end: fading and a little smaller, up by the head.
    bars.update(0.4, camera);
    expect(Number(number.style.opacity)).toBeLessThan(0.6);
    expect(scaleOf(number)).toBeLessThan(1);
    expect(at(number).y).toBeLessThan(headTop.y + 40);

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

  it("a blocked attack shows no number, takes no health, and tags the enemy BLOCKED", () => {
    const tag = blockOne();

    expect(scene.defender.health.current).toBe(100);
    expect(numbers()).toHaveLength(0);
    expect(tag.textContent).toBe("BLOCKED");
    expect(tag.style.visibility).toBe("visible");

    // The tag goes again on its own.
    bars.update(1, camera);
    expect(tag.style.visibility).toBe("hidden");
  });

  it("the tag hides behind cover and beyond the set distance", () => {
    const tag = blockOne();

    bars.lineOfSight = () => false;
    bars.update(0, camera);
    expect(tag.style.visibility).toBe("hidden");

    bars.lineOfSight = () => true;
    bars.update(0, camera);
    expect(tag.style.visibility).toBe("visible");

    aimCamera(0, 1.7, -(MAX_DISTANCE + 2));
    bars.update(0, camera);
    expect(tag.style.visibility).toBe("hidden");
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

  it("a killing blow shows a KO number, and nothing is left over the dead", () => {
    bars.update(0, camera);
    scene.defender.health.damage(95);
    runAttack(scene, "heavy-run-punch");
    bars.update(0, camera);

    expect(scene.defender.health.current).toBe(0);
    expect(numbers()[0].dataset.kind).toBe("ko");
    expect(bars.tagElement("defender")!.style.visibility).toBe("hidden");
  });

  it("an enemy that is removed takes its tag and numbers with it", () => {
    bars.update(0, camera);
    runAttack(scene, "light-punch");
    bars.update(0, camera);
    expect(numbers()).toHaveLength(1);

    combatants = [scene.attacker];
    bars.update(0, camera);

    expect(bars.tagElement("defender")).toBeUndefined();
    expect(bars.floatingCount).toBe(0);
  });

  it("reads health from the combatant and never changes it", () => {
    bars.update(0, camera);
    scene.defender.health.damage(37);
    bars.update(0, camera);

    expect(scene.defender.health.current).toBe(63);
  });

  it("dispose removes everything and stops listening", () => {
    bars.update(0, camera);
    bars.dispose();
    expect(document.querySelectorAll(".hit-feedback-layer")).toHaveLength(0);

    runAttack(scene, "light-punch");
    expect(document.querySelectorAll(".hit-number")).toHaveLength(0);
  });
});
