import { describe, expect, it } from "vitest";

import {
  CLIMB,
  angleBetween,
  findLadder,
  ladderNormal,
  ladderYaw,
} from "../../src/player/Climb";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";
import { ladderBody } from "../../src/world/ArenaLayout";
import { NORTH, spawnPlayer } from "./playerHarness";

const ladders = ARENA_LAYOUT.ladders;

/** A player at the foot of a ladder, looking at it, ready to grab. */
function atFoot(index: number) {
  const ladder = ladders[index];
  const p = spawnPlayer(
    ladder.approach.x,
    ladder.bottomY,
    ladder.approach.z,
    ladderYaw(ladder),
  );

  p.step(0.05);

  return { ladder, p };
}

describe("Ladders are grabbed from their face only", () => {
  it("every ladder can be grabbed from its front, and none from behind the wall it is fixed to", () => {
    for (const ladder of ladders) {
      if (ladder.topY - ladder.bottomY < 1) continue;

      const n = ladderNormal(ladder.normal);
      const midFeet = (ladder.bottomY + ladder.topY) / 2;
      // Looking at the ladder from a metre in front, and from a metre behind.
      const yawToward = (fx: number, fz: number): number =>
        Math.atan2(-fx, -fz);
      const front = {
        x: ladder.x + n.x * 1,
        z: ladder.z + n.z * 1,
      };
      const behind = {
        x: ladder.x - n.x * 1,
        z: ladder.z - n.z * 1,
      };

      expect(
        findLadder([ladder], front.x, front.z, midFeet, yawToward(-n.x, -n.z)),
        `${ladder.id} front`,
      ).toBe(ladder);
      expect(
        findLadder([ladder], behind.x, behind.z, midFeet, yawToward(n.x, n.z)),
        `${ladder.id} behind`,
      ).toBeNull();
    }
  });
});

describe("Finding a ladder", () => {
  it.each(ladders.map((l, i) => [l.id, i] as const))(
    "%s can be grabbed from its foot, looking at it",
    (_id, index) => {
      const { ladder, p } = atFoot(index);

      expect(p.player.ladderInReach()?.id).toBe(ladder.id);
    },
  );

  it("not when looking away, or from far off", () => {
    const { ladder } = atFoot(0);

    expect(
      findLadder(
        ladders,
        ladder.approach.x,
        ladder.approach.z,
        0,
        ladderYaw(ladder) + Math.PI,
      ),
    ).toBeNull();
    expect(
      findLadder(
        ladders,
        ladder.approach.x + 6,
        ladder.approach.z,
        0,
        ladderYaw(ladder),
      ),
    ).toBeNull();
  });
});

