import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { PROFILES } from "../../src/combat/Projectiles";
import {
  traceThrowPath,
  type ThrowWorld,
} from "../../src/combat/ThrowableFlight";
import { ThrowAimPreview } from "../../src/vfx/ThrowAimPreview";

const OPEN: ThrowWorld = { clearFraction: () => 1, surfaceY: () => 0 };

function camera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(75, 1.6, 0.05, 500);

  cam.position.set(0, 1.6, 0);
  cam.updateMatrixWorld(true);

  return cam;
}

describe("ThrowAimPreview", () => {
  it("draws a dashed arc and nothing else (no landing marker)", () => {
    const preview = new ThrowAimPreview();
    const origin = new THREE.Vector3(0.3, 1.5, -0.4);
    const direction = new THREE.Vector3(0, 0.3, -1).normalize();

    traceThrowPath(origin, direction, OPEN, preview.path, 1, PROFILES.grenade);
    preview.show(camera());

    expect(preview.isVisible).toBe(true);
    expect(preview.group.children).toHaveLength(1);

    const drawn = preview.group.children[0] as THREE.Mesh;
    const dashes = drawn.geometry.drawRange.count / 6;

    expect(dashes).toBeGreaterThan(5);
    expect(dashes).toBeLessThan(480);
  });

  it("never stalls on a path that starts at the camera", () => {
    const preview = new ThrowAimPreview();
    const cam = camera();

    traceThrowPath(
      cam.position.clone(),
      new THREE.Vector3(0, 0, -1),
      OPEN,
      preview.path,
      1,
      PROFILES.grenade,
    );
    preview.show(cam);
    preview.hide();

    expect(preview.isVisible).toBe(false);
  });
});
