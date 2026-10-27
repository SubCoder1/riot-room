import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { CombatEvent } from "../../src/combat/CombatEvents";
import { CombatSystem } from "../../src/combat/CombatSystem";
import { ShutterCrush } from "../../src/combat/ShutterCrush";
import { ArmoryMechanismView } from "../../src/world/ArmoryMechanismView";
import type { BoxSolid } from "../../src/world/ArenaLayout";
import { ArenaCollision } from "../../src/world/ArenaCollision";
import {
  ARMORY,
  ChainShutter,
  LEVER,
  OneWayHatch,
  caughtUnderShutter,
  chainInReach,
  doorAim,
  doorSweepBlocked,
} from "../../src/world/ArmoryMechanisms";
import {
  GRIP_HIGH,
  GRIP_LOW,
  handOnChain,
} from "../../src/character/ChainPullPose";
import { TestFighter } from "../combat/helpers";

const DT = 1 / 60;

/** Runs the shutter for `seconds`, hauling or not. */
function run(shutter: ChainShutter, seconds: number, hauling: boolean): void {
  for (let t = 0; t < seconds; t += DT) {
    shutter.update(DT, hauling);
  }
}

/** How long a fall from the top takes. */
function fallTime(): number {
  const shutter = new ChainShutter();

  run(shutter, 12, true);
  expect(shutter.state).toBe("held");

  let t = 0;

  while (shutter.state !== "closed" && t < 20) {
    shutter.update(DT, false);
    t += DT;
  }

  // Less the pause before it starts to fall.
  return t - ARMORY.RELEASE_DELAY;
}

