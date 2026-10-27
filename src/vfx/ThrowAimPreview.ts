import * as THREE from "three";

import { createThrowPath, type ThrowPath } from "../combat/ThrowableFlight";

const MAX_POINTS = 400;
const MAX_DASHES = 480;
/** The arc is a row of short dashes: how long each is and the gap between them (m). */
const DASH = 0.16;
const GAP = 0.2;
/** Half a dash's width, as a fraction of the distance (a constant, thin look on screen). */
const HALF_WIDTH = 0.0011;
/** The dashes' colour (a pale cool blue-white) and how strong they are at each end. */
const LINE_COLOR = new THREE.Color(0xb4c8de);
const START_ALPHA = 0.6;
const END_ALPHA = 0.22;
/** The arc fades in over this distance from the camera (m), so it never dominates the view. */
const FADE_IN = 2.5;
/** Nothing is drawn closer to the camera than this. */
const NEAR = 0.12;

const start = new THREE.Vector3();
const end = new THREE.Vector3();
const tangent = new THREE.Vector3();
const sideways = new THREE.Vector3();
const toCamera = new THREE.Vector3();

/**
 * The aim indicator: a thin dotted arc along the flight path that fades toward
 * its end. Local only (never networked) and cheap: one dynamic dash mesh, made
 * once and reused every frame, drawn from the path the real throw would take.
 */
export class ThrowAimPreview {
  public readonly group = new THREE.Group();
  public readonly path: ThrowPath = createThrowPath(MAX_POINTS);

  private readonly line: THREE.Mesh;
  private readonly positions = new Float32Array(MAX_DASHES * 4 * 3);
  private readonly colors = new Float32Array(MAX_DASHES * 4 * 4);

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
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(this.colors, 4).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setIndex(indices);
    geometry.setDrawRange(0, 0);

    this.line = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    this.line.frustumCulled = false;

    this.group.add(this.line);
    this.group.visible = false;
  }

  public get isVisible(): boolean {
    return this.group.visible;
  }

  public hide(): void {
    this.group.visible = false;
  }

  /** Writes one dash, from `a` to `b`, `t` of the way along the whole arc. */
  private dash(
    index: number,
    a: THREE.Vector3,
    b: THREE.Vector3,
    t: number,
    camera: THREE.Camera,
  ): boolean {
    const distance = a.distanceTo(camera.position);

    if (distance < NEAR) {
      return false;
    }

    tangent.subVectors(b, a);
    toCamera.subVectors(camera.position, a);
    sideways.crossVectors(tangent, toCamera);

    if (sideways.lengthSq() < 1e-12) {
      return false;
    }

    sideways.normalize().multiplyScalar(distance * HALF_WIDTH);

    const alpha =
      (START_ALPHA + (END_ALPHA - START_ALPHA) * t) *
      Math.min(distance / FADE_IN, 1);
    const p = this.positions;
    const k = this.colors;
    const o = index * 12;
    const c = index * 16;

    p[o] = a.x - sideways.x;
    p[o + 1] = a.y - sideways.y;
    p[o + 2] = a.z - sideways.z;
    p[o + 3] = a.x + sideways.x;
    p[o + 4] = a.y + sideways.y;
    p[o + 5] = a.z + sideways.z;
    p[o + 6] = b.x - sideways.x;
    p[o + 7] = b.y - sideways.y;
    p[o + 8] = b.z - sideways.z;
    p[o + 9] = b.x + sideways.x;
    p[o + 10] = b.y + sideways.y;
    p[o + 11] = b.z + sideways.z;

    for (let v = 0; v < 4; v++) {
      k[c + v * 4] = LINE_COLOR.r;
      k[c + v * 4 + 1] = LINE_COLOR.g;
      k[c + v * 4 + 2] = LINE_COLOR.b;
      k[c + v * 4 + 3] = alpha;
    }

    return true;
  }

  /** Draws `this.path` as seen from the camera. */
  public show(camera: THREE.Camera): void {
    const { points, count } = this.path;

    this.group.visible = true;

    // The arc: walk the path by distance, drawing a dash for DASH metres, then
    // skipping GAP metres. The pattern starts at the hand, so it holds still
    // while the aim moves.
    let total = 0;

    for (let i = 1; i < count; i++) {
      total += points[i].distanceTo(points[i - 1]);
    }

    const period = DASH + GAP;
    let written = 0;
    let travelled = 0;
    // Distance along the path of the next thing to draw or skip.
    let cursor = 0;

    for (let i = 1; i < count && written < MAX_DASHES; i++) {
      const a = points[i - 1];
      const b = points[i];
      const length = a.distanceTo(b);

      if (length < 1e-6) {
        continue;
      }

      while (written < MAX_DASHES) {
        const into = cursor - travelled;

        // (A hair short of the end counts as the end: a step that small
        // would round away to nothing and the loop would never move on.)
        if (into >= length - 1e-9) {
          break;
        }

        const phase = cursor % period;

        if (phase < DASH) {
          const stop = Math.min(into + Math.max(DASH - phase, 1e-4), length);

          start.lerpVectors(a, b, into / length);
          end.lerpVectors(a, b, stop / length);

          if (
            this.dash(
              written,
              start,
              end,
              total > 0 ? (travelled + into) / total : 0,
              camera,
            )
          ) {
            written++;
          }

          cursor = travelled + stop;
        } else {
          // Always a real step on (a tiny one would round away to nothing).
          cursor += Math.max(period - phase, 1e-4);
        }
      }

      travelled += length;
    }

    this.line.geometry.setDrawRange(0, written * 6);
    this.line.geometry.getAttribute("position").needsUpdate = true;
    this.line.geometry.getAttribute("color").needsUpdate = true;
  }

  public dispose(): void {
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
    this.group.removeFromParent();
  }
}
