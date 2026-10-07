import { expect, it } from "vitest";

import { PLAYER_RADIUS } from "../../src/world/ArenaCollision";
import { reachableStands } from "./nav";
import { rng, spawnPlayer, world } from "./playerHarness";

// Starting places: spots a player can really reach (floor, platform tops,
// ramps, steps), never the tops of blocks and columns nobody can climb onto.
const stands = reachableStands(2);

it("there are plenty of places to start from", () => {
  expect(stands.length).toBeGreaterThan(500);
  expect(stands.some((s) => s.feet > 1.9)).toBe(true); // the high platforms too
});

it("random play never ends up inside scenery, whatever the approach, keys and jump timing", () => {
  const random = rng(7);
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

  for (let i = 0; i < 800 && bad.length < 5; i++) {
    const start = stands[Math.floor(random() * stands.length)];
    const yaw = random() * Math.PI * 2;
    const { player, input, step, feet } = spawnPlayer(
      start.x,
      start.feet,
      start.z,
      yaw,
    );

    for (const key of keysets[Math.floor(random() * keysets.length)]) {
      input.keys.add(key);
    }

    const delay = random() * 1.2;
    let t = 0;
    let jumped = false;
    let jumps = 0;

    for (let f = 0; f < 60 * 6; f++) {
      if (!jumped && t >= delay) {
        input.jumpQueued = true;
        jumped = true;
      }

      if (jumped && player.isGrounded && random() < 0.05 && jumps < 3) {
        input.jumpQueued = true;
        jumps++;
      }

      step(1 / 60);
      t += 1 / 60;

      if (
        world.isBlocked(
          player.position.x,
          player.position.z,
          feet(),
          PLAYER_RADIUS - 0.17,
        )
      ) {
        bad.push(
          `x=${start.x.toFixed(2)} z=${start.z.toFixed(2)} feet=${start.feet.toFixed(2)} yaw=${yaw.toFixed(2)} keys=${[...input.keys]} delay=${delay.toFixed(2)} at (${player.position.x.toFixed(2)}, ${feet().toFixed(2)}, ${player.position.z.toFixed(2)})`,
        );
        break;
      }
    }
  }

  expect(bad).toEqual([]);
});

it("from any place, random play never traps or strands the player", () => {
  const random = rng(11);
  const all = ["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "KeyC"];
  const bad: string[] = [];

  for (let i = 0; i < 400 && bad.length < 6; i++) {
    const start = stands[Math.floor(random() * stands.length)];
    const { player, input, step, feet } = spawnPlayer(
      start.x,
      start.feet,
      start.z,
      random() * 6.28,
    );
    let why = "";

    for (let segment = 0; segment < 12 && !why; segment++) {
      input.keys.clear();

      for (const key of all) {
        if (random() < 0.35) input.keys.add(key);
      }

      input.yaw = random() * 6.28;

      for (let f = 0; f < 40 && !why; f++) {
        if (random() < 0.04) input.jumpQueued = true;

        step(1 / 60);

        if (
          world.isBlocked(
            player.position.x,
            player.position.z,
            feet(),
            PLAYER_RADIUS - 0.17,
          )
        ) {
          why = "inside";
        }
      }
    }

    if (!why) {
      // Settle, then it must be able to walk away in some direction.
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

        if (
          Math.hypot(m.x - player.position.x, m.z - player.position.z) > 0.05
        ) {
          moved = true;
        }
      }

      if (!moved) why = "trapped";
      if (!player.isGrounded) why = "floating";
    }

    if (why) {
      bad.push(
        `${why} start (${start.x.toFixed(1)}, ${start.feet.toFixed(1)}, ${start.z.toFixed(1)}) end (${player.position.x.toFixed(2)}, ${feet().toFixed(2)}, ${player.position.z.toFixed(2)})`,
      );
    }
  }

  expect(bad).toEqual([]);
});