describe("The chain shutter", () => {
  it("starts shut and does nothing without the chain", () => {
    const shutter = new ChainShutter();

    run(shutter, 5, false);

    expect(shutter.state).toBe("closed");
    expect(shutter.lift).toBe(0);
  });

  it("rises slowly while the chain is hauled, and stays up only while it is held", () => {
    const shutter = new ChainShutter();

    run(shutter, 2, true);

    expect(shutter.state).toBe("opening");
    expect(shutter.lift).toBeGreaterThan(0.2);
    expect(shutter.lift).toBeLessThan(ChainShutter.MAX_LIFT * 0.6);

    run(shutter, 12, true);

    expect(shutter.state).toBe("held");
    expect(shutter.lift).toBe(ChainShutter.MAX_LIFT);
  });

  it("takes about the configured time to raise fully", () => {
    const shutter = new ChainShutter();
    let t = 0;

    while (shutter.state !== "held" && t < 30) {
      shutter.update(DT, true);
      t += DT;
    }

    expect(t).toBeGreaterThan(ARMORY.OPEN_SECONDS * 0.8);
    expect(t).toBeLessThan(ARMORY.OPEN_SECONDS * 1.3);
  });

  it("rises continuously: it never stalls once it is moving, and never jumps", () => {
    const shutter = new ChainShutter();
    let stalled = 0;
    let biggest = 0;

    // Past the slack, then watch the whole climb.
    run(shutter, 0.3, true);

    while (shutter.state !== "held") {
      const before = shutter.lift;

      shutter.update(DT, true);

      if (shutter.lift === before && shutter.state !== "held") {
        stalled++;
      }

      biggest = Math.max(biggest, shutter.lift - before);
    }

    expect(stalled).toBe(0);
    // At most about 1.6 x the average speed (smoothstep peaks at 1.5 x).
    const average = ChainShutter.MAX_LIFT / ARMORY.OPEN_SECONDS;

    expect(biggest).toBeLessThan(average * 1.7 * DT);
  });

  it("eases in and out: slowest at the start and the top, quickest in the middle", () => {
    const shutter = new ChainShutter();
    const speeds: number[] = [];

    for (
      let t = 0;
      t < ARMORY.OPEN_SECONDS + 1 && shutter.state !== "held";
      t += DT
    ) {
      const before = shutter.lift;

      shutter.update(DT, true);
      speeds.push((shutter.lift - before) / DT);
    }

    const third = Math.floor(speeds.length / 3);
    const mean = (a: number[]): number =>
      a.reduce((x, y) => x + y, 0) / a.length;

    expect(mean(speeds.slice(third, 2 * third))).toBeGreaterThan(
      mean(speeds.slice(0, third)) * 1.5,
    );
    expect(mean(speeds.slice(third, 2 * third))).toBeGreaterThan(
      mean(speeds.slice(2 * third)) * 1.5,
    );
    // It arrives at the top slowly, never at a run.
    expect(speeds[speeds.length - 2]).toBeLessThan(0.1);
  });

  it("rises the same at any frame rate", () => {
    const at = (fps: number): number => {
      const shutter = new ChainShutter();

      for (let t = 0; t < 3; t += 1 / fps) {
        shutter.update(1 / fps, true);
      }

      return shutter.lift;
    };

    const reference = at(240);

    for (const fps of [30, 60, 144]) {
      expect(Math.abs(at(fps) - reference)).toBeLessThan(0.03);
    }
  });

  it("picks up smoothly from part-way after being let go: no jump in height or speed", () => {
    const shutter = new ChainShutter();

    run(shutter, 3, true);
    run(shutter, 0.2, false);
    // (Held again before it has started to fall.)
    const at = shutter.lift;
    let last = at;
    let jump = 0;

    for (let t = 0; t < 1; t += DT) {
      shutter.update(DT, true);
      jump = Math.max(jump, Math.abs(shutter.lift - last));
      last = shutter.lift;
    }

    expect(last).toBeGreaterThanOrEqual(at);
    expect(jump).toBeLessThan(
      (ChainShutter.MAX_LIFT / ARMORY.OPEN_SECONDS) * 2 * DT,
    );
  });

  it("stops the moment the chain is let go, hangs a beat, then falls", () => {
    const shutter = new ChainShutter();

    run(shutter, 3, true);

    const at = shutter.lift;

    shutter.update(DT, false);
    expect(shutter.velocity).toBe(0);
    expect(shutter.state).toBe("released");

    run(shutter, ARMORY.RELEASE_DELAY * 0.8, false);
    // Still hanging in the delay, not yet falling.
    expect(shutter.lift).toBeCloseTo(at, 5);

    run(shutter, 0.4, false);
    expect(shutter.state).toBe("falling");
    expect(shutter.lift).toBeLessThan(at);
  });

  it("falls much faster than it rises, but not at once", () => {
    const fall = fallTime();

    expect(fall).toBeGreaterThan(1.0);
    expect(fall).toBeLessThan(ARMORY.OPEN_SECONDS / 2);
  });

  it("never stays hanging part-way: let go anywhere and it ends shut", () => {
    for (const haul of [0.6, 1.5, 2.7, 4.1, 9]) {
      const shutter = new ChainShutter();

      run(shutter, haul, true);
      run(shutter, 10, false);

      expect(shutter.state).toBe("closed");
      expect(shutter.lift).toBe(0);
    }
  });

  it("takes the chain again mid-fall and rises predictably", () => {
    const shutter = new ChainShutter();

    run(shutter, 12, true);
    run(shutter, ARMORY.RELEASE_DELAY + 0.5, false);

    expect(shutter.state).toBe("falling");

    const low = shutter.lift;

    run(shutter, 0.05, true);
    // The slack first: it is stopped, not yet lifting.
    expect(shutter.state).toBe("opening");
    expect(shutter.velocity).toBeLessThanOrEqual(0.001);

    run(shutter, 2, true);

    expect(shutter.lift).toBeGreaterThan(low);
  });

  it("is not thrown into a glitch by rapid toggling, and gains almost nothing from it", () => {
    const shutter = new ChainShutter();
    let hauling = false;

    for (let t = 0; t < 6; t += DT) {
      if ((Math.floor(t / 0.06) % 2 === 0) !== hauling) {
        hauling = !hauling;
      }

      shutter.update(DT, hauling);

      expect(Number.isFinite(shutter.lift)).toBe(true);
      expect(shutter.lift).toBeGreaterThanOrEqual(0);
      expect(shutter.lift).toBeLessThanOrEqual(ChainShutter.MAX_LIFT);
    }

    // Tapping is nothing like hauling: it never got near the top.
    expect(shutter.lift).toBeLessThan(ChainShutter.MAX_LIFT * 0.5);
  });

  it("moves the same however the frames are cut", () => {
    const a = new ChainShutter();
    const b = new ChainShutter();

    for (let t = 0; t < 4; t += 1 / 60) {
      a.update(1 / 60, true);
    }

    for (let t = 0; t < 4; t += 1 / 30) {
      b.update(1 / 30, true);
    }

    expect(b.lift).toBeCloseTo(a.lift, 1);
  });

  it("draws the chain by exactly what the shutter has moved", () => {
    const shutter = new ChainShutter();

    for (let i = 0; i < 6; i++) {
      run(shutter, 0.7, true);
      expect(shutter.chainTravel).toBeCloseTo(
        shutter.lift * ARMORY.CHAIN_METRES_PER_LIFT,
        9,
      );
    }

    // And back as it falls.
    const before = shutter.chainTravel;

    run(shutter, 3, false);
    expect(shutter.chainTravel).toBeLessThan(before);
    expect(shutter.chainTravel).toBe(0);
  });

  it("reports its strain, its fall, its catches and its landing", () => {
    const shutter = new ChainShutter();
    const log: string[] = [];

    shutter.events = {
      onStrain: () => log.push("strain"),
      onFallStart: () => log.push("fall"),
      onCatch: () => log.push("catch"),
      onClosed: (speed) => log.push(`closed ${speed > 0 ? "hard" : "soft"}`),
    };

    run(shutter, 12, true);
    run(shutter, 8, false);

    expect(log[0]).toBe("strain");
    expect(log).toContain("fall");
    expect(log.filter((e) => e === "catch")).toHaveLength(2);
    expect(log[log.length - 1]).toBe("closed hard");
  });
});

