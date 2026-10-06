import { expect, it } from "vitest";

import type { InputManager } from "../../src/input/InputManager";
import { Player } from "../../src/player/Player";
import { ArenaCollision } from "../../src/world/ArenaCollision";

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

/** Small seeded generator so the random runs are repeatable. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
it("never ends up inside scenery, whatever the approach, keys and jump timing", () => {
  const r = rng(7);
  const keysets = [
    ["KeyW"],
    ["KeyW", "ShiftLeft"],
    ["KeyW", "KeyA"],
    ["KeyW", "KeyD", "ShiftLeft"],
    ["KeyA"],
    ["KeyD"],
    ["KeyS"],
  ];
  const bad: string[] = [];
  for (let i = 0; i < 1200 && bad.length < 5; i++) {
    const x = (r() - 0.5) * 36,
      z = (r() - 0.5) * 36;
    if (world.isBlocked(x, z, 0, 0.35)) continue;
    const yaw = r() * Math.PI * 2;
    const { player, input, step, feet } = spawnPlayer(x, 0, z, yaw);
    for (const k of keysets[Math.floor(r() * keysets.length)])
      input.keys.add(k);
    const delay = r() * 1.2;
    let t = 0,
      jumped = false,
      jumps = 0;
    for (let f = 0; f < 60 * 6; f++) {
      if (!jumped && t >= delay) {
        input.jumpQueued = true;
        jumped = true;
      }
      if (jumped && player.isGrounded && r() < 0.05 && jumps < 3) {
        input.jumpQueued = true;
        jumps++;
      }
      step(1 / 60);
      t += 1 / 60;
      if (world.isBlocked(player.position.x, player.position.z, feet(), 0.33)) {
        bad.push(
          `x=${x.toFixed(2)} z=${z.toFixed(2)} yaw=${yaw.toFixed(2)} keys=${[...input.keys]} delay=${delay.toFixed(2)} at pos (${player.position.x.toFixed(2)},${feet().toFixed(2)},${player.position.z.toFixed(2)})`,
        );
        break;
      }
    }
  }
  expect(bad).toEqual([]);
});
