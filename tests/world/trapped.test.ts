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
it("from any surface, random play never traps, buries or strands the player", () => {
  const r = rng(11);
  const all = ["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "KeyC"];
  const bad: string[] = [];
  for (let i = 0; i < 500 && bad.length < 6; i++) {
    const x = (r() - 0.5) * 38,
      z = (r() - 0.5) * 38;
    const feet0 = world.groundHeight(x, z, 99);
    if (world.isBlocked(x, z, feet0, 0.35)) continue;
    const { player, input, step, feet } = spawnPlayer(x, feet0, z, r() * 6.28);
    let why = "";
    for (let seg = 0; seg < 12 && !why; seg++) {
      input.keys.clear();
      for (const k of all) if (r() < 0.35) input.keys.add(k);
      input.yaw = r() * 6.28;
      for (let f = 0; f < 40 && !why; f++) {
        if (r() < 0.04) input.jumpQueued = true;
        step(1 / 60);
        if (world.isBlocked(player.position.x, player.position.z, feet(), 0.33))
          why = "inside";
      }
    }
    if (!why) {
      // settle, then it must be able to walk away in some direction
      input.keys.clear();
      step(2);
      let moved = false;
      for (let a = 0; a < 8; a++) {
        const m = world.moveHorizontal(
          player.position.x,
          player.position.z,
          Math.cos(a * 0.785) * 0.1,
          Math.sin(a * 0.785) * 0.1,
          feet(),
        );
        if (Math.hypot(m.x - player.position.x, m.z - player.position.z) > 0.05)
          moved = true;
      }
      if (!moved) why = "trapped";
      if (!player.isGrounded) why = "floating";
    }
    if (why)
      bad.push(
        `${why} start (${x.toFixed(1)},${feet0.toFixed(1)},${z.toFixed(1)}) end (${player.position.x.toFixed(2)},${feet().toFixed(2)},${player.position.z.toFixed(2)})`,
      );
  }
  expect(bad).toEqual([]);
});