describe("The shutter's collision", () => {
  const solid: BoxSolid = {
    kind: "box",
    id: "armory-shutter",
    role: "wall",
    minX: ARMORY.SHUTTER_X - ARMORY.SHUTTER_THICKNESS / 2,
    maxX: ARMORY.SHUTTER_X + ARMORY.SHUTTER_THICKNESS / 2,
    minZ: ARMORY.SHUTTER_Z0,
    maxZ: ARMORY.SHUTTER_Z1,
    bottom: ARMORY.FLOOR,
    height: ARMORY.FLOOR + ARMORY.SHUTTER_HEIGHT,
  };
  const world = new ArenaCollision();

  world.addMovable(solid);

  const blockedAt = (): boolean =>
    world.isBlocked(ARMORY.SHUTTER_X, 8, ARMORY.FLOOR, 0.3);

  /** What the game does each frame: the solid follows the lift. */
  function sync(shutter: ChainShutter): void {
    solid.bottom = ARMORY.FLOOR + shutter.lift;
    world.setSolidActive(solid, shutter.lift < ChainShutter.MAX_LIFT - 0.02);
  }

  it("blocks the doorway when down, and is gone when it is fully up", () => {
    const shutter = new ChainShutter();

    sync(shutter);
    expect(blockedAt()).toBe(true);

    run(shutter, 12, true);
    sync(shutter);
    expect(blockedAt()).toBe(false);
  });

  it("follows the edge: a head's height clear only once it is above the head", () => {
    const shutter = new ChainShutter();
    const cleared: number[] = [];

    run(shutter, 0.5, true);

    for (let i = 0; i < 400; i++) {
      shutter.update(DT, true);
      sync(shutter);

      // A standing body (1.8 m) can pass once the edge is above its head.
      if (!blockedAt() || solid.bottom - ARMORY.FLOOR >= 1.85) {
        cleared.push(shutter.lift);

        break;
      }
    }

    expect(cleared[0]).toBeGreaterThan(1.0);
    // The solid's underside is the drawn edge.
    expect(solid.bottom).toBeCloseTo(ARMORY.FLOOR + shutter.lift, 9);
  });

  it("shuts again as it falls, so nobody slips through behind it", () => {
    const shutter = new ChainShutter();

    run(shutter, 12, true);
    sync(shutter);
    run(shutter, 8, false);
    sync(shutter);

    expect(shutter.state).toBe("closed");
    expect(blockedAt()).toBe(true);
  });
});

