import { describe, expect, it } from "vitest";

import type { InputManager } from "../../src/input/InputManager";
import { Player } from "../../src/player/Player";
import { ArenaCollision } from "../../src/world/ArenaCollision";
import { ARENA_HALF } from "../../src/world/ArenaLayout";

const world = new ArenaCollision();
const DT = 1 / 60;

/** Scripted input: held keys, a camera yaw, and a queued jump. */
class FakeInput {
  public yaw = 0;
  public pitch = 0;
  public keys = new Set<string>();
  public jumpQueued = false;

  public isPressed(code: string): boolean {
    return this.keys.has(code);
  }

  public consumeJump(): boolean {
    const jump = this.jumpQueued;

    this.jumpQueued = false;

    return jump;
  }
}

/** A real Player standing at (x, z) on `feetY`, facing the given heading. */
function spawnPlayer(x: number, feetY: number, z: number, yaw = 0) {
  const player = new Player();
  const input = new FakeInput();

  player.setWorld(world);
  player.teleport(x, feetY, z);
  input.yaw = yaw;

  const step = (seconds: number, onFrame?: () => void): void => {
    for (let t = 0; t < seconds; t += DT) {
      player.update(DT, input as unknown as InputManager);
      onFrame?.();
    }
  };

  return {
    player,
    input,
    step,
    feet: () => player.position.y - player.eyeHeight,
  };
}

// Camera forward is (-sin yaw, -cos yaw): yaw 0 = north (-z), PI = south (+z),
// PI/2 = west (-x), -PI/2 = east (+x).
const NORTH = 0;
const SOUTH = Math.PI;
const EAST = -Math.PI / 2;

describe("Player on the arena", () => {
  it("stands on the floor and stays grounded", () => {
    const { player, step } = spawnPlayer(-16, 0, -16);

    step(1);

    expect(player.isGrounded).toBe(true);
    expect(player.position.y - player.eyeHeight).toBeCloseTo(0);
  });

  it("runs up the central ramp onto the platform and stays grounded the whole way", () => {
    const { player, input, step, feet } = spawnPlayer(0, 0, 13, NORTH);
    let airborneFrames = 0;

    input.keys.add("KeyW");
    input.keys.add("ShiftLeft");
    step(2, () => {
      if (!player.isGrounded) airborneFrames++;
    });

    expect(feet()).toBeCloseTo(1.8, 2);
    expect(airborneFrames).toBe(0);
  });

  it("runs up the central stairs onto the platform", () => {
    const { input, step, feet } = spawnPlayer(0, 0, -11, SOUTH);

    input.keys.add("KeyW");
    input.keys.add("ShiftLeft");
    step(1);

    expect(feet()).toBeCloseTo(1.8, 2);
  });

  it("runs down the ramp without ever leaving the ground (no jump-animation flicker)", () => {
    const { player, input, step, feet } = spawnPlayer(0, 1.8, 2, SOUTH);
    let airborneFrames = 0;

    input.keys.add("KeyW");
    input.keys.add("ShiftLeft");
    step(2, () => {
      if (!player.isGrounded) airborneFrames++;
    });

    expect(feet()).toBeCloseTo(0, 2);
    expect(airborneFrames).toBe(0);
  });

  it("runs down stairs staying grounded", () => {
    const { player, input, step, feet } = spawnPlayer(0, 1.8, -3, NORTH);
    let airborneFrames = 0;

    input.keys.add("KeyW");
    input.keys.add("ShiftLeft");
    step(2, () => {
      if (!player.isGrounded) airborneFrames++;
    });

    expect(feet()).toBeCloseTo(0, 2);
    expect(airborneFrames).toBe(0);
  });

  it("walking off a platform edge falls to the floor and lands", () => {
    const { player, input, step, feet } = spawnPlayer(-3, 1.8, 0, EAST * -1);
    let leftGround = false;

    // Heading west (-x) off the central platform's west edge at x = -5.
    input.yaw = Math.PI / 2;
    input.keys.add("KeyW");
    step(1.5, () => {
      if (!player.isGrounded) leftGround = true;
    });

    expect(leftGround).toBe(true);
    expect(feet()).toBeCloseTo(0, 2);
    expect(player.isGrounded).toBe(true);
  });

  it("is stopped by a 1.4 m block and by the central platform from the floor", () => {
    const toBlock = spawnPlayer(-6, 0, 16, NORTH);

    toBlock.input.keys.add("KeyW");
    toBlock.step(1); // cover-block-3 is at z 12.5..13.5
    expect(toBlock.player.position.z).toBeGreaterThan(13.8);

    const toPlatform = spawnPlayer(-12, 0, 0, EAST);

    // Heading east along z = 0 at the floor: pillar/platform edge stops it.
    toPlatform.input.keys.add("KeyW");
    toPlatform.step(2);
    expect(toPlatform.feet()).toBe(0);
    expect(toPlatform.player.position.x).toBeLessThan(-5);
  });

  it("can hop a 0.8 m low wall by jumping, but not a 1.4 m block", () => {
    // cover-low-1 is at x -11..-7, z -9.5..-8.5 (0.8 m high). Approach from the south.
    const low = spawnPlayer(-9, 0, -6, NORTH);

    low.input.keys.add("KeyW");
    low.step(0.2);
    low.input.jumpQueued = true;
    low.step(1.2);
    expect(low.player.position.z).toBeLessThan(-9.6 + 0.2); // got across or onto it

    const high = spawnPlayer(-6, 0, 16, NORTH);

    high.input.keys.add("KeyW");
    high.step(0.15);
    high.input.jumpQueued = true;
    high.step(1.5);
    expect(high.player.position.z).toBeGreaterThan(13.8); // stayed on this side
  });

  it("can never leave the arena, even sprinting into a wall for a long time", () => {
    for (const yaw of [NORTH, SOUTH, EAST, -EAST]) {
      const { player, input, step } = spawnPlayer(-9, 0, 9, yaw);

      input.keys.add("KeyW");
      input.keys.add("ShiftLeft");
      step(8);

      expect(Math.abs(player.position.x)).toBeLessThanOrEqual(ARENA_HALF);
      expect(Math.abs(player.position.z)).toBeLessThanOrEqual(ARENA_HALF);
    }
  });

  it("can jump and lands back on the same spot", () => {
    const { player, input, step, feet } = spawnPlayer(-16, 0, -16);

    input.jumpQueued = true;
    step(0.1);
    expect(player.isGrounded).toBe(false);
    expect(feet()).toBeGreaterThan(0);

    step(1);
    expect(player.isGrounded).toBe(true);
    expect(feet()).toBeCloseTo(0);
  });

  it("a jump never reaches a 1.8 m platform from the floor", () => {
    const { input, step, feet } = spawnPlayer(3.5, 0, -7, SOUTH);

    // Standing just north of the platform's north face, but off the stairs (x = 3.5).
    input.keys.add("KeyW");
    step(0.1);
    input.jumpQueued = true;
    step(1.5);

    expect(feet()).toBe(0);
  });
});
