import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { FireZoneView } from "../../src/vfx/FireZoneView";
import { SMOKE_CONFIG } from "../../src/combat/SmokeConfig";
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

  it("the smoke view builds every cloud it can need ahead of time, hidden", () => {
    const view = new SmokeCloudView(new SmokeSystem());
    const parts = view.group.children.filter((c) => c.name === "smoke-slot");
    const sprites = parts.filter((c) => c instanceof THREE.Sprite);

    // A cloud is its puffs, a flash and its bodies, for each cloud there can be.
    expect(parts.length).toBe(SMOKE_CONFIG.SMOKE_MAX_CLOUDS * 8);
    // ...and each cloud's puffs are one draw, not one per puff.
    expect(
      parts.filter(
        (c) =>
          c instanceof THREE.Mesh &&
          c.geometry instanceof THREE.InstancedBufferGeometry,
      ),
    ).toHaveLength(SMOKE_CONFIG.SMOKE_MAX_CLOUDS);
    expect(parts.every((c) => !c.visible)).toBe(true);
    // An additive flash, as a cloud's is (the puffs blend normally).
    const blends = sprites.map(
      (c) => (c as THREE.Sprite).material.blending as THREE.Blending,
    );

    expect(blends).toContain(THREE.AdditiveBlending);
    view.dispose();
  });
});