describe("The crushing hazard", () => {
  function scene() {
    const combat = new CombatSystem();
    const operator = new TestFighter("operator");
    const thug = new TestFighter("thug");
    const events: CombatEvent[] = [];
    const shutter = new ChainShutter();
    const crush = new ShutterCrush(combat, shutter, () => operator.id);

    operator.position.set(-23, ARMORY.FLOOR, 8);
    combat.register(operator);
    combat.register(thug);
    combat.events.subscribe((e) => events.push(e));

    return { combat, operator, thug, events, shutter, crush };
  }

  /** Raise it fully, let go, and run the fall, checking the crush every step. */
  function dropOn(s: ReturnType<typeof scene>): void {
    run(s.shutter, 12, true);
    s.crush.update();

    for (let t = 0; t < 8; t += DT) {
      s.shutter.update(DT, false);
      s.crush.update();
    }
  }

  const deaths = (events: CombatEvent[], id: string): number =>
    events.filter((e) => e.type === "died" && e.targetId === id).length;

  it("kills a thug caught in the doorway exactly once", () => {
    const s = scene();

    s.thug.position.set(ARMORY.SHUTTER_X, ARMORY.FLOOR, 8);
    dropOn(s);

    expect(s.thug.isDead()).toBe(true);
    expect(deaths(s.events, "thug")).toBe(1);
    expect(
      s.events.filter(
        (e) => e.type === "hit" && e.attackId === "shutter-crush",
      ),
    ).toHaveLength(1);
  });

  it("kills only when the edge has reached the head: not while it is far above", () => {
    const s = scene();

    s.thug.position.set(ARMORY.SHUTTER_X, ARMORY.FLOOR, 8);
    run(s.shutter, 12, true);
    run(s.shutter, ARMORY.RELEASE_DELAY + 0.1, false);

    // Falling, but still well over a standing head.
    expect(s.shutter.isFalling).toBe(true);
    expect(s.shutter.edgeY).toBeGreaterThan(ARMORY.FLOOR + 2.2);
    s.crush.update();
    expect(s.thug.isDead()).toBe(false);

    // And never while it is up or held.
    const up = scene();

    up.thug.position.set(ARMORY.SHUTTER_X, ARMORY.FLOOR, 8);
    run(up.shutter, 12, true);
    up.crush.update();
    expect(up.thug.isDead()).toBe(false);
  });

  it("does not touch anyone clear of the doorway", () => {
    const s = scene();

    // Beside the curtain in the room, outside in the walkway, and past the jamb.
    s.thug.position.set(-22.5, ARMORY.FLOOR, 8);
    s.operator.position.set(ARMORY.SHUTTER_X, ARMORY.FLOOR, 6.4);
    dropOn(s);

    expect(s.thug.isDead()).toBe(false);
    expect(s.operator.isDead()).toBe(false);

    const other = scene();

    other.thug.position.set(-19.0, ARMORY.FLOOR, 8);
    dropOn(other);
    expect(other.thug.isDead()).toBe(false);
  });

  it("does not reach another floor", () => {
    const s = scene();

    s.thug.position.set(ARMORY.SHUTTER_X, 0, 8);
    dropOn(s);

    expect(s.thug.isDead()).toBe(false);
  });

  it("crushes once per body in a fall, and again in the next fall only if it is alive and there", () => {
    const s = scene();

    s.thug.position.set(ARMORY.SHUTTER_X, ARMORY.FLOOR, 8);
    s.operator.position.set(ARMORY.SHUTTER_X + 0.1, ARMORY.FLOOR, 7.6);
    dropOn(s);

    expect(deaths(s.events, "thug")).toBe(1);
    expect(deaths(s.events, "operator")).toBe(1);

    // Another fall changes nothing: the dead are not killed again.
    dropOn(s);
    expect(deaths(s.events, "thug")).toBe(1);
    expect(deaths(s.events, "operator")).toBe(1);
  });

  it("the footprint check agrees", () => {
    const feet = { x: ARMORY.SHUTTER_X, y: ARMORY.FLOOR, z: 8 };

    expect(
      caughtUnderShutter(feet, 1.8 + ARMORY.FLOOR, ARMORY.FLOOR + 1.7),
    ).toBe(true);
    expect(
      caughtUnderShutter(feet, 1.8 + ARMORY.FLOOR, ARMORY.FLOOR + 2.4),
    ).toBe(false);
    expect(
      caughtUnderShutter({ ...feet, z: 6.8 }, 1.8 + ARMORY.FLOOR, ARMORY.FLOOR),
    ).toBe(false);
  });
});

