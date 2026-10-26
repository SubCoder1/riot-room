import * as THREE from "three";

import type {
  ElectricPuddleDefinition,
  PowerCutoffDefinition,
} from "../world/ArenaLayout";

/** A cheap, repeatable 0..1 number from two numbers. */
function hash(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;

  return x - Math.floor(x);
}

/** Arcs that can show at once, and the pieces each is drawn in. */
const ARCS = 34;
const PIECES = 9;
/** Arcs are held inside this share of the puddle's outline (never on dry floor). */
const INSIDE = 0.78;
/** Seconds the effect takes to die away once the power is cut. */
const FADE_OUT = 0.6;

/** A soft round glow (white in the middle, nothing at the rim). */
function glowTexture(): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const d = Math.hypot((i + 0.5) / size - 0.5, (j + 0.5) / size - 0.5) * 2;
      const a = Math.max(1 - d, 0);
      const at = (j * size + i) * 4;

      data[at] = 255;
      data[at + 1] = 255;
      data[at + 2] = 255;
      data[at + 3] = Math.round(255 * a * a);
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);

  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

interface Arc {
  ribbon: THREE.Mesh;
  positions: Float32Array;
  glow: THREE.Mesh;
  /** When it flashes (seconds), and how long. */
  start: number;
  length: number;
  /** When it next goes off. */
  next: number;
}

/**
 * The electrified puddle and the cutoff lever, drawn.
 *
 * A damaged cable end lies at the water's edge inside the doorway: that is the
 * fault. From it, now and then, a short arc runs a little way across the water
 * (never beyond the puddle), with a faint blue wash on the water under it.
 * Between flashes it is plain dark water. Each flash is laid out once and then
 * only fades (a fast rise, a short stutter, a fall), so nothing jitters.
 * Cutting the power fades everything out and leaves the ordinary puddle. No
 * lights are added to the scene (a light here would shine through the wall
 * beside it).
 */
export class ElectricPuddleView {
  public readonly group = new THREE.Group();

  private readonly arcs: Arc[] = [];
  /** The puddle the arc being laid belongs to. */
  private puddle: ElectricPuddleDefinition;
  private readonly waters: THREE.Mesh[] = [];
  /** Which puddle each source is in. */
  private readonly owner: ElectricPuddleDefinition[] = [];
  private readonly handle: THREE.Mesh;
  private readonly lampMaterial = new THREE.MeshBasicMaterial({
    color: 0xb02a22,
  });
  private readonly glowMap = glowTexture();
  /** The two places a live cable ends in the water: by the door, and on the east side. */
  private readonly sources: THREE.Vector3[] = [];
  private source = new THREE.Vector3();
  private readonly spot = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private lastLive = true;
  private level = 1;
  private lastTime = -1;
  private seed = 1;