describe("Climbing", () => {
  it.each(ladders.map((l, i) => [l.id, i] as const))(
    "%s: up to the top, then standing on the floor at its exit",
    (_id, index) => {
      const { ladder, p } = atFoot(index);

      expect(p.player.grabLadder()).toBe(true);
      expect(p.player.isClimbing).toBe(true);

      p.input.keys.add("KeyW");

      // Climb until stepping onto the floor, then let go of the key.
      for (let t = 0; t < 10 && p.player.isClimbing; t += 1 / 60) {
        p.step(1 / 60);
      }

      p.input.keys.clear();
      p.step(0.5);

      expect(p.player.isClimbing).toBe(false);
      expect(p.player.isGrounded).toBe(true);
      expect(p.feet()).toBeCloseTo(ladder.topY, 2);
      expect(p.player.position.x).toBeCloseTo(ladder.exit.x, 1);
      expect(p.player.position.z).toBeCloseTo(ladder.exit.z, 1);
    },
  );

  it("climbs at a steady speed and gravity does not pull while holding on", () => {
    const { p } = atFoot(0);

    p.player.grabLadder();
    p.step(1);
    expect(p.feet()).toBeCloseTo(0, 2);

    p.input.keys.add("KeyW");
    p.step(1);
    expect(p.feet()).toBeCloseTo(CLIMB.SPEED, 1);
  });

  it("S climbs down and steps off at the bottom", () => {
    const { p } = atFoot(0);

    p.player.grabLadder();
    p.input.keys.add("KeyW");
    p.step(1);
    p.input.keys.clear();
    p.input.keys.add("KeyS");
    p.step(1.5);

    expect(p.player.isClimbing).toBe(false);
    expect(p.feet()).toBeCloseTo(0, 2);
    expect(p.player.isGrounded).toBe(true);
  });

  it("Space jumps off, away from the ladder, and falls", () => {
    const { ladder, p } = atFoot(0);

    p.player.grabLadder();
    p.input.keys.add("KeyW");
    p.step(1);
    p.input.keys.clear();
    p.input.jumpQueued = true;
    p.step(0.1);

    expect(p.player.isClimbing).toBe(false);

    p.step(2);

    expect(p.player.isGrounded).toBe(true);
    expect(p.feet()).toBeCloseTo(0, 1);
    // Away from the face it was on (the ladder looks along its normal).
    const away =
      (p.player.position.x - ladder.x) *
        (ladder.normal.endsWith("x")
          ? ladder.normal.startsWith("+")
            ? 1
            : -1
          : 0) +
      (p.player.position.z - ladder.z) *
        (ladder.normal.endsWith("z")
          ? ladder.normal.startsWith("+")
            ? 1
            : -1
          : 0);

    expect(away).toBeGreaterThan(0.8);
  });

  it("ordinary movement keys do not move a climber sideways", () => {
    const { p } = atFoot(0);
    const x = p.player.position.x;

    p.player.grabLadder();
    p.input.keys.add("KeyD");
    p.step(1);

    expect(p.player.position.x).toBeCloseTo(x + 0, 0);
    expect(p.player.isClimbing).toBe(true);
  });

  it("can climb down from the top edge", () => {
    const ladder = ladders[0];
    const p = spawnPlayer(
      ladder.exit.x,
      ladder.topY,
      ladder.exit.z,
      ladderYaw(ladder) + Math.PI,
    );

    p.step(0.05);

    expect(p.player.grabLadder()).toBe(true);

    p.input.keys.add("KeyS");
    p.step(ladder.topY / CLIMB.SPEED + 0.5);

    expect(p.player.isClimbing).toBe(false);
    expect(p.feet()).toBeCloseTo(0, 2);
  });
});

describe("Roof hatches", () => {
  const hatched = ladders.find((l) => l.hatch)!;
  const open = new Set<string>();

  function climber() {
    const p = spawnPlayer(
      hatched.approach.x,
      hatched.bottomY,
      hatched.approach.z,
      ladderYaw(hatched),
    );

    p.player.isHatchShut = (id) => !open.has(id);
    p.step(0.05);
    p.player.grabLadder();

    return p;
  }

  it("a ladder that climbs through a roof has a hatch in it", () => {
    expect(hatched).toBeDefined();
    expect(hatched.hatch!.stopY).toBeLessThan(hatched.topY - 1.8);
  });

  it("a shut hatch stops the climb with the head just under it", () => {
    open.clear();

    const p = climber();

    p.input.keys.add("KeyW");
    p.step(8);

    expect(p.player.isClimbing).toBe(true);
    expect(p.feet()).toBeCloseTo(hatched.hatch!.stopY, 1);
    expect(p.player.atShutHatch).toBe(true);
    expect(p.player.shutHatchId).toBe(hatched.hatch!.id);
  });

  it("once opened, the climb goes through and the hatch stays open", () => {
    open.clear();

    const p = climber();

    p.input.keys.add("KeyW");
    p.step(8);
    open.add(hatched.hatch!.id);

    for (let t = 0; t < 5 && p.player.isClimbing; t += 1 / 60) {
      p.step(1 / 60);
    }

    p.input.keys.clear();
    p.step(0.3);

    expect(p.player.isClimbing).toBe(false);
    expect(p.feet()).toBeCloseTo(hatched.topY, 2);

    // A second climber finds it still open.
    const again = climber();

    again.input.keys.add("KeyW");

    for (let t = 0; t < 8 && again.player.isClimbing; t += 1 / 60) {
      again.step(1 / 60);
    }

    expect(again.player.isClimbing).toBe(false);
    expect(again.feet()).toBeCloseTo(hatched.topY, 1);
  });

  it("from the roof, a shut hatch holds a climber at the top until it is opened", () => {
    open.clear();

    const p = spawnPlayer(
      hatched.exit.x,
      hatched.topY,
      hatched.exit.z,
      ladderYaw(hatched) + Math.PI,
    );

    p.player.isHatchShut = (id) => !open.has(id);
    p.step(0.05);
    expect(p.player.grabLadder()).toBe(true);

    p.input.keys.add("KeyS");
    p.step(1);

    expect(p.feet()).toBeCloseTo(hatched.topY, 2);
    expect(p.player.atShutHatch).toBe(true);

    open.add(hatched.hatch!.id);
    p.step(1);

    expect(p.feet()).toBeLessThan(hatched.topY - 1);
    open.clear();
  });
});