describe("The one-way hatch", () => {
  /** Runs the hatch for `seconds` of game time. */
  function runHatch(hatch: OneWayHatch, seconds: number, hold = false): void {
    for (let t = 0; t < seconds; t += DT) {
      hatch.update(DT, hold);
    }
  }

  const TOTAL =
    ARMORY.LATCH_SECONDS + ARMORY.LATCH_PAUSE + ARMORY.SWING_SECONDS;

  it("starts shut, latched and solid", () => {
    const hatch = new OneWayHatch();

    expect(hatch.phase).toBe("closed");
    expect(hatch.angle).toBe(0);
    expect(hatch.latch).toBe(0);
    expect(hatch.isSolid).toBe(true);
    expect(hatch.isOpen).toBe(false);
  });

  it("opens from inside: the latch draws, a heavy pause, then the swing", () => {
    const hatch = new OneWayHatch();

    expect(hatch.interact("inside", false)).toBe("opening");

    // The latch comes back first, and the leaf has not moved.
    runHatch(hatch, ARMORY.LATCH_SECONDS * 0.5);
    expect(hatch.latch).toBeGreaterThan(0.3);
    expect(hatch.latch).toBeLessThan(0.7);
    expect(hatch.angle).toBe(0);

    runHatch(hatch, ARMORY.LATCH_SECONDS * 0.5 + 0.02);
    expect(hatch.latch).toBe(1);
    // Then it hangs a moment before the heavy leaf starts to go.
    runHatch(hatch, ARMORY.LATCH_PAUSE * 0.5);
    expect(hatch.angle).toBe(0);

    runHatch(hatch, ARMORY.LATCH_PAUSE * 0.5 + 0.3);
    expect(hatch.phase).toBe("swinging");
    expect(hatch.angle).toBeGreaterThan(0);
    expect(hatch.angle).toBeLessThan(ARMORY.DOOR_OPEN_ANGLE * 0.2);

    runHatch(hatch, TOTAL);
    expect(hatch.phase).toBe("open");
    expect(hatch.angle).toBe(ARMORY.DOOR_OPEN_ANGLE);
  });

  it("swings out into the Hall, away from the one who opened it", () => {
    const hatch = new OneWayHatch();

    expect(hatch.dir).toBe(-1);
  });

  it("swings with weight: slow to start, quickest mid-way, slow to rest", () => {
    const hatch = new OneWayHatch();
    const angles: number[] = [];

    hatch.interact("inside", false);
    runHatch(hatch, ARMORY.LATCH_SECONDS + ARMORY.LATCH_PAUSE + 0.01);

    for (let t = 0; t < ARMORY.SWING_SECONDS; t += 0.1) {
      runHatch(hatch, 0.1);
      angles.push(hatch.angle);
    }

    const steps = angles.map((a, i) => a - (angles[i - 1] ?? 0));
    const fastest = Math.max(...steps);

    // Never goes backward, and the first and last steps are the slowest.
    expect(steps.every((d) => d >= 0)).toBe(true);
    expect(steps[0]).toBeLessThan(fastest * 0.3);
    expect(steps[steps.length - 1]).toBeLessThan(fastest * 0.3);
    // It takes a readable few seconds, not a snap.
    expect(ARMORY.SWING_SECONDS).toBeGreaterThan(1.5);
  });

  it("stays open for good: nothing shuts it, whatever happens after", () => {
    const hatch = new OneWayHatch();

    hatch.interact("inside", false);
    runHatch(hatch, TOTAL + 0.5);
    expect(hatch.isOpen).toBe(true);

    // Further presses, from either side, change nothing.
    expect(hatch.interact("inside", false)).toBe("refused-busy");
    expect(hatch.interact("outside", false)).toBe("refused-outside");
    expect(hatch.interact("inside", true)).toBe("refused-busy");
    runHatch(hatch, 600);

    expect(hatch.isOpen).toBe(true);
    expect(hatch.angle).toBe(ARMORY.DOOR_OPEN_ANGLE);
    expect(hatch.latch).toBe(1);
    expect(hatch.isSolid).toBe(false);
  });

  it("a repeated press does not restart the animation or snap it between states", () => {
    const hatch = new OneWayHatch();

    hatch.interact("inside", false);
    runHatch(hatch, 1.2);

    const before = { angle: hatch.angle, phase: hatch.phase };

    for (let i = 0; i < 20; i++) {
      expect(hatch.interact("inside", false)).toBe("refused-busy");
    }

    expect(hatch.phase).toBe(before.phase);
    expect(hatch.angle).toBe(before.angle);

    runHatch(hatch, 0.2);
    // Moving on from where it was, not back to the start.
    expect(hatch.angle).toBeGreaterThanOrEqual(before.angle);
  });

  it("cannot be opened from outside, however often it is tried", () => {
    const hatch = new OneWayHatch();

    for (let i = 0; i < 10; i++) {
      expect(hatch.interact("outside", false)).toBe("refused-outside");
    }

    expect(hatch.phase).toBe("closed");
    expect(hatch.started).toBe(false);
    expect(hatch.isSolid).toBe(true);
    // It rattles in its frame, so the try reads.
    expect(hatch.rattle).toBeGreaterThan(0);
    runHatch(hatch, 5);
    expect(hatch.angle).toBe(0);
    expect(hatch.rattle).toBe(0);

    // And inside still works afterwards.
    expect(hatch.interact("inside", false)).toBe("opening");
  });

  it("will not start with someone in the way, and does not swing through a body", () => {
    const hatch = new OneWayHatch();
    // Out in the Hall, where the leaf swings.
    const inTheWay = [{ x: -26, y: ARMORY.FLOOR, z: 13.2 }];

    expect(doorSweepBlocked(inTheWay, -1)).toBe(true);
    expect(doorSweepBlocked(inTheWay, 1)).toBe(false);
    expect(hatch.interact("inside", true)).toBe("refused-blocked");
    expect(hatch.started).toBe(false);

    // Someone far off, on another floor, or in the room behind the one pulling.
    expect(doorSweepBlocked([{ x: -22, y: ARMORY.FLOOR, z: 8 }], -1)).toBe(
      false,
    );
    expect(doorSweepBlocked([{ x: -26, y: 0, z: 13 }], -1)).toBe(false);
    expect(doorSweepBlocked([{ x: -26, y: ARMORY.FLOOR, z: 10.8 }], -1)).toBe(
      false,
    );

    // Someone steps into the path mid-swing: it stops short until they leave.
    hatch.interact("inside", false);
    runHatch(hatch, ARMORY.LATCH_SECONDS + ARMORY.LATCH_PAUSE + 0.8);

    const at = hatch.angle;

    expect(hatch.isMoving).toBe(true);
    runHatch(hatch, 1, true);
    expect(hatch.angle).toBe(at);
    runHatch(hatch, 0.3);
    expect(hatch.angle).toBeGreaterThan(at);
  });

  it("holds the doorway until it has swung clear, then lets people out while it still moves", () => {
    const hatch = new OneWayHatch();

    hatch.interact("inside", false);

    for (let t = 0; t < TOTAL + 0.2; t += DT) {
      hatch.update(DT);

      // Solid exactly while the leaf is still across the way.
      expect(hatch.isSolid).toBe(hatch.angle < ARMORY.DOOR_PASSABLE_ANGLE);
    }

    expect(hatch.isSolid).toBe(false);
    expect(hatch.leafStands).toBe(true);
    // Passable well before the end of the swing.
    expect(ARMORY.DOOR_PASSABLE_ANGLE).toBeLessThan(
      ARMORY.DOOR_OPEN_ANGLE * 0.7,
    );
  });

  it("reports the unlatch, the swing, the groans and the rest", () => {
    const hatch = new OneWayHatch();
    const log: string[] = [];

    hatch.events = {
      onUnlatch: () => log.push("unlatch"),
      onSwingStart: () => log.push("swing"),
      onCreak: () => log.push("creak"),
      onSettle: () => log.push("settle"),
    };
    hatch.interact("inside", false);
    runHatch(hatch, TOTAL + 0.5);

    expect(log).toEqual(["unlatch", "swing", "creak", "creak", "settle"]);
  });

  it("is a proportionate fit: the leaf is smaller than the lined opening, which is smaller than the wall's", () => {
    const lining = 0.07;
    const clearWidth =
      ARMORY.DOOR_OPENING_MAX_X - ARMORY.DOOR_OPENING_MIN_X - 2 * lining;
    const clearHeight = ARMORY.DOOR_OPENING_HEIGHT - lining;

    // Hinge on the west jamb's inner face; the leaf with a small clearance.
    expect(ARMORY.DOOR_HINGE_X).toBeCloseTo(
      ARMORY.DOOR_OPENING_MIN_X + lining,
      9,
    );
    expect(ARMORY.DOOR_WIDTH).toBeLessThan(clearWidth);
    expect(clearWidth - ARMORY.DOOR_WIDTH).toBeGreaterThan(0.01);
    expect(clearWidth - ARMORY.DOOR_WIDTH).toBeLessThan(0.06);
    expect(ARMORY.DOOR_HEIGHT).toBeLessThan(clearHeight);
    expect(clearHeight - ARMORY.DOOR_HEIGHT).toBeGreaterThan(0.01);
    // A body passes through the lined opening comfortably.
    expect(clearWidth).toBeGreaterThan(1.7);
    expect(clearHeight).toBeGreaterThan(2.3);
  });
});

