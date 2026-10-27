import { describe, expect, it } from "vitest";

import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";

describe("The dynamite pickup", () => {
  const armory = ARENA_LAYOUT.rooms.find((r) => r.id === "room-armory");
  const dynamite = ARENA_LAYOUT.pickups.filter((p) => p.type === "DYNAMITE");

  it("is one bundle, inside the Armory, within reach of the floor it lies on", () => {
    expect(armory).toBeDefined();
    expect(dynamite).toHaveLength(1);

    const [item] = dynamite;

    expect(item.id.startsWith("armory-")).toBe(true);
    expect(item.x).toBeGreaterThan(armory!.minX);
    expect(item.x).toBeLessThan(armory!.maxX);
    expect(item.z).toBeGreaterThan(armory!.minZ);
    expect(item.z).toBeLessThan(armory!.maxZ);
    // On the maintenance table (0.91 m above the Armory's floor).
    expect(item.y).toBeCloseTo(armory!.floorY + 0.91, 2);
  });

  it("does not come back during a round, and leaves the throwable pickups alone", () => {
    expect(dynamite[0].respawn).toBeGreaterThan(1e6);

    const throwables = ARENA_LAYOUT.pickups.filter(
      (p) => p.type !== "DYNAMITE",
    );

    expect(throwables.length).toBeGreaterThan(0);
    expect(
      throwables.every((p) => ["GRENADE", "SMOKE", "MOLOTOV"].includes(p.type)),
    ).toBe(true);
  });
});
