import type * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  TUBE_FIXTURES,
  TUBE_LENGTH,
  TUBE_LIGHTS,
  createTubeGlow,
} from "../../src/world/ArmoryLighting";
import { ARMORY } from "../../src/world/ArmoryMechanisms";
import type { LightDefinition } from "../../src/world/ArenaLayout";
import { FLICKERING, nightLights } from "../../src/world/NightLights";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";

/** The room: x -31.7 to -20.5, z 5.3 to 12, floor 4, the beams' undersides 5.9 m up. */
const ROOM = { minX: -31.7, maxX: -20.5, minZ: 5.3, maxZ: 12 };
const BEAM_BOTTOM = ARMORY.FLOOR + 5.9;

describe("The Armory's tube lighting", () => {
  const lamps = ARENA_LAYOUT.lights.filter((l) =>
    l.id.startsWith("tube-armory-"),
  );

  it("is four long fixtures with four lamps, one lamp to a fixture", () => {
    expect(TUBE_FIXTURES).toHaveLength(4);
    expect(lamps).toHaveLength(4);
    expect(TUBE_LIGHTS).toHaveLength(4);
    // Long ones: the tubes run most of the room's width.
    expect(TUBE_LENGTH).toBeGreaterThanOrEqual(2.5);

    // And bright, each: no weak ones among them.
    for (const lamp of lamps) {
      expect(lamp.intensity).toBeGreaterThanOrEqual(180);
      expect(lamp.intensity).toBeLessThan(450);
    }
  });

  it("every lamp is inside the room, up under the beams, and aimed at the room's floor or racks", () => {
    for (const lamp of lamps) {
      expect(lamp.x).toBeGreaterThan(ROOM.minX);
      expect(lamp.x).toBeLessThan(ROOM.maxX);
      expect(lamp.z).toBeGreaterThan(ROOM.minZ);
      expect(lamp.z).toBeLessThan(ROOM.maxZ);
      expect(lamp.y).toBeGreaterThan(ARMORY.FLOOR + 4.5);
      expect(lamp.y).toBeLessThan(BEAM_BOTTOM);

      expect(lamp.target).toBeDefined();
      expect(lamp.target!.x).toBeGreaterThan(ROOM.minX - 0.5);
      expect(lamp.target!.x).toBeLessThan(ROOM.maxX);
      expect(lamp.target!.z).toBeGreaterThan(ROOM.minZ);
      expect(lamp.target!.z).toBeLessThan(ROOM.maxZ);
    }
  });

  it("the cones are narrow, so the light stays in the room and does not wash its neighbours", () => {
    for (const lamp of lamps) {
      const reach = (lamp.y - lamp.target!.y) * Math.tan(lamp.angle ?? 0.8);

      // Where the cone meets the floor: not far past a wall of the room.
      expect(reach).toBeLessThan(4.5);
      // And it is no floodlight: nothing like the halogens' strength.
      expect(lamp.intensity).toBeLessThan(450);
    }
  });

  it("is a cool neutral white, never pure white", () => {
    for (const lamp of lamps) {
      const r = (lamp.color >> 16) & 255;
      const g = (lamp.color >> 8) & 255;
      const b = lamp.color & 255;

      expect(Math.min(r, g, b)).toBeLessThan(255);
      // A little cooler than neutral: blue at least as strong as red.
      expect(b).toBeGreaterThanOrEqual(r);
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(60);
    }
  });

  it("the fixtures hang under the beams, clear of the duct and the cable tray", () => {
    for (const fixture of TUBE_FIXTURES) {
      const half = (TUBE_LENGTH + 0.2) / 2;

      expect(fixture.x).toBeGreaterThan(ROOM.minX);
      expect(fixture.x).toBeLessThan(ROOM.maxX);
      // Along z: beyond the duct (z 5.55 to 6.35) and short of the tray (11.34).
      expect(fixture.z - half).toBeGreaterThan(6.35);
      expect(fixture.z + half).toBeLessThan(11.34);
    }
  });

  it("only the one loose tube flickers", () => {
    const flickering = [...FLICKERING].filter((id) =>
      id.startsWith("tube-armory-"),
    );

    expect(flickering).toEqual(["tube-armory-3"]);
    expect(lamps.some((l) => l.id === "tube-armory-3")).toBe(true);
  });

  it("the lamps are on tonight, and the night plan keeps them in the room", () => {
    const tonight = nightLights(ARENA_LAYOUT).filter((l) =>
      l.id.startsWith("tube-armory-"),
    );

    expect(tonight).toHaveLength(lamps.length);

    for (const lamp of tonight as LightDefinition[]) {
      // Reaching the floor and the far corners, but cut short of the next room.
      expect(lamp.distance).toBeGreaterThan(7);
      expect(lamp.distance).toBeLessThan(14);
    }
  });

  it("the halogen that lit the room is gone", () => {
    expect(ARENA_LAYOUT.lights.some((l) => l.id === "light-room-armory")).toBe(
      false,
    );
    // Nothing else in the room but the tubes: the only lamps inside its walls.
    const inside = ARENA_LAYOUT.lights.filter(
      (l) =>
        l.x > ROOM.minX &&
        l.x < ROOM.maxX &&
        l.z > ROOM.minZ &&
        l.z < ROOM.maxZ &&
        l.y > ARMORY.FLOOR &&
        l.y < ARMORY.FLOOR + 6.5,
    );

    expect(inside.map((l) => l.id).sort()).toEqual(
      lamps.map((l) => l.id).sort(),
    );
  });

  it("carries no cables, conduit or strips: the lamps are the whole setup", () => {
    const glow = createTubeGlow();
    const names: string[] = [];

    glow.group.traverse((o) => names.push(o.name));

    expect(names.some((n) => /lead|cable|clamp|strip/.test(n))).toBe(false);
  });

  it("the tubes glow, and one can dip with its lamp", () => {
    const glow = createTubeGlow();
    const mesh = glow.group.getObjectByName(
      "armory-tubes",
    ) as THREE.InstancedMesh;
    const reflectors = glow.group.getObjectByName(
      "armory-tube-reflectors",
    ) as THREE.InstancedMesh;

    // Two tubes in each fixture.
    const expected = TUBE_FIXTURES.length * 2;

    expect(mesh.count).toBe(expected);

    const before = Array.from(mesh.instanceColor!.array);

    glow.setLevel("tube-armory-3", 0.2);

    const after = Array.from(mesh.instanceColor!.array);
    const changed = after.filter((v, i) => v !== before[i]).length;

    // Two tubes (three channels each) dimmed, and only those.
    expect(changed).toBe(6);
    // Its channel's reflector dims with it: one instance, one colour.
    expect(reflectors.count).toBe(TUBE_FIXTURES.length);
    glow.dispose();
  });
});