describe("Reaching the mechanisms", () => {
  const look = (
    feet: { x: number; y: number; z: number },
    at: { x: number; y: number; z: number },
  ) => {
    const eye = { x: feet.x, y: feet.y + 1.65, z: feet.z };
    const d = Math.hypot(at.x - eye.x, at.y - eye.y, at.z - eye.z);

    return {
      feet,
      eye,
      dir: {
        x: (at.x - eye.x) / d,
        y: (at.y - eye.y) / d,
        z: (at.z - eye.z) / d,
      },
    };
  };

  it("the chain is reached from the walkway outside, looking at it", () => {
    const feet = { x: -19.4, y: ARMORY.FLOOR, z: 9.4 };

    expect(
      chainInReach(
        look(feet, {
          x: ARMORY.CHAIN_X,
          y: ARMORY.FLOOR + 2.2,
          z: ARMORY.CHAIN_Z,
        }),
      ),
    ).toBe(true);
    // Looking away, too far, on another floor, or inside the room: no.
    expect(chainInReach(look(feet, { x: -19.4, y: 5.6, z: 2 }))).toBe(false);
    expect(
      chainInReach(
        look(
          { x: -16.5, y: ARMORY.FLOOR, z: 9.4 },
          { x: ARMORY.CHAIN_X, y: ARMORY.FLOOR + 2.2, z: ARMORY.CHAIN_Z },
        ),
      ),
    ).toBe(false);
    expect(
      chainInReach(
        look(
          { x: -21.4, y: ARMORY.FLOOR, z: 9.4 },
          { x: ARMORY.CHAIN_X, y: ARMORY.FLOOR + 2.2, z: ARMORY.CHAIN_Z },
        ),
      ),
    ).toBe(false);
  });

  it("the release lever is aimed at from inside; from the Hall it is the plain steel", () => {
    const hatch = new OneWayHatch();
    const insideFeet = { x: -26.0, y: ARMORY.FLOOR, z: 11.1 };
    const outsideFeet = { x: -26.0, y: ARMORY.FLOOR, z: 13.3 };
    const lever = {
      x: ARMORY.DOOR_HINGE_X + LEVER.along,
      y: ARMORY.FLOOR + LEVER.height,
      z: 12.07,
    };

    expect(doorAim(look(insideFeet, lever), hatch)).toEqual({ side: "inside" });
    expect(doorAim(look(outsideFeet, { ...lever, z: 12.23 }), hatch)).toEqual({
      side: "outside",
    });
    // Too far, or looking elsewhere: nothing.
    expect(
      doorAim(look({ x: -26.0, y: ARMORY.FLOOR, z: 8.0 }, lever), hatch),
    ).toBe(null);
    expect(doorAim(look(insideFeet, { x: -23, y: 5.6, z: 9 }), hatch)).toBe(
      null,
    );
    // The lever sits at a believable hand height.
    expect(LEVER.height).toBeGreaterThan(0.6);
    expect(LEVER.height).toBeLessThan(1.3);
  });

  it("nothing is left to aim at once it has been opened", () => {
    const hatch = new OneWayHatch();
    const insideFeet = { x: -26.0, y: ARMORY.FLOOR, z: 11.1 };
    const lever = {
      x: ARMORY.DOOR_HINGE_X + LEVER.along,
      y: ARMORY.FLOOR + LEVER.height,
      z: 12.07,
    };

    hatch.interact("inside", false);
    expect(doorAim(look(insideFeet, lever), hatch)).toBe(null);
  });
});