describe("Looking round on a ladder", () => {
  it("angleBetween gives the short way round", () => {
    expect(angleBetween(0.1, -0.1)).toBeCloseTo(0.2, 9);
    expect(angleBetween(3.1, -3.1)).toBeCloseTo(3.1 + 3.1 - 2 * Math.PI, 9);
    expect(Math.abs(angleBetween(7, 7 - 2 * Math.PI))).toBeLessThan(1e-9);
  });

  it("the head turns less than the full circle", () => {
    expect(CLIMB.LOOK_RANGE).toBeGreaterThan(0.8);
    expect(CLIMB.LOOK_RANGE).toBeLessThan(Math.PI * 0.6);
  });
});

describe("Grabbing on the move, and solid ladders", () => {
  it("running at a ladder and pressing E grabs it", () => {
    const ladder = ladders.find((l) => l.id === "ladder-north")!;
    // Three metres out, running at it.
    const p = spawnPlayer(
      ladder.approach.x,
      0,
      ladder.approach.z + 3,
      ladderYaw(ladder),
    );

    p.input.keys.add("KeyW");
    p.input.keys.add("ShiftLeft");
    p.step(0.45);

    expect(p.player.ladderInReach()?.id).toBe(ladder.id);
    expect(p.player.grabLadder()).toBe(true);
    expect(p.player.isClimbing).toBe(true);
    // Stuck to the ladder: no momentum carries on.
    p.input.keys.clear();
    p.step(0.5);
    expect(p.player.isClimbing).toBe(true);
  });

  it("jumping at a ladder and pressing E in the air grabs it", () => {
    const ladder = ladders.find((l) => l.id === "ladder-south")!;
    const p = spawnPlayer(
      ladder.approach.x,
      0,
      ladder.approach.z - 1.4,
      ladderYaw(ladder),
    );

    p.step(0.1);
    p.input.jumpQueued = true;
    p.input.keys.add("KeyW");
    p.step(0.3);

    expect(p.player.isGrounded).toBe(false);
    expect(p.player.grabLadder()).toBe(true);
    expect(p.player.isClimbing).toBe(true);
  });

  it("a ladder is solid: a walker is stopped by it, not passed through", () => {
    const ladder = ladders.find((l) => l.id === "ladder-north")!;
    const p = spawnPlayer(ladder.x, 0, -8, NORTH);

    p.input.keys.add("KeyW");
    p.step(3);

    // Bare wall would stop the body at -11.5; the ladder's body stops it 0.18 m sooner.
    expect(p.player.position.z).toBeGreaterThan(-11.4);
    expect(p.player.position.z).toBeLessThan(-11.2);
  });

  it("every ladder has a body that blocks a person standing in it, and leaves its foot free", () => {
    for (const ladder of ladders) {
      expect(ladderBody(ladder).height, ladder.id).toBeLessThan(ladder.topY);
      expect(ladderBody(ladder).bottom, ladder.id).toBe(ladder.bottomY);
    }
  });
});
