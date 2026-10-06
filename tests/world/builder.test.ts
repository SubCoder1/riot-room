import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { buildArena, createRamp } from "../../src/world/ArenaBuilder";
import { ARENA_LAYOUT } from "../../src/world/ArenaLayout";

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];

  root.traverse((child) => {
    if (child instanceof THREE.Mesh) found.push(child);
  });

  return found;
}

describe("Arena meshes", () => {
  const arena = buildArena(ARENA_LAYOUT);
  const all = meshes(arena);

  it("builds every piece of the layout", () => {
    // floor + 4 walls + platforms + ramps + steps + cover + pillars
    const steps = ARENA_LAYOUT.stairs.reduce((n, s) => n + s.steps, 0);
    const expected =
      1 +
      4 +
      ARENA_LAYOUT.platforms.length +
      ARENA_LAYOUT.ramps.length +
      steps +
      ARENA_LAYOUT.covers.length +
      ARENA_LAYOUT.pillars.length;

    expect(all).toHaveLength(expected);
  });

  it("is lightweight: meshes share geometries and materials", () => {
    const geometries = new Set(all.map((m) => m.geometry));
    const materials = new Set(all.map((m) => m.material));

    // Two shared unit shapes plus one wedge per ramp.
    expect(geometries.size).toBe(2 + ARENA_LAYOUT.ramps.length);
    expect(materials.size).toBeLessThanOrEqual(7);
  });

  it("outer walls are 4 m high and enclose the 40 m floor", () => {
    arena.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(arena);

    expect(box.max.y).toBeCloseTo(4);
    expect(box.max.x).toBeGreaterThan(20);
    expect(box.min.x).toBeLessThan(-20);
  });

  it.each(ARENA_LAYOUT.ramps.map((r) => [r.id, r] as const))(
    "%s mesh matches its collision: slopes from the floor up to its height",
    (_id, ramp) => {
      const mesh = createRamp(ramp);
      const box = new THREE.Box3().setFromObject(mesh);

      expect(box.min.y).toBeCloseTo(0);
      expect(box.max.y).toBeCloseTo(ramp.height);
      expect(box.min.x).toBeCloseTo(ramp.minX);
      expect(box.max.x).toBeCloseTo(ramp.maxX);
      expect(box.min.z).toBeCloseTo(ramp.minZ);
      expect(box.max.z).toBeCloseTo(ramp.maxZ);
    },
  );

  it("ramp tops slope the same way the collision says (high end is where it should be)", () => {
    for (const ramp of ARENA_LAYOUT.ramps) {
      const position = createRamp(ramp).geometry.getAttribute("position");
      const alongX = ramp.direction.endsWith("x");
      const rising = ramp.direction.startsWith("+");
      const highEdge = alongX
        ? rising
          ? ramp.maxX
          : ramp.minX
        : rising
          ? ramp.maxZ
          : ramp.minZ;

      for (let i = 0; i < position.count; i++) {
        if (position.getY(i) > ramp.height - 1e-6) {
          const along = alongX ? position.getX(i) : position.getZ(i);

          expect(along).toBeCloseTo(highEdge);
        }
      }
    }
  });

  it("ramp top faces point upward", () => {
    for (const ramp of ARENA_LAYOUT.ramps) {
      const normals = createRamp(ramp).geometry.getAttribute("normal");

      // The first six vertices are the sloped top (two triangles).
      for (let i = 0; i < 6; i++) {
        expect(normals.getY(i)).toBeGreaterThan(0.5);
      }
    }
  });
});