describe("The Armory is still connected", () => {
  it("both doorways are open in the map itself, so the layout keeps its routes", () => {
    const world = new ArenaCollision();

    // East doorway (z 7 to 9) and south doorway (x -27 to -25), as built.
    expect(world.isBlocked(-20.35, 8, ARMORY.FLOOR, 0.3)).toBe(false);
    expect(world.isBlocked(-21.0, 8, ARMORY.FLOOR, 0.3)).toBe(false);
    expect(world.isBlocked(-26, 12.15, ARMORY.FLOOR, 0.3)).toBe(false);
    expect(world.isBlocked(-26, 11.0, ARMORY.FLOOR, 0.3)).toBe(false);
  });
});

describe("Hauling the chain, hand over hand", () => {
  const stroke = ChainShutter.STROKE;

  it("a stroke is about one pull of the chain, within the hands' reach", () => {
    expect(stroke).toBeGreaterThan(0.5);
    expect(stroke).toBeLessThan(0.9);
    expect(GRIP_HIGH - GRIP_LOW).toBeCloseTo(stroke, 9);
    // The hands stay between the wheel and the foot of the chain.
    expect(GRIP_HIGH).toBeLessThan(ARMORY.FLOOR + ARMORY.CHAIN_TOP_Y);
    expect(GRIP_LOW).toBeGreaterThan(ARMORY.FLOOR + ARMORY.CHAIN_BOTTOM_Y);
  });

  it("the gripping hand is carried down exactly as far as the chain runs", () => {
    for (const travel of [0.05, 0.2, 0.5]) {
      const a = handOnChain(0, 1);
      const b = handOnChain(travel, 1);

      expect(a.y - b.y).toBeCloseTo(travel, 9);
      expect(b.release).toBe(0);
    }
  });

  it("while one hand grips the other lets go and reaches back up", () => {
    const grip = handOnChain(stroke * 0.5, 1);
    const reach = handOnChain(stroke * 0.5, -1);
    const later = handOnChain(stroke * 0.75, -1);

    expect(grip.release).toBe(0);
    expect(reach.release).toBeGreaterThan(0.9);
    // The free hand is rising while the other falls.
    expect(later.y).toBeGreaterThan(reach.y);
  });

  it("the hands swap each stroke, and never jump", () => {
    let last = [handOnChain(0, 1).y, handOnChain(0, -1).y];

    for (let travel = 0.01; travel < stroke * 5; travel += 0.01) {
      const now = [handOnChain(travel, 1).y, handOnChain(travel, -1).y];

      expect(Math.abs(now[0] - last[0])).toBeLessThan(0.05);
      expect(Math.abs(now[1] - last[1])).toBeLessThan(0.05);
      expect(Math.min(...now)).toBeGreaterThanOrEqual(GRIP_LOW - 1e-9);
      expect(Math.max(...now)).toBeLessThanOrEqual(GRIP_HIGH + 1e-9);

      last = now;
    }

    // After a whole stroke each has taken the other's place.
    expect(handOnChain(stroke, 1).y).toBeCloseTo(handOnChain(0, -1).y, 9);
    expect(handOnChain(stroke, -1).y).toBeCloseTo(handOnChain(0, 1).y, 9);
  });

  it("is a function of the chain's travel alone: it moves with the chain and stops when the chain does", () => {
    const shutter = new ChainShutter();
    let paused = 0;
    let moved = 0;

    // Hauled for a second and a half (past the slack), then let go (it hangs
    // a beat before it falls).
    for (let i = 0; i < 120; i++) {
      const before = shutter.chainTravel;
      const yBefore = handOnChain(before, 1).y;

      shutter.update(DT, i < 90);

      const yAfter = handOnChain(shutter.chainTravel, 1).y;

      if (shutter.chainTravel === before) {
        // The chain did not move, so neither did the hand.
        expect(yAfter).toBe(yBefore);
        paused++;
      } else {
        moved++;
      }
    }

    expect(moved).toBeGreaterThan(60);
    expect(paused).toBeGreaterThan(10);
  });
});

