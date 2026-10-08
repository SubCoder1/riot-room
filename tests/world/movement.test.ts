import { describe, expect, it } from "vitest";

import { SOURCE_MOVEMENT } from "../../src/player/SourceMovement";
import { NORTH, spawnPlayer, world } from "./playerHarness";

/**
 * A long clear lane of open floor (no cover or walls for 14 m ahead, at head
 * and knee height), found once, so a run is never cut short by scenery.
 */
const lane = (() => {
  for (let x = -16; x <= 16; x += 2) {
    for (let z = 16; z >= -2; z -= 2) {
      const to = z - 14;

      if (
        world.segmentClearFraction(x, 0.3, z, x, 0.3, to) >= 1 &&
        world.segmentClearFraction(x, 1.5, z, x, 1.5, to) >= 1 &&
        world.groundHeight(x, z, 0) === 0
      ) {
        return { x, z };
      }
    }
  }

  throw new Error("no clear lane");
})();

const open = () => spawnPlayer(lane.x, 0, lane.z, NORTH);

const speedOf = (p: ReturnType<typeof open>): number =>
  Math.hypot(p.player.velocity.x, p.player.velocity.z);

describe("CS:GO-style movement", () => {
  it("runs a little above a CS:GO rifle's speed, and Shift is a clearly faster sprint", () => {
    expect(SOURCE_MOVEMENT.RIFLE_SPEED / 0.0254).toBeCloseTo(215, 0);
    expect(SOURCE_MOVEMENT.RUN_SPEED).toBeGreaterThan(
      SOURCE_MOVEMENT.RIFLE_SPEED,
    );
    expect(SOURCE_MOVEMENT.RUN_SPEED).toBeLessThan(
      SOURCE_MOVEMENT.RIFLE_SPEED * 1.2,
    );
    expect(SOURCE_MOVEMENT.SPRINT_SPEED).toBeGreaterThan(
      SOURCE_MOVEMENT.RUN_SPEED * 1.3,
    );

    const run = open();

    run.input.keys.add("KeyW");
    run.step(1);
    expect(speedOf(run)).toBeCloseTo(SOURCE_MOVEMENT.RUN_SPEED, 1);

    const fast = open();

    fast.input.keys.add("KeyW");
    fast.input.keys.add("ShiftLeft");
    fast.step(1);
    expect(speedOf(fast)).toBeCloseTo(SOURCE_MOVEMENT.SPRINT_SPEED, 1);
  });

  it("does not start instantly: it takes a moment to reach full speed", () => {
    const p = open();

    p.input.keys.add("KeyW");
    p.step(1 / 60);
    expect(speedOf(p)).toBeLessThan(SOURCE_MOVEMENT.RUN_SPEED * 0.3);

    p.step(0.1);
    expect(speedOf(p)).toBeLessThan(SOURCE_MOVEMENT.RUN_SPEED);

    p.step(0.3);
    expect(speedOf(p)).toBeGreaterThan(SOURCE_MOVEMENT.RUN_SPEED * 0.9);
  });

  it("never goes past the top speed, and diagonals are not faster", () => {
    const p = open();

    p.input.keys.add("KeyW");
    p.input.keys.add("KeyD");

    let fastest = 0;

    p.step(2, () => {
      fastest = Math.max(fastest, speedOf(p));
    });

    expect(fastest).toBeLessThanOrEqual(SOURCE_MOVEMENT.RUN_SPEED + 1e-6);
  });

  it("does not stop instantly: friction slides it to a halt in a moment", () => {
    const p = open();

    p.input.keys.add("KeyW");
    p.step(1);
    p.input.keys.clear();
    p.step(1 / 60);
    expect(speedOf(p)).toBeGreaterThan(SOURCE_MOVEMENT.RUN_SPEED * 0.8);

    p.step(0.6);
    expect(speedOf(p)).toBeLessThan(0.3);
  });

  it("counter-strafing (the opposite key) stops much faster than letting go", () => {
    const coast = open();
    const brake = open();

    for (const p of [coast, brake]) {
      p.input.keys.add("KeyD");
      p.step(1);
    }

    coast.input.keys.clear();
    brake.input.keys.clear();
    brake.input.keys.add("KeyA");

    coast.step(0.12);
    brake.step(0.12);

    expect(speedOf(brake)).toBeLessThan(speedOf(coast));
  });

  it("a jump keeps its momentum when the keys are released, and can still be steered", () => {
    const p = open();

    p.input.keys.add("KeyW");
    p.step(1);
    p.input.jumpQueued = true;
    p.step(0.05);
    expect(p.player.isGrounded).toBe(false);

    // Let go of everything mid-air: the jump carries on at full speed.
    p.input.keys.clear();
    p.step(0.3);
    expect(p.player.isGrounded).toBe(false);
    expect(speedOf(p)).toBeGreaterThan(SOURCE_MOVEMENT.RUN_SPEED * 0.95);

    // Holding a direction in the air steers it (as before), at the air-control rate.
    p.input.keys.add("KeyA");
    p.step(0.2);
    expect(Math.abs(p.player.velocity.x)).toBeGreaterThan(1);
    expect(Math.abs(p.player.velocity.x)).toBeLessThanOrEqual(
      SOURCE_MOVEMENT.AIR_CONTROL * 0.2 + 1e-6,
    );
  });

  it("strafing alone is slower than running, with and without Shift", () => {
    const strafe = open();

    strafe.input.keys.add("KeyD");
    strafe.step(1);
    expect(speedOf(strafe)).toBeCloseTo(
      SOURCE_MOVEMENT.RUN_SPEED * SOURCE_MOVEMENT.STRAFE_FACTOR,
      1,
    );

    const fastStrafe = open();

    fastStrafe.input.keys.add("KeyD");
    fastStrafe.input.keys.add("ShiftLeft");
    fastStrafe.step(1);
    expect(speedOf(fastStrafe)).toBeCloseTo(
      SOURCE_MOVEMENT.SPRINT_SPEED * SOURCE_MOVEMENT.STRAFE_FACTOR,
      1,
    );

    // Holding Shift makes a real difference to a strafe...
    expect(speedOf(fastStrafe)).toBeGreaterThan(speedOf(strafe) * 1.3);
    // ...and a strafe is clearly slower than a run.
    expect(speedOf(strafe)).toBeLessThan(SOURCE_MOVEMENT.RUN_SPEED * 0.85);
  });

  it("running diagonally (W + D) is not slowed like a pure strafe", () => {
    const p = open();

    p.input.keys.add("KeyW");
    p.input.keys.add("KeyD");
    p.step(1);

    expect(speedOf(p)).toBeCloseTo(SOURCE_MOVEMENT.RUN_SPEED, 1);
  });

  it("sprinting is slower than the old arcade sprint but still quick", () => {
    expect(SOURCE_MOVEMENT.SPRINT_SPEED).toBeLessThan(8.5);
    expect(SOURCE_MOVEMENT.SPRINT_SPEED).toBeGreaterThanOrEqual(7);
  });
});