  constructor(
    puddles: readonly ElectricPuddleDefinition[],
    cutoff: PowerCutoffDefinition | undefined,
  ) {
    this.puddle = puddles[0];
    this.group.name = "ElectricPuddle";

    const waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x070b10,
      roughness: 0.04,
      metalness: 0.2,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      // (The outline is built facing down: seen from above it needs both sides.)
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    // Each puddle: an uneven outline of dark water, and two live cable ends in it.
    const cableMaterial = new THREE.MeshStandardMaterial({
      color: 0x111316,
      roughness: 0.8,
    });
    const bareMaterial = new THREE.MeshStandardMaterial({
      color: 0x9a7a4a,
      roughness: 0.5,
    });
    // Where the cables come from: the panel (the lever's board) and the generator.
    const panel = new THREE.Vector3(
      cutoff?.x ?? puddles[0].x,
      puddles[0].y + 0.08,
      (cutoff?.z ?? puddles[0].z - puddles[0].rz) + 0.14,
    );
    const generator = new THREE.Vector3(5.6, puddles[0].y + 0.08, -22.2);
    // The doorway the cables go out through to reach the walkway puddle.
    const door = new THREE.Vector3(
      puddles[0].x - 0.4,
      puddles[0].y + 0.03,
      -17.1,
    );

    puddles.forEach((puddle, index) => {
      const shape = new THREE.Shape();
      const points = 56;

      for (let i = 0; i <= points; i++) {
        const a = (i / points) * Math.PI * 2;
        const lump =
          0.82 +
          0.18 * Math.sin(a * 3 + 1.3 + index) +
          0.1 * Math.sin(a * 5 + 0.4) +
          0.06 * hash(i % points, 3 + index);
        const x = Math.cos(a) * puddle.rx * lump;
        const z = Math.sin(a) * puddle.rz * lump;

        if (i === 0) {
          shape.moveTo(x, z);
        } else {
          shape.lineTo(x, z);
        }
      }

      const geometry = new THREE.ShapeGeometry(shape, 8);

      geometry.rotateX(Math.PI / 2);

      // A gap (a vent grate's strip) is cut out by clipping the same water
      // twice: the part north of it and the part south of it.
      const parts = puddle.gap
        ? [
            new THREE.Plane(new THREE.Vector3(0, 0, -1), puddle.gap.minZ * -1),
            new THREE.Plane(new THREE.Vector3(0, 0, 1), -puddle.gap.maxZ),
          ]
        : [];

      for (const plane of parts.length > 0 ? parts : [null]) {
        const material = plane
          ? Object.assign(waterMaterial.clone(), { clippingPlanes: [plane] })
          : waterMaterial;
        const water = new THREE.Mesh(geometry, material);

        water.position.set(
          puddle.x,
          puddle.y + 0.012 + index * 0.001,
          puddle.z,
        );
        water.receiveShadow = true;
        this.group.add(water);
        this.waters.push(water);
      }

      for (let n = 0; n < 2; n++) {
        const at = new THREE.Vector3(
          puddle.x + (n === 0 ? -0.3 : 0.38) * puddle.rx,
          puddle.y + 0.04,
          puddle.z + (n === 0 ? -0.45 : -0.3) * puddle.rz,
        );
        // The first puddle (in the room) is fed from the panel and the
        // generator; the one on the walkway from the same two, through the door.
        const start = n === 0 ? panel : generator;
        const steps = 8;
        const way: THREE.Vector3[] = [start.clone()];
        const through =
          puddle.z > -17.1
            ? [door.clone().add(new THREE.Vector3(n * 0.8, 0, 0))]
            : [];
        const marks = [start, ...through, at];

        for (let m = 1; m < marks.length; m++) {
          const from = marks[m - 1];
          const to = marks[m];

          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            // Loose S-curves: a sway across the line that dies at both ends.
            const sway =
              Math.sin(t * Math.PI * 2 + n * 2.1 + m) *
              0.32 *
              Math.sin(t * Math.PI);

            way.push(
              new THREE.Vector3(
                from.x + (to.x - from.x) * t + sway,
                puddle.y + 0.03 + (m === 1 ? (1 - t) * 0.05 : 0),
                from.z + (to.z - from.z) * t,
              ),
            );
          }
        }

        const curve = new THREE.CatmullRomCurve3(way);
        const cable = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 90, 0.028, 8),
          cableMaterial,
        );
        const bare = new THREE.Mesh(
          new THREE.CylinderGeometry(0.013, 0.013, 0.09, 6),
          bareMaterial,
        );
        const tip = curve.getTangent(1);

        bare.rotation.order = "YXZ";
        bare.rotation.set(Math.PI / 2, Math.atan2(tip.x, tip.z), 0);
        bare.position.set(
          at.x + tip.x * 0.04,
          puddle.y + 0.03,
          at.z + tip.z * 0.04,
        );
        this.group.add(cable, bare);
        this.sources.push(at);
        this.owner.push(puddle);
      }
    });

    this.source = this.sources[0];

    // The pooled arcs: each a flat ribbon on the water, and a glow under it.
    for (let k = 0; k < ARCS; k++) {
      const positions = new Float32Array((PIECES + 1) * 2 * 3);
      const ribbonGeometry = new THREE.BufferGeometry();
      const index: number[] = [];

      for (let i = 0; i < PIECES; i++) {
        const a = i * 2;

        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }

      ribbonGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3),
      );
      ribbonGeometry.setIndex(index);

      const ribbon = new THREE.Mesh(
        ribbonGeometry,
        new THREE.MeshBasicMaterial({
          color: 0x86b2ff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: this.glowMap,
          color: 0x4f86e8,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3,
        }),
      );

      ribbon.frustumCulled = false;
      ribbon.visible = false;
      glow.rotation.x = -Math.PI / 2;
      glow.visible = false;
      this.group.add(ribbon, glow);
      this.arcs.push({
        ribbon,
        positions,
        glow,
        start: -9,
        length: 0,
        next: k * 0.11,
      });
    }

    // The lever on its box (local +z is out of the wall, turned to face the room).
    this.handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.26, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.6 }),
    );

    if (cutoff) {
      const lever = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.46, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.85 }),
      );
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.05, 0.012),
        new THREE.MeshStandardMaterial({ color: 0xb59a3a, roughness: 0.9 }),
      );
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10),
        new THREE.MeshStandardMaterial({ color: 0x55595d, roughness: 0.5 }),
      );
      const lamp = new THREE.Mesh(
        new THREE.CircleGeometry(0.022, 10),
        this.lampMaterial,
      );

      lever.position.set(
        cutoff.x + cutoff.nx * 0.05,
        cutoff.y,
        cutoff.z + cutoff.nz * 0.05,
      );
      lever.rotation.y = Math.atan2(cutoff.nx, cutoff.nz);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(0, 0.02, 0.07);
      plate.position.set(0, -0.15, 0.056);
      lamp.position.set(0.1, 0.17, 0.056);
      // The handle swings about the hub: up when live, thrown down when cut.
      this.handle.geometry.translate(0, -0.13, 0);
      this.handle.position.set(0, 0.02, 0.09);
      lever.add(box, plate, hub, this.handle, lamp);
      this.group.add(lever);
    }

    this.setLive(true);
  }

  /** Shows the lever thrown or not, and the lamp's colour. */
  private setLive(live: boolean): void {
    this.handle.rotation.z = live ? Math.PI * 0.85 : -0.15;
    this.lampMaterial.color.setHex(live ? 0xb02a22 : 0x2f6b3a);
  }

  /** Whether (x, z) is well inside the water's outline (arcs and glows stay in). */
  private inside(x: number, z: number): boolean {
    const dx = (x - this.puddle.x) / (this.puddle.rx * INSIDE);
    const dz = (z - this.puddle.z) / (this.puddle.rz * INSIDE);

    const gap = this.puddle.gap;

    return (
      dx * dx + dz * dz <= 1 &&
      // (An arc stays on its cable's side of the gap: none runs across a grate.)
      !(
        gap &&
        (this.source.z < gap.minZ ? z > gap.minZ - 0.3 : z < gap.maxZ + 0.3)
      )
    );
  }

  /** A point on the water of the current puddle (an angle round it, how far out). */
  private onWater(out: THREE.Vector3, around: number, inner: number): void {
    const a = around * Math.PI * 2;
    const r = Math.sqrt(inner) * 0.8;

    out.set(
      this.puddle.x + Math.cos(a) * this.puddle.rx * r,
      this.puddle.y + 0.03,
      this.puddle.z + Math.sin(a) * this.puddle.rz * r,
    );

    // (Never in a gap, and held inside the outline.)
    for (let i = 0; i < 12 && !this.inside(out.x, out.z); i++) {
      out.x += (this.puddle.x - out.x) * 0.25;
      out.z += (this.puddle.z - out.z) * 0.25;
    }
  }

  /** Pulls a point back toward the fault until it is inside the water. */
  private holdInside(point: THREE.Vector3): void {
    for (let i = 0; i < 12 && !this.inside(point.x, point.z); i++) {
      point.x += (this.source.x - point.x) * 0.25;
      point.z += (this.source.z - point.z) * 0.25;
    }
  }

  /** Lays one arc: from the fault a short way over the water. */
  private lay(arc: Arc, time: number, k: number): void {
    const s = this.seed * 13 + k;

    // Discharges are scattered over the water; one in four starts at a cable's
    // bare end. Each is a small arc between nearby points.
    const pick = Math.floor(hash(s, 7) * this.sources.length);

    this.puddle = this.owner[pick];

    if (hash(s, 8) < 0.25) {
      this.source = this.sources[pick];
    } else {
      this.source = this.spot;
      this.onWater(this.spot, hash(s, 9), hash(s, 10));
    }

    const reach = 0.15 + 0.4 * hash(s, 1);
    // Mostly toward the doorway (+z), fanning to either side.
    const heading = hash(s, 2) * Math.PI * 2;

    this.end.set(
      this.source.x + Math.cos(heading) * reach,
      this.source.y,
      this.source.z + Math.sin(heading) * reach,
    );
    this.holdInside(this.end);
    arc.start = time;
    arc.length = 0.1 + 0.16 * hash(s, 3);

    const dx = this.end.x - this.source.x;
    const dz = this.end.z - this.source.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;

    for (let i = 0; i <= PIECES; i++) {
      const t = i / PIECES;
      // A gentle wander (an arc, not a crack), eased to nothing at both ends.
      const bend = Math.sin(t * Math.PI) * (hash(s + i, 4) - 0.5) * 0.07;
      const x = this.source.x + dx * t + nx * bend;
      const z = this.source.z + dz * t + nz * bend;
      // A few centimetres wide, thinnest at its tip.
      const half = 0.017 * (1 - 0.5 * t);
      const y = this.puddle.y + 0.026;

      arc.positions.set([x - nx * half, y, z - nz * half], i * 6);
      arc.positions.set([x + nx * half, y, z + nz * half], i * 6 + 3);
    }

    (
      arc.ribbon.geometry.getAttribute("position") as THREE.BufferAttribute
    ).needsUpdate = true;
    arc.ribbon.geometry.computeBoundingSphere();

    // The wash on the water sits under the middle of the arc.
    const size = 0.7 + len * 1.6;

    arc.glow.position.set(
      this.source.x + dx * 0.5,
      this.puddle.y + 0.02,
      this.source.z + dz * 0.5,
    );
    arc.glow.scale.set(size, size, 1);
  }

  /** The brightness of a flash `age` seconds into its `length`: a fast rise, a stutter, a fall. */
  private envelope(age: number, length: number): number {
    if (age < 0 || age > length) {
      return 0;
    }

    const t = age / length;

    if (t < 0.12) {
      return t / 0.12;
    }

    // One short dip in the middle, then a smooth fall.
    return (1 - t) * (t > 0.4 && t < 0.55 ? 0.45 : 1);
  }

  /** Draws the current state (`time` in seconds). */
  public update(time: number, live: boolean): void {
    if (live !== this.lastLive) {
      this.lastLive = live;
      this.setLive(live);
    }

    const dt = this.lastTime < 0 ? 0 : Math.min(time - this.lastTime, 0.1);

    this.lastTime = time;
    // The power eases in and out: cut, everything fades over a moment.
    this.level = live
      ? Math.min(this.level + dt / 0.15, 1)
      : Math.max(this.level - dt / FADE_OUT, 0);

    // Always at work: each arc goes off again a moment after it ends, on its
    // own beat, so several are lit at any time (and none on a shared rhythm).
    if (live) {
      this.arcs.forEach((arc, k) => {
        if (time >= arc.next) {
          this.seed += 1;
          this.lay(arc, time, k);
          arc.next = time + arc.length + 0.02 + 0.25 * hash(this.seed, 5);
        }
      });
    }

    for (const arc of this.arcs) {
      const e = this.envelope(time - arc.start, arc.length) * this.level;
      const on = e > 0.01;

      arc.ribbon.visible = on;
      arc.glow.visible = on;

      if (on) {
        (arc.ribbon.material as THREE.MeshBasicMaterial).opacity = 0.95 * e;
        (arc.glow.material as THREE.MeshBasicMaterial).opacity = 0.5 * e;
      }
    }
  }

  public dispose(): void {
    for (const water of this.waters) {
      water.geometry.dispose();
    }

    (this.waters[0].material as THREE.Material).dispose();

    for (const arc of this.arcs) {
      arc.ribbon.geometry.dispose();
      (arc.ribbon.material as THREE.Material).dispose();
      arc.glow.geometry.dispose();
      (arc.glow.material as THREE.Material).dispose();
    }

    this.glowMap.dispose();
    this.lampMaterial.dispose();
    this.group.removeFromParent();
  }
}
