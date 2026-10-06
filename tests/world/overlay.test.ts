import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { OVERLAY_LAYER } from "../../src/rendering/Renderer";

describe("First-person arms overlay layer", () => {
  const camera = new THREE.PerspectiveCamera();

  it("an object enabled on the overlay layer still draws in the normal pass", () => {
    const arm = new THREE.Object3D();

    arm.layers.enable(OVERLAY_LAYER);
    camera.layers.enableAll();

    expect(arm.layers.test(camera.layers)).toBe(true);
  });

  it("the overlay pass (camera on the overlay layer only) draws the arms but not the scenery", () => {
    const arm = new THREE.Object3D();
    const wall = new THREE.Object3D();

    arm.layers.enable(OVERLAY_LAYER);
    camera.layers.set(OVERLAY_LAYER);

    expect(arm.layers.test(camera.layers)).toBe(true);
    expect(wall.layers.test(camera.layers)).toBe(false);
  });
});
