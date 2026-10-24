import { describe, expect, it } from "vitest";

import { ARMORY } from "../../src/world/ArmoryMechanisms";
import { spawnPlayer, world } from "./playerHarness";

const SHUT = [
  {
    kind: "box" as const,
    id: "test-shutter",
    role: "wall" as const,
    minX: ARMORY.SHUTTER_X - ARMORY.SHUTTER_THICKNESS / 2,
    maxX: ARMORY.SHUTTER_X + ARMORY.SHUTTER_THICKNESS / 2,
    minZ: ARMORY.SHUTTER_Z0,
    maxZ: ARMORY.SHUTTER_Z1,
    bottom: ARMORY.FLOOR,
    height: ARMORY.FLOOR + ARMORY.SHUTTER_HEIGHT,
  },
  {
    kind: "box" as const,
    id: "test-hatch",
    role: "wall" as const,
    minX: ARMORY.DOOR_OPENING_MIN_X,
    maxX: ARMORY.DOOR_OPENING_MAX_X,
    minZ: ARMORY.DOOR_Z - ARMORY.DOOR_THICKNESS / 2,
    maxZ: ARMORY.DOOR_Z + ARMORY.DOOR_THICKNESS / 2,
    bottom: ARMORY.FLOOR,
    height: ARMORY.FLOOR + ARMORY.DOOR_OPENING_HEIGHT,
  },
];

for (const solid of SHUT) {
  world.addMovable(solid);
}

const fullShutter = SHUT[0];

/**
 * Nobody can leave the Armory but by its two doorways: not by jumping from the
 * table to the shelves and on, not by wedging in a gap (which once carried a
 * body across the map), not through a slit at a corner. A real Player is driven
 * by a fixed random walk of jumps, sprints and turns, both doorways shut as in
 * the game (the shutter down, the hatch closed), and must stay inside.
 */
describe("The Armory cannot be left by jumping or wedging", () => {
  // The room: x -31.7 to -20.5, z 5.3 to 12 (the walls' own thickness beyond).
  const outside = (x: number, z: number): boolean =>
    x > -20.2 || z > 12.3 || x < -32 || z < 5.0;

  it("a thousand-odd jumps, sprints and turns never carry anyone out", () => {
    let seed = 20240607;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;

      return seed / 4294967296;
    };
    const escapes: string[] = [];
    let highest = 0;

    for (let run = 0; run < 60 && escapes.length === 0; run++) {
      // From anywhere on the floor, clear of the doorways' own wall thickness.
      const sx = -31.2 + random() * 10.0;
      const sz = 5.8 + random() * 5.6;
      const p = spawnPlayer(sx, ARMORY.FLOOR, sz, random() * Math.PI * 2);

      p.input.keys.add("KeyW");

      for (let t = 0; t < 30 && escapes.length === 0; t += 0.25) {
        if (random() < 0.5) {
          p.input.yaw = random() * Math.PI * 2;
        }

        if (random() < 0.35) {
          p.input.keys.add("ShiftLeft");
        } else {
          p.input.keys.delete("ShiftLeft");
        }

        p.input.keys.delete("KeyA");
        p.input.keys.delete("KeyD");
        p.input.keys.add("KeyW");

        if (random() < 0.15) {
          p.input.keys.delete("KeyW");
          p.input.keys.add(random() < 0.5 ? "KeyA" : "KeyD");
        }

        for (let k = 0; k < 15; k++) {
          if (random() < 0.08) {
            p.input.jumpQueued = true;
          }

          p.step(1 / 60);
          highest = Math.max(highest, p.feet());

          const { x, z } = p.player.position;

          if (outside(x, z)) {
            escapes.push(
              `run ${run}: out at ${x.toFixed(2)}, ${z.toFixed(2)} (feet ${p.feet().toFixed(2)})`,
            );
            break;
          }
        }
      }
    }

    // They did climb (the table, the racks): the search reached up there.
    expect(highest).toBeGreaterThan(5.5);
    expect(escapes).toEqual([]);
  }, 120000);

  it("the corners at the south wall are closed: no slit to see or squeeze through", () => {
    // The Armory's side walls and the Hall's wall now meet.
    for (const x of [-20.35, -31.85]) {
      for (const z of [11.75, 11.9]) {
        expect(world.isBlocked(x, z, ARMORY.FLOOR, 0.05)).toBe(true);
      }
    }
  });

  it("the bench is stood on at its worktop, not on air at the cabinet's height", () => {
    // Over the bench (x -30.4 to -28.3), falling from well above: it lands on
    // the 0.95 m worktop, not on a block 2 m high.
    expect(world.groundHeight(-29.35, 5.7, ARMORY.FLOOR + 3)).toBeCloseTo(
      ARMORY.FLOOR + 0.95,
      2,
    );
    // The cabinet beside it is a solid block (1.9 m for a body: furniture
    // that high is never taller, so a head is not put into the roof), and the
    // locker the same.
    expect(world.groundHeight(-31.0, 5.7, ARMORY.FLOOR + 3)).toBeCloseTo(
      ARMORY.FLOOR + 1.9,
      2,
    );
    expect(world.groundHeight(-27.5, 5.7, ARMORY.FLOOR + 3)).toBeCloseTo(
      ARMORY.FLOOR + 1.9,
      2,
    );
  });

  it("the bench can be climbed onto from the floor, and its worktop is a real surface", () => {
    const p = spawnPlayer(-29.35, ARMORY.FLOOR, 7.2, 0);

    p.input.keys.add("KeyW");
    p.input.jumpQueued = true;
    p.step(1.6);

    expect(p.feet()).toBeCloseTo(ARMORY.FLOOR + 0.95, 1);
    expect(p.player.isGrounded).toBe(true);
    // On the bench, in front of the pegboard (the wall panel stops it).
    expect(p.player.position.z).toBeGreaterThan(5.3);
    expect(p.player.position.z).toBeLessThan(6.3);
  });

  it("the handgun case locker is open shelves: shots pass its gaps, not its shelves", () => {
    const y = (m: number): number => ARMORY.FLOOR + m;

    // Between two shelves, into the locker as far as its back: clear.
    expect(world.segmentBlocked(-27.9, y(0.45), 8, -27.9, y(0.45), 5.5)).toBe(
      false,
    );
    // Along a shelf (0.18 to 0.26 m): stopped.
    expect(world.segmentBlocked(-27.9, y(0.22), 8, -27.9, y(0.22), 5.5)).toBe(
      true,
    );
    // Right through to the wall behind: stopped by its back.
    expect(world.segmentBlocked(-27.9, y(0.45), 8, -27.9, y(0.45), 5.2)).toBe(
      true,
    );
  });

  it("the gap between the north locker and the first bay is filled, so nobody wedges in it", () => {
    expect(world.isBlocked(-31.4, 6.4, ARMORY.FLOOR, 0.1)).toBe(true);
  });
});

