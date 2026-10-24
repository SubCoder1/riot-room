import { describe, expect, it } from "vitest";

import { UPPER_FLOOR_Y as F } from "../../src/world/ArenaLayout";
import { ARENA_LAYOUT as layout } from "../../src/world/UpperFloorMap";
import { distanceAtHeight, pathTo, walkField, world } from "./nav";
import { spawnPlayer, yawFor } from "./playerHarness";

const room = layout.rooms.find((r) => r.id === "room-archive")!;
const power = layout.rooms.find((r) => r.id === "room-switch")!;
const solid = (id: string) => layout.walls.find((w) => w.id === id)!;

describe("Industrial Junk Room: its entrances", () => {
  it("is named, and keeps its front door and the one doorway to the Generator Room", () => {
    expect(room.name).toBe("Industrial Junk Room");
    expect(room.doors.map((d) => d.side).sort()).toEqual(["e", "s", "w"]);
    expect(room.doors.find((d) => d.side === "e")!.at).toBeCloseTo(-20);
  });

  it("the Generator Room keeps its front door only (its alley door is a wall)", () => {
    expect(power.doors.map((d) => d.side)).toEqual(["s"]);
  });

  it("the closed openings are solid wall (not a panel): nobody walks or shoots through", () => {
    // The Junk Room's west wall at its old door; the Generator Room's east wall at its old door.
    expect(world.isBlocked(-13.85, -21, F, 0.3)).toBe(true);
    expect(world.isBlocked(7.15, -20.5, F, 0.3)).toBe(true);
    expect(
      world.segmentClearFraction(-12, F + 1, -21, -16, F + 1, -21),
    ).toBeLessThan(1);
  });

  it("neither room is a dead end: both doors lead on, and the two rooms are joined", () => {
    const field = walkField(-8, -15, F, { ladders: false });
    const inJunk = distanceAtHeight(field, -8, -19, F);
    const inPower = distanceAtHeight(field, 3, -20, F);

    expect(inJunk).toBeLessThan(Infinity);
    expect(inPower).toBeLessThan(Infinity);

    // From the Junk Room's east door through to the Generator Room, in the room.
    const through = pathTo(field, 3, -20);

    expect(through.length).toBeGreaterThan(0);
    expect(through.some((p) => p.x > -1 && p.x < 0)).toBe(true);
  });
});

describe("Industrial Junk Room: the layout", () => {
  it("has one fallen rack and one standing rack, both solid, and no other racks", () => {
    expect(solid("rack-junk-standing")).toBeDefined();
    expect(solid("rack-junk-fallen")).toBeDefined();
    expect(
      layout.walls
        .filter(
          (w) =>
            /^(shelf|rack)-/.test(w.id) &&
            w.minX < -1.3 &&
            w.maxX > -13.7 &&
            w.maxZ < -16 &&
            w.minZ > -24,
        )
        .map((w) => w.id.replace(/\+\d+$/, ""))
        .filter((id, i, all) => all.indexOf(id) === i)
        .sort(),
    ).toEqual(["rack-junk-fallen", "rack-junk-standing"]);

    const standing = solid("rack-junk-standing");
    const fallen = solid("rack-junk-fallen");

    // Tall, and against the north wall; the other low, against the west wall.
    expect(standing.height - F).toBeGreaterThan(2.2);
    expect(standing.minZ).toBeCloseTo(-23.7);
    expect(fallen.height - F).toBeLessThan(1.2);
    expect(fallen.minX).toBeCloseTo(-13.7);

    for (const s of [standing, fallen]) {
      const x = (s.minX + s.maxX) / 2;
      const z = (s.minZ + s.maxZ) / 2;

      expect(world.isBlocked(x, z, F, 0.3), s.id).toBe(true);
    }
  });

  it("the west wall has a hole only a crouching body fits through", () => {
    const z = -17.1;

    expect(world.isBlocked(-13.85, z, F, 0.3)).toBe(true);
    expect(world.isBlocked(-13.85, z, F, 0.3, 1.1)).toBe(false);
    // Solid wall either side of it.
    expect(world.isBlocked(-13.85, -18.6, F, 0.3, 1.1)).toBe(true);
  });

  it("the big pile is in the north-west (back) corner, and solid", () => {
    const parts = layout.walls.filter((w) => w.id.startsWith("junk-pile"));

    expect(parts).toHaveLength(3);

    for (const part of parts) {
      expect(part.maxX).toBeLessThan(-9.8);
    }

    expect(Math.min(...parts.map((p) => p.minX))).toBeCloseTo(-13.7);

    expect(Math.min(...parts.map((p) => p.minZ))).toBeCloseTo(-23.7);
    expect(world.isBlocked(-13, -23, F, 0.3)).toBe(true);
  });

  it("has three drums, solid, none in the middle", () => {
    const drums = layout.walls.filter((w) => /^drums?-junk/.test(w.id));

    expect(drums).toHaveLength(3);

    for (const d of drums) {
      const x = (d.minX + d.maxX) / 2;
      const z = (d.minZ + d.maxZ) / 2;

      expect(world.isBlocked(x, z, F, 0.1), d.id).toBe(true);
      // Against the north wall.
      // Against the north wall (the box is fitted to the drum's own size).
      expect(d.minZ, d.id).toBeLessThan(-23.4);
    }
  });

  it("the middle stays clear: a straight lane from the south door to the east door", () => {
    const field = walkField(-8, -16.6, F, { ladders: false });
    const path = pathTo(field, -2, -20);

    expect(path.length).toBeGreaterThan(0);

    // Short, and not forced round the clutter: close to a straight line.
    let length = 0;

    for (let i = 1; i < path.length; i++) {
      length += Math.hypot(
        path[i].x - path[i - 1].x,
        path[i].z - path[i - 1].z,
      );
    }

    expect(length).toBeLessThan(Math.hypot(6, 3.4) * 1.35);
    // Nothing solid across the middle of the room.
    for (const [x, z] of [
      [-9, -19],
      [-8, -20],
      [-7, -18],
      [-6, -20],
      [-5, -19],
    ]) {
      expect(world.isBlocked(x, z, F, 0.4), `${x},${z}`).toBe(false);
    }
  });

  it("the pile is a solid mound: too high to vault or jump onto, so nobody stands on it", () => {
    for (const w of layout.walls.filter((s) => s.id.startsWith("junk-pile"))) {
      expect(w.height - F, w.id).toBeGreaterThan(1.45);
    }

    // Walking and jumping into it from the middle never gets a body onto it.
    const p = spawnPlayer(-9.0, F, -21.0, yawFor(-3.5, -1.5));

    let highestStanding = 0;

    p.input.keys.add("KeyW");
    p.step(6, () => {
      p.input.jumpQueued = true;

      if (p.player.isGrounded) {
        highestStanding = Math.max(highestStanding, p.feet() - F);
      }
    });
    expect(highestStanding).toBeLessThan(0.2);
  });
});
