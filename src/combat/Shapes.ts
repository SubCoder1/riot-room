import * as THREE from "three";

/**
 * Collision shape used for both hurtboxes and attack hitboxes.
 *
 * Everything is a capsule (a segment with a radius). A sphere is simply a
 * capsule whose start and end are the same point, so there is only one overlap
 * test to maintain.
 */
export interface CapsuleShape {
  start: THREE.Vector3;
  end: THREE.Vector3;
  radius: number;
}

export function createCapsule(): CapsuleShape {
  return {
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    radius: 0.1,
  };
}

const d1 = new THREE.Vector3();
const d2 = new THREE.Vector3();
const r = new THREE.Vector3();

/** Squared distance between the closest points of two segments. */
function segmentDistanceSquared(
  p1: THREE.Vector3,
  q1: THREE.Vector3,
  p2: THREE.Vector3,
  q2: THREE.Vector3,
): number {
  d1.subVectors(q1, p1);
  d2.subVectors(q2, p2);
  r.subVectors(p1, p2);

  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  const epsilon = 1e-8;

  let s: number;
  let t: number;

  if (a <= epsilon && e <= epsilon) {
    return r.lengthSq();
  }

  if (a <= epsilon) {
    s = 0;
    t = THREE.MathUtils.clamp(f / e, 0, 1);
  } else {
    const c = d1.dot(r);

    if (e <= epsilon) {
      t = 0;
      s = THREE.MathUtils.clamp(-c / a, 0, 1);
    } else {
      const b = d1.dot(d2);
      const denominator = a * e - b * b;

      s =
        denominator > epsilon
          ? THREE.MathUtils.clamp((b * f - c * e) / denominator, 0, 1)
          : 0;

      t = (b * s + f) / e;

      if (t < 0) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
      }
    }
  }

  const c1x = p1.x + d1.x * s;
  const c1y = p1.y + d1.y * s;
  const c1z = p1.z + d1.z * s;
  const c2x = p2.x + d2.x * t;
  const c2y = p2.y + d2.y * t;
  const c2z = p2.z + d2.z * t;

  return (
    (c1x - c2x) * (c1x - c2x) +
    (c1y - c2y) * (c1y - c2y) +
    (c1z - c2z) * (c1z - c2z)
  );
}

export function capsulesOverlap(a: CapsuleShape, b: CapsuleShape): boolean {
  return capsuleContactScore(a, b) <= 1;
}

/**
 * How deeply two capsules touch: 0 = axes cross, 1 = just touching, above 1 =
 * apart. Lets the caller pick the body part that was hit most squarely when a
 * big hitbox overlaps several at once.
 */
export function capsuleContactScore(a: CapsuleShape, b: CapsuleShape): number {
  const reach = a.radius + b.radius;

  return segmentDistanceSquared(a.start, a.end, b.start, b.end) / (reach * reach);
}
