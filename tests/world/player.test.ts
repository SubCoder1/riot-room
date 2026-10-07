import { describe, expect, it } from "vitest";

import { ARENA_HALF, ARENA_LAYOUT } from "../../src/world/ArenaLayout";
import { EAST, NORTH, SOUTH, WEST, spawnPlayer, yawFor } from "./playerHarness";

const layout = ARENA_LAYOUT;
const walkway = layout.platforms.find((p) => p.id === "north-walkway")!;
const tower = layout.platforms.find((p) => p.id === "east-tower")!;

/** A running start: hold W (and Shift) for `seconds`. */
function run(
  p: ReturnType<typeof spawnPlayer>,
  seconds: number,
  onFrame?: () => void,
): void {
  p.input.keys.add("KeyW");
  p.input.keys.add("ShiftLeft");
  p.step(seconds, onFrame);
}

describe("Player on the arena", () => {
  it("stands on the floor and stays grounded", () => {
    const { player, step } = spawnPlayer(-17.5, 0, -9);

    step(1);

    expect(player.isGrounded).toBe(true);
    expect(player.position.y - player.eyeHeight).toBeCloseTo(0);
  });

  it("runs up a ramp onto the walkway and stays grounded the whole way", () => {
    const ramp = layout.ramps.find((r) => r.id === "walkway-ramp-west")!;
    const z = (ramp.minZ + ramp.maxZ) / 2;
    const p = spawnPlayer(ramp.minX - 2, 0, z, EAST);
    let airborne = 0;

    run(p, 1.5, () => {
      if (!p.player.isGrounded) airborne++;
    });

    expect(p.feet()).toBeCloseTo(walkway.height, 2);
    expect(airborne).toBe(0);
  });

  it("runs up a long staircase onto the tower", () => {
    const stairs = layout.stairs.find((s) => s.id === "tower-stairs-south")!;
    const x = (stairs.crossMin + stairs.crossMax) / 2;
    const p = spawnPlayer(x, 0, stairs.start + 1.5, NORTH);
    let airborne = 0;

    run(p, 1.4, () => {
      if (!p.player.isGrounded) airborne++;
    });

    expect(p.feet()).toBeCloseTo(tower.height, 2);
    expect(airborne).toBe(0);
  });

  it("runs down the ramp and the stairs without ever leaving the ground", () => {
    // Down the walkway ramp (heading west along the walkway).
    const ramp = layout.ramps.find((r) => r.id === "walkway-ramp-west")!;
    const z = (ramp.minZ + ramp.maxZ) / 2;
    const down = spawnPlayer(ramp.maxX + 1, walkway.height, z, WEST);
    let airborne = 0;

    run(down, 1.5, () => {
      if (!down.player.isGrounded) airborne++;
    });

    expect(down.feet()).toBeCloseTo(0, 2);
    expect(airborne).toBe(0);

    // Down the tower stairs (heading south).
    const stairs = layout.stairs.find((s) => s.id === "tower-stairs-south")!;
    const x = (stairs.crossMin + stairs.crossMax) / 2;
    const off = spawnPlayer(x, tower.height, tower.maxZ - 1, SOUTH);

    airborne = 0;
    run(off, 1.6, () => {
      if (!off.player.isGrounded) airborne++;
    });

    expect(off.feet()).toBeCloseTo(0, 2);
    expect(airborne).toBe(0);
  });

  it("walking off the walkway's edge falls to the floor and lands", () => {
    const x = (walkway.minX + walkway.maxX) / 2;
    const p = spawnPlayer(x, walkway.height, walkway.maxZ - 1, SOUTH);
    let leftGround = false;

    p.input.keys.add("KeyW");
    p.step(1.5, () => {
      if (!p.player.isGrounded) leftGround = true;
    });

    expect(leftGround).toBe(true);
    expect(p.feet()).toBeCloseTo(0, 2);
    expect(p.player.isGrounded).toBe(true);
  });

  it("a 2 m block stops a runner; so does the tower's wall", () => {
    const block = layout.covers.find((c) => c.id === "cover-block-3")!;
    const bx = (block.minX + block.maxX) / 2;
    const toBlock = spawnPlayer(bx, 0, block.maxZ + 4, NORTH);

    run(toBlock, 1.5);
    expect(toBlock.player.position.z).toBeGreaterThan(block.maxZ);

    const toTower = spawnPlayer(
      (tower.minX + tower.maxX) / 2,
      0,
      tower.minZ - 6,
      SOUTH,
    );

    run(toTower, 2);
    expect(toTower.feet()).toBe(0);
    expect(toTower.player.position.z).toBeLessThan(tower.minZ);
  });

  it("can hop a 0.8 m low wall by jumping, but never a 2 m block", () => {
    const low = layout.covers.find((c) => c.id === "cover-low-1")!;
    const lx = (low.minX + low.maxX) / 2;
    // Run at the low wall from the north (it is 1 m thick: z -4..-3).
    const hop = spawnPlayer(lx, 0, low.minZ - 3, SOUTH);

    hop.input.keys.add("KeyW");
    hop.step(0.15);
    hop.input.jumpQueued = true;
    hop.step(1.4);
    expect(hop.player.position.z).toBeGreaterThan(low.maxZ);

    const block = layout.covers.find((c) => c.id === "cover-block-3")!;
    const bx = (block.minX + block.maxX) / 2;
    const jump = spawnPlayer(bx, 0, block.maxZ + 3, NORTH);

    jump.input.keys.add("KeyW");
    jump.step(0.15);
    jump.input.jumpQueued = true;
    jump.step(1.5);
    expect(jump.player.position.z).toBeGreaterThan(block.maxZ);
  });

  it("a jump can reach a 1.3 m step from the floor-level side but not the 2.6 m tower", () => {
    const step = layout.platforms.find((p) => p.id === "east-step")!;
    const sx = (step.minX + step.maxX) / 2;
    // Stand south of the step, face it, jump while walking in.
    const p = spawnPlayer(sx, 0, step.maxZ + 2, NORTH);

    p.input.keys.add("KeyW");
    p.step(0.2);
    p.input.jumpQueued = true;
    p.step(0.6);
    p.input.keys.clear();
    p.step(1);
    expect(p.feet()).toBeCloseTo(step.height, 1);

    // The same from the floor onto the tower is out of reach.
    const q = spawnPlayer(
      (tower.minX + tower.maxX) / 2,
      0,
      tower.minZ - 3,
      SOUTH,
    );

    q.input.keys.add("KeyW");
    q.step(0.1);
    q.input.jumpQueued = true;
    q.step(1.5);
    expect(q.feet()).toBeLessThan(tower.height - 1);
  });

  it("from the step, a jump gets up onto the tower (the second way up)", () => {
    const step = layout.platforms.find((p) => p.id === "east-step")!;
    // The step is touching the tower's west face: walk east into it and jump.
    const z = (step.minZ + step.maxZ) / 2;
    const p = spawnPlayer(step.maxX - 1.5, step.height, z, EAST);

    p.input.keys.add("KeyW");
    p.step(0.15);
    p.input.jumpQueued = true;
    p.step(0.6);
    p.input.keys.clear();
    p.step(1);

    expect(p.feet()).toBeCloseTo(tower.height, 1);
  });

  it("can never leave the arena, even sprinting into a wall for a long time", () => {
    for (const yaw of [NORTH, SOUTH, EAST, WEST, yawFor(1, 1), yawFor(-1, 1)]) {
      const p = spawnPlayer(1, 0, 1, yaw);

      run(p, 8);

      expect(Math.abs(p.player.position.x)).toBeLessThanOrEqual(ARENA_HALF);
      expect(Math.abs(p.player.position.z)).toBeLessThanOrEqual(ARENA_HALF);
    }
  });

  it("letting go of the keys mid-jump keeps the momentum; landing stops you", () => {
    const p = spawnPlayer(-17.5, 0, -9, EAST);

    p.input.keys.add("KeyW");
    p.step(0.3);
    p.input.jumpQueued = true;
    p.step(0.05);
    p.input.keys.clear();

    const released = p.player.position.x;

    p.step(0.2);
    expect(p.player.isGrounded).toBe(false);
    expect(p.player.position.x).toBeGreaterThan(released + 0.8);

    p.step(1.5);
    expect(p.player.isGrounded).toBe(true);

    const landed = p.player.position.x;

    p.step(0.5);
    expect(p.player.position.x).toBeCloseTo(landed, 5);
  });

  it("a jump pressed just after running off a ledge still works (coyote time)", () => {
    const x = (walkway.minX + walkway.maxX) / 2;
    const p = spawnPlayer(x, walkway.height, walkway.maxZ - 0.6, SOUTH);

    p.input.keys.add("KeyW");

    // Walk until the feet leave the edge, then wait a moment and jump.
    let guard = 0;

    while (p.player.isGrounded && guard++ < 120) p.step(1 / 60);

    expect(p.player.isGrounded).toBe(false);
    p.step(0.06);

    const before = p.player.velocity.y;

    p.input.jumpQueued = true;
    p.step(1 / 60);
    expect(p.player.velocity.y).toBeGreaterThan(before + 3);
  });

  it("a jump pressed just before landing is remembered and happens on touchdown", () => {
    const p = spawnPlayer(-17.5, 0, -9);

    p.input.jumpQueued = true;
    p.step(0.1);

    let pressed = false;
    let landed = false;
    let jumpedAgain = false;

    for (let k = 0; k < 240; k++) {
      // Falling and almost down: press now, a moment too early.
      if (!pressed && p.player.velocity.y < 0 && p.feet() < 0.25) {
        p.input.jumpQueued = true;
        pressed = true;
      }

      p.step(1 / 60);

      if (pressed && p.player.isGrounded) landed = true;
      if (pressed && p.player.velocity.y > 3) jumpedAgain = true;
    }

    expect(pressed).toBe(true);
    expect(jumpedAgain).toBe(true);
    expect(landed || jumpedAgain).toBe(true);
  });

  it("can jump and lands back on the same spot", () => {
    const p = spawnPlayer(-17.5, 0, -9);

    p.input.jumpQueued = true;
    p.step(0.1);
    expect(p.player.isGrounded).toBe(false);
    expect(p.feet()).toBeGreaterThan(0);

    p.step(1);
    expect(p.player.isGrounded).toBe(true);
    expect(p.feet()).toBeCloseTo(0);
  });
});
