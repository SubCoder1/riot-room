import { describe, expect, it } from "vitest";

import { ArenaCollision } from "../../src/world/ArenaCollision";
import { ARENA_HALF_X } from "../../src/world/ArenaLayout";
import { ARMORY_VENT_HATCHES } from "../../src/world/ArmoryVent";

const world = new ArenaCollision();

describe("Where a broken Molotov burns", () => {
  it("never on the top of a wall: it falls to the floor beside it", () => {
    // The Junk Room's west wall (x -14..-13.7) at 7.8 m: the floor is at 4.
    const onTop = world.groundHeight(-13.85, -20, 7.8);

    expect(onTop).toBeGreaterThan(4); // (the wall's top would hold it)
    expect(world.floorBelow(-13.85, -20, 7.8).y).toBeCloseTo(4);
    expect(ARENA_HALF_X).toBeGreaterThan(0);
  });

  it("on a vent grating it finds the grating, and the floor below it", () => {
    const { id, area } = ARMORY_VENT_HATCHES[0];
    const x = (area.minX + area.maxX) / 2;
    const z = (area.minZ + area.maxZ) / 2;
    const top = world.floorBelow(x, z, 10.7);

    expect(
      top.id.startsWith("hatch-armory-vent") ||
        top.id.startsWith("vent-grating"),
    ).toBe(true);
    expect(world.floorBelow(x, z, top.y - 0.2, (i) => i === id).y).toBeCloseTo(
      4,
    );
  });
});
