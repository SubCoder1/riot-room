import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  segmentCapsuleEntry,
  type CapsuleShape,
} from "../../src/combat/Shapes";

const v = (x: number, y: number, z: number): THREE.Vector3 =>
  new THREE.Vector3(x, y, z);

// A torso: vertical capsule 0.24 m radius, from y 1.0 to 1.4, at the origin.
const torso: CapsuleShape = {
  start: v(0, 1.0, 0),
  end: v(0, 1.4, 0),
  radius: 0.24,
};

describe("segmentCapsuleEntry (where a fist meets a body)", () => {
  it("is null when the line misses the body", () => {
    expect(segmentCapsuleEntry(v(1, 1.2, -1), v(1, 1.2, 1), torso)).toBeNull();
    expect(segmentCapsuleEntry(v(0, 2.0, -1), v(0, 2.0, 1), torso)).toBeNull();
  });

  it("stops at the body's surface when the line runs into it", () => {
    // From 1 m in front, straight at the torso centre, 2 m long.
    const t = segmentCapsuleEntry(v(0, 1.2, -1), v(0, 1.2, 1), torso)!;
    const hitZ = -1 + t * 2;

    expect(t).toBeGreaterThan(0);
    expect(hitZ).toBeLessThanOrEqual(-0.24 + 1e-6);
    expect(hitZ).toBeGreaterThan(-0.3);
  });

  it("is 0 when the line starts inside the body", () => {
    expect(segmentCapsuleEntry(v(0, 1.2, 0), v(0, 1.2, 1), torso)).toBe(0);
  });

  it("catches the rounded ends of the capsule", () => {
    // Coming from above onto the top cap.
    const t = segmentCapsuleEntry(v(0, 2, 0), v(0, 1, 0), torso)!;

    expect(2 - t * 1).toBeGreaterThanOrEqual(1.4 + 0.24 - 0.05);
  });

  it("handles a sphere (start = end)", () => {
    const sphere: CapsuleShape = {
      start: v(0, 1, 0),
      end: v(0, 1, 0),
      radius: 0.2,
    };

    expect(segmentCapsuleEntry(v(0, 1, -1), v(0, 1, 1), sphere)).not.toBeNull();
    expect(segmentCapsuleEntry(v(0.5, 1, -1), v(0.5, 1, 1), sphere)).toBeNull();
  });
});
