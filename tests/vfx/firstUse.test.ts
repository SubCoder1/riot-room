import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { FireZoneView } from "../../src/vfx/FireZoneView";
import { SmokeCloudView } from "../../src/vfx/SmokeCloudView";
import { SmokeSystem } from "../../src/combat/Smoke";

/**
 * Things first drawn mid-game must already be in the scene (hidden), with
 * the same shader variant they will use, so the first use compiles nothing.
 */
describe("First use does not stall the frame", () => {
  it("the fire's flame meshes have their colour buffer from the start", () => {
    const view = new FireZoneView();
    const meshes: THREE.InstancedMesh[] = [];

    view.group.traverse((object) => {
      if ((object as THREE.InstancedMesh).isInstancedMesh) {
        meshes.push(object as THREE.InstancedMesh);
      }
    });

    // Flames and cores of every pooled fire carry per-tongue colour.
    const coloured = meshes.filter((m) => m.instanceColor !== null);

    expect(coloured.length).toBeGreaterThanOrEqual(2);
    expect(coloured.length).toBe(Math.floor((meshes.length * 2) / 3));
  });

  it("the smoke view keeps one hidden sprite of each kind a cloud uses", () => {
    const view = new SmokeCloudView(new SmokeSystem());
    const warm = view.group.children.filter((c) => c.name === "smoke-warm");

    expect(warm).toHaveLength(2);
    expect(warm.every((c) => !c.visible)).toBe(true);
    // One normal, one additive, as a cloud's puffs and its flash are.
    const blends = warm.map(
      (c) => (c as THREE.Sprite).material.blending as THREE.Blending,
    );

    expect(blends).toContain(THREE.AdditiveBlending);
    expect(blends).toContain(THREE.NormalBlending);
  });
});
