import { describe, expect, it } from "vitest";

import {
  OUTDOORS_DECAY,
  buildLightRegions,
  dynamicDecayAt,
} from "../../src/world/LightRegions";
import { nightLights } from "../../src/world/NightLights";
import { ARENA_LAYOUT as layout } from "../../src/world/UpperFloorMap";

const lights = nightLights(layout);
const regions = buildLightRegions(layout, lights);

describe("Room-aware lighting", () => {
  it("gives every lamp without a shadow a region, and none of the others one", () => {
    for (const light of lights) {
      const has = regions.decays.has(light.id);

      if (light.castShadow === true) {
        expect(has, light.id).toBe(false);
      }
    }

    expect(regions.decays.has("tube-armory-1")).toBe(true);
    expect(regions.decays.has("light-site-scaffold")).toBe(true);
  });

  it("leaves the lamps that shine through a glass cover alone", () => {
    expect(regions.decays.has("halogen-wall-storage")).toBe(false);
    expect(regions.decays.has("halogen-roof-east")).toBe(false);
  });

  it("tags each lamp with its room (or outdoors) by a decay close to the usual 2", () => {
    for (const v of regions.decays.values()) {
      expect(v).toBeGreaterThan(2);
      expect(v).toBeLessThan(2.03);
    }

    // The Armory's tubes share a room; the scaffold lamp is outdoors.
    expect(regions.decays.get("tube-armory-1")).toBe(
      regions.decays.get("tube-armory-2"),
    );
    expect(regions.decays.get("tube-armory-1")).not.toBe(
      regions.decays.get("light-site-scaffold"),
    );
  });

  it("writes shader text that asks the question", () => {
    expect(regions.glsl).toContain("float lrAllow");
    expect(regions.glsl).toContain("lrLocate");
  });

  it("does not let 'no door here' count as an outdoor lamp's room", () => {
    // An outdoor lamp (room -1) must not match a pixel whose door number is
    // also -1, or it would light every interior away from the doors.
    expect(regions.glsl).toContain("room >= 0 && atDoor == room");
    expect(regions.glsl).not.toMatch(/\|\| atDoor == room/);
  });

  it("counts a room's own walls' inner faces, and the floor along them, as inside it (so no outdoor lamp lights them)", () => {
    const outdoors = (x: number, y: number, z: number): boolean =>
      dynamicDecayAt(x, y, z) === OUTDOORS_DECAY;

    for (const room of layout.rooms) {
      const walls = layout.walls.filter((w) =>
        w.id.startsWith(`${room.id}-wall-`),
      );

      for (const w of walls) {
        const thin = Math.min(w.maxX - w.minX, w.maxZ - w.minZ);
        const alongX = w.maxX - w.minX > w.maxZ - w.minZ;
        const a0 = alongX ? w.minX : w.minZ;
        const a1 = alongX ? w.maxX : w.maxZ;

        // Only the room's four straight walls, a plain wall's thickness.
        if (thin > 0.35) {
          continue;
        }

        for (let a = a0 + 0.3; a < a1 - 0.3; a += 0.5) {
          for (const side of [-1, 1]) {
            // The face looking into the room (the centre is on the room's bounds).
            const mid = alongX ? (w.minZ + w.maxZ) / 2 : (w.minX + w.maxX) / 2;
            const inward = alongX
              ? mid < (room.minZ + room.maxZ) / 2
                ? 1
                : -1
              : mid < (room.minX + room.maxX) / 2
                ? 1
                : -1;

            if (side !== inward) {
              continue;
            }

            const face = mid + inward * (thin / 2 + 0.002);
            // A pixel on the face, and one on the floor a hand's width from it.
            for (const [off, y] of [
              [0, room.floorY + 1],
              [0.1, room.floorY + 0.01],
            ] as const) {
              const d = face + inward * off;
              const x = alongX ? a : d;
              const z = alongX ? d : a;

              if (
                x < room.minX + 0.3 ||
                x > room.maxX - 0.3 ||
                z < room.minZ + 0.3 ||
                z > room.maxZ - 0.3
              ) {
                continue;
              }

              expect(
                outdoors(x, y, z),
                `${w.id} at ${x.toFixed(2)},${z.toFixed(2)}`,
              ).toBe(false);
            }
          }
        }
      }
    }
  });
});
