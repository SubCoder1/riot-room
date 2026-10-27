import { describe, expect, it } from "vitest";

import { buildLightRegions } from "../../src/world/LightRegions";
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
});
