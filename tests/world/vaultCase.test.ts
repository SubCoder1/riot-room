import { describe, expect, it } from "vitest";

import { ArenaCollision } from "../../src/world/ArenaCollision";
import { EXTRACTION_POINT } from "../../src/world/VaultCase";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";

describe("The target component and the extraction point", () => {
  const items = ARENA_LAYOUT.pickups.filter((p) => p.type === "COMPONENT");

  it("is one sealed case on a table inside The Ruins (the Server room)", () => {
    const vault = ARENA_LAYOUT.rooms.find((r) => r.id === "room-server")!;

    expect(items).toHaveLength(1);

    const [item] = items;

    expect(item.id.startsWith("vault-")).toBe(true);
    expect(item.x).toBeGreaterThan(vault.minX + 1);
    expect(item.x).toBeLessThan(vault.maxX);
    expect(item.z).toBeGreaterThan(vault.minZ);
    expect(item.z).toBeLessThan(vault.maxZ);
    // On the table (0.84 m above the vault's floor), once only.
    expect(item.y).toBeCloseTo(vault.floorY + 0.84, 2);
    expect(item.respawn).toBeGreaterThan(1e6);
  });

  it("is not a throwable: no Armory pickup is a mission item any more", () => {
    expect(
      ARENA_LAYOUT.pickups
        .filter((p) => p.id.startsWith("armory-"))
        .every((p) => ["GRENADE", "SMOKE", "MOLOTOV"].includes(p.type)),
    ).toBe(true);
  });

  it("puts the extraction point on open floor in the north-west yard, away from the vault", () => {
    const world = new ArenaCollision(ARENA_LAYOUT);
    const yard = ARENA_LAYOUT.rooms.find((r) => r.id === "room-spawn-nw")!;

    expect(EXTRACTION_POINT.x).toBeGreaterThan(yard.minX);
    expect(EXTRACTION_POINT.x).toBeLessThan(yard.maxX);
    expect(EXTRACTION_POINT.z).toBeGreaterThan(yard.minZ);
    expect(EXTRACTION_POINT.z).toBeLessThan(yard.maxZ);
    expect(
      world.isBlocked(
        EXTRACTION_POINT.x,
        EXTRACTION_POINT.z,
        EXTRACTION_POINT.y,
        0.4,
      ),
    ).toBe(false);
  });
});

describe("The Ruins' walkway floor", () => {
  it("is drawn in the same floor look as the wing it joins, slice after slice (no seam of two textures)", async () => {
    const { ARENA_LAYOUT: layout } =
      await import("../../src/world/UpperFloorMap");
    const { IndustrialMaterialLibrary } =
      await import("../../src/world/materials/IndustrialMaterialLibrary");
    const library = new IndustrialMaterialLibrary();
    const slices = layout.platforms.filter((p) => p.id.includes("ruins-deck"));
    const looks = new Set(
      slices.map((p) => library.floorVariantFor(p.id.split("~")[0])),
    );

    expect(slices.length).toBeGreaterThan(5);
    expect(looks.size).toBe(1);
    expect([...looks][0]).toBe(library.floorVariantFor("east-wing"));
  });
});
