import * as THREE from "three";

import { createRockPath, type RockPath } from "../combat/RockFlight";

const MAX_POINTS = 400;
const MAX_DASHES = 160;
/** Dash and gap lengths along the flight, metres. */
const DASH = 0.5;
const GAP = 0.28;
/** Half the line's width, as a fraction of the distance (a constant look on screen). */
const HALF_WIDTH = 0.0024;
const RING_SCREEN_SIZE = 0.022;
/** Nothing is drawn closer to the camera than this. */
const NEAR = 0.12;

const point = new THREE.Vector3();
const nextPoint = new THREE.Vector3();
const sideways = new THREE.Vector3();
const toCamera = new THREE.Vector3();
const direction = new THREE.Vector3();
const a = new THREE.Vector3();
const b = new THREE.Vector3();

/**
 * The aim indicator: a sharp dashed line along the flight path and a ring where
 * it ends on scenery. Local only (never networked) and cheap: one dynamic mesh
 * of thin camera-facing dashes and one ring, drawn from the path the real rock
 * would take.
 */
export class RockAimPreview {
  public readonly group = new THREE.Group();
  public readonly path: RockPath = createRockPath(MAX_POINTS);

  private readonly line: THREE.Mesh;
  private readonly positions = new Float32Array(MAX_DASHES * 4 * 3);
  private readonly ring: THREE.Mesh;

  constructor() {
    const geometry = new THREE.BufferGeometry();
    const indices: number[] = [];

    for (let i = 0; i < MAX_DASHES; i++) {
      const v = i * 4;

      indices.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
    }

    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setIndex(indices);
    geometry.setDrawRange(0, 0);

    this.line = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    this.line.frustumCulled = false;

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.85, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.ring.visible = false;

    this.group.add(this.line, this.ring);
    this.group.visible = false;
  }

  public get isVisible(): boolean {
    return this.group.visible;
  }

  public hide(): void {
    this.group.visible = false;
  }

  /** Draws `this.path` as seen from the camera. */
  public show(camera: THREE.Camera): void {
    const { points, count, hitSomething } = this.path;

    this.group.visible = true;

    // Walk the path by length, switching the pen on for DASH, off for GAP.
    let dashes = 0;
    let travelled = 0;
    let dashStart = 0;
    let dashEnd = DASH;

    for (let i = 0; i + 1 < count && dashes < MAX_DASHES; i++) {
      const length = points[i].distanceTo(points[i + 1]);

      if (length < 1e-6) {
        continue;
      }

      const segmentEnd = travelled + length;

      while (dashStart < segmentEnd && dashes < MAX_DASHES) {
        const from = Math.max(dashStart, travelled);
        const to = Math.min(dashEnd, segmentEnd);

        if (to > from) {
          a.lerpVectors(points[i], points[i + 1], (from - travelled) / length);
          b.lerpVectors(points[i], points[i + 1], (to - travelled) / length);
          this.addDash(dashes, a, b, camera);

          if (this.dashWritten) {
            dashes++;
          }
        }

        if (dashEnd <= segmentEnd) {
          dashStart = dashEnd + GAP;
          dashEnd = dashStart + DASH;
        } else {
          break;
        }
      }

      travelled = segmentEnd;
    }

    this.line.geometry.setDrawRange(0, dashes * 6);
    this.line.geometry.getAttribute("position").needsUpdate = true;

    this.ring.visible = hitSomething && count > 1;

    if (this.ring.visible) {
      const end = points[count - 1];
      const size = end.distanceTo(camera.position) * RING_SCREEN_SIZE;

      this.ring.position.copy(end);
      this.ring.quaternion.copy(camera.quaternion);
      this.ring.scale.setScalar(size);
    }
  }

  private dashWritten = false;

  /** One thin quad from `from` to `to`, turned to face the camera. */
  private addDash(
    index: number,
    from: THREE.Vector3,
    to: THREE.Vector3,
    camera: THREE.Camera,
  ): void {
    this.dashWritten = false;

    point.copy(from);
    nextPoint.copy(to);

    // Skip anything right in front of the lens.
    if (
      point.distanceTo(camera.position) < NEAR ||
      nextPoint.distanceTo(camera.position) < NEAR
    ) {
      return;
    }

    direction.subVectors(nextPoint, point);
    toCamera.subVectors(camera.position, point);
    sideways.crossVectors(direction, toCamera);

    if (sideways.lengthSq() < 1e-10) {
      return;
    }

    const width = point.distanceTo(camera.position) * HALF_WIDTH;

    sideways.normalize().multiplyScalar(width);

    const o = index * 12;
    const p = this.positions;

    p[o] = point.x - sideways.x;
    p[o + 1] = point.y - sideways.y;
    p[o + 2] = point.z - sideways.z;
    p[o + 3] = point.x + sideways.x;
    p[o + 4] = point.y + sideways.y;
    p[o + 5] = point.z + sideways.z;
    p[o + 6] = nextPoint.x - sideways.x;
    p[o + 7] = nextPoint.y - sideways.y;
    p[o + 8] = nextPoint.z - sideways.z;
    p[o + 9] = nextPoint.x + sideways.x;
    p[o + 10] = nextPoint.y + sideways.y;
    p[o + 11] = nextPoint.z + sideways.z;

    this.dashWritten = true;
  }

  public dispose(): void {
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.group.removeFromParent();
  }
}
