import type { InputManager } from "../../src/input/InputManager";
import { Player } from "../../src/player/Player";
import { ArenaCollision } from "../../src/world/ArenaCollision";

export const world = new ArenaCollision();
export const DT = 1 / 60;

/** Scripted input: held keys, a camera yaw, and a queued jump. */
export class FakeInput {
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
export function spawnPlayer(x: number, feetY: number, z: number, yaw = 0) {
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

/**
 * Camera forward is (-sin yaw, -cos yaw): yaw 0 faces north (-z), PI south (+z),
 * PI/2 west (-x), -PI/2 east (+x).
 */
export const NORTH = 0;
export const SOUTH = Math.PI;
export const WEST = Math.PI / 2;
export const EAST = -Math.PI / 2;

/** The yaw that faces a direction given as a vector (dx, dz). */
export function yawFor(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/** Small seeded generator so the random runs are repeatable. */
export function rng(seed: number): () => number {
  let a = seed;

  return () => {
    a = (a + 0x6d2b79f5) | 0;

    let t = Math.imul(a ^ (a >>> 15), 1 | a);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