describe("The roller drum and its two end wheels", () => {
  const rollerOf = (view: ArmoryMechanismView): THREE.Group =>
    (view as unknown as { roller: THREE.Group }).roller;
  const door = { angle: 0, dir: -1 as const, latch: 0, rattle: 0 };

  it("is a horizontal cylinder along the doorway with one wheel at each end", () => {
    const roller = rollerOf(new ArmoryMechanismView());
    const box = new THREE.Box3().setFromObject(roller);

    // It spans the doorway (z 7 to 9) and a little beyond, over the 2.6 m opening.
    expect(box.min.z).toBeLessThan(ARMORY.SHUTTER_Z0);
    expect(box.max.z).toBeGreaterThan(ARMORY.SHUTTER_Z1);
    expect(box.min.y).toBeGreaterThan(ARMORY.FLOOR + ARMORY.SHUTTER_HEIGHT);

    // Its wheels are the rims: one at each end, on the same axis (x, y).
    const rims = roller.children.filter(
      (child) =>
        child instanceof THREE.Mesh &&
        child.geometry instanceof THREE.TorusGeometry,
    );

    expect(rims).toHaveLength(2);
    expect(Math.min(...rims.map((r) => r.position.z))).toBeLessThan(
      ARMORY.SHUTTER_Z0,
    );
    expect(Math.max(...rims.map((r) => r.position.z))).toBeGreaterThan(
      ARMORY.SHUTTER_Z1,
    );
    expect(rims[0].position.x).toBe(rims[1].position.x);
    expect(rims[0].position.y).toBe(rims[1].position.y);
  });

  it("winds the curtain up when it opens, the other way when it falls, and the curtain's top meets the drum", () => {
    const view = new ArmoryMechanismView();
    const roller = rollerOf(view);
    const at = (lift: number): number => {
      view.update({ lift, chainTravel: 0 }, door, 0);

      return roller.rotation.z;
    };

    expect(at(0)).toBeCloseTo(0, 9);

    const up = at(1.0);
    const higher = at(2.0);

    // A turn for every circumference of curtain wound: the same sense, more of it.
    expect(up).toBeLessThan(0);
    expect(higher).toBeLessThan(up);
    expect(up).toBeCloseTo(-1.0 / 0.17, 6);
    // Falling turns it back.
    expect(at(1.0)).toBeCloseTo(up, 9);
    expect(at(0)).toBeCloseTo(0, 9);

    // The curtain leaves the drum on its room side: the drum's near tangent is
    // the curtain's plane.
    const box = new THREE.Box3().setFromObject(roller);

    expect(box.min.x).toBeLessThan(ARMORY.SHUTTER_X + 0.01);
  });
});