describe("Running into a corner outside the Armory", () => {
  it("settles against it: no jitter from bouncing between the two walls", () => {
    for (const yawOff of [0.25, 0.5]) {
      const p = spawnPlayer(-19.0, ARMORY.FLOOR, 8.4, Math.PI / 2 + yawOff);

      p.input.keys.add("KeyW");
      p.step(1.5);

      const seen: Array<{ x: number; z: number }> = [];

      p.step(0.5, () => seen.push({ ...p.player.position }));

      const xs = seen.map((s) => s.x);
      const zs = seen.map((s) => s.z);

      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.005);
      expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(0.005);
    }
  });
});

describe("Crouching under a half-raised shutter", () => {
  const shutter = {
    kind: "box" as const,
    id: "crouch-shutter",
    role: "wall" as const,
    minX: ARMORY.SHUTTER_X - ARMORY.SHUTTER_THICKNESS / 2,
    maxX: ARMORY.SHUTTER_X + ARMORY.SHUTTER_THICKNESS / 2,
    minZ: ARMORY.SHUTTER_Z0,
    maxZ: ARMORY.SHUTTER_Z1,
    bottom: ARMORY.FLOOR + 1.3,
    height: ARMORY.FLOOR + ARMORY.SHUTTER_HEIGHT,
  };

  it("a crouching body passes where a standing one is stopped", () => {
    world.setSolidActive(fullShutter, false);
    world.addMovable(shutter);

    // Standing: stopped at the shutter's face (1.3 m up is under the 1.8 m head).
    const standing = spawnPlayer(-19.0, ARMORY.FLOOR, 8, Math.PI / 2);

    standing.input.keys.add("KeyW");
    standing.step(2);
    expect(standing.player.position.x).toBeGreaterThan(-20.0);

    // Crouching: ducks through to the room.
    const crouching = spawnPlayer(-19.0, ARMORY.FLOOR, 8, Math.PI / 2);

    crouching.player.isCrouching = true;
    crouching.input.keys.add("KeyW");
    crouching.step(3);
    expect(crouching.player.position.x).toBeLessThan(-21.2);
    expect(crouching.player.mustStayLow).toBe(false);

    world.setSolidActive(shutter, false);
    world.setSolidActive(fullShutter, true);
  });

  it("under it, standing up is not possible: they stay low until clear", () => {
    world.setSolidActive(fullShutter, false);
    world.setSolidActive(shutter, true);

    const p = spawnPlayer(-20.62, ARMORY.FLOOR, 8, Math.PI / 2);

    p.player.isCrouching = true;
    p.step(0.5);
    expect(p.player.mustStayLow).toBe(true);

    world.setSolidActive(shutter, false);
    world.setSolidActive(fullShutter, true);
  });
});

describe("Hauling the chain", () => {
  it("holds the player in place: they can look round but not walk, run or jump", () => {
    const p = spawnPlayer(-19.0, ARMORY.FLOOR, 9.5, Math.PI / 2);

    p.player.movementLocked = true;
    p.input.keys.add("KeyW");
    p.input.keys.add("ShiftLeft");
    p.input.jumpQueued = true;

    const before = { ...p.player.position };

    p.step(1);
    p.input.yaw = 0.4;
    p.step(0.5);

    expect(
      Math.hypot(
        p.player.position.x - before.x,
        p.player.position.z - before.z,
      ),
    ).toBeLessThan(0.01);
    expect(p.feet()).toBeCloseTo(ARMORY.FLOOR, 2);

    // Let go of the chain: they walk again.
    p.player.movementLocked = false;
    p.step(1);
    expect(
      Math.hypot(
        p.player.position.x - before.x,
        p.player.position.z - before.z,
      ),
    ).toBeGreaterThan(1);
  });
});
