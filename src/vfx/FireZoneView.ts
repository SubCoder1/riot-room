import * as THREE from "three";

import { fireIntensity, fireRadius, type FireZone } from "../combat/FireZones";
import { MOLOTOV_CONFIG } from "../combat/MolotovConfig";
import {
  FLAME_INNER_BOTTOM,
  FLAME_INNER_TOP,
  FLAME_OUTER_BOTTOM,
  FLAME_OUTER_TOP,
  createFlameGeometry,
  createFlameMaterial,
} from "./ThrowableMeshes";

const FLAMES = 52;
const EMBERS = 10;

/** A stable pseudo-random number in [0, 1) from a seed, an index and a channel. */
function hash(seed: number, index: number, channel: number): number {
  const x =
    Math.sin(seed * 12.9898 + index * 78.233 + channel * 37.719) * 43758.5453;

  return x - Math.floor(x);
}

/** A soft round glow: bright in the middle, a clear edge at the radius. */
function createGlowTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const distance = Math.sqrt(dx * dx + dy * dy) * 2;
      // Fades in from the centre and drops off right at the edge.
      const edge = Math.min(Math.max((1 - distance) / 0.18, 0), 1);
      const alpha = (0.55 - 0.25 * distance) * edge;
      const o = (y * size + x) * 4;

      data[o] = 255;
      data[o + 1] = 120 + Math.round(60 * (1 - distance));
      data[o + 2] = 30;
      data[o + 3] = Math.round(Math.max(alpha, 0) * 255);
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);

  texture.needsUpdate = true;

  return texture;
}

interface Entry {
  group: THREE.Group;
  glow: THREE.Mesh;
  flames: THREE.InstancedMesh;
  cores: THREE.InstancedMesh;
  embers: THREE.InstancedMesh;
}

/**
 * Draws the fire zones: a soft glow on the ground, a few dozen small flames
 * scattered inside the radius (with an uneven edge, gaps and flicker) and a
 * handful of embers. A fixed pool of instanced meshes, no particle system. It
 * only reads the zones, and everything stays inside `fireRadius`, the same
 * radius the damage uses.
 */
export class FireZoneView {
  public readonly group = new THREE.Group();

  private readonly entries: Entry[] = [];
  private readonly glowTexture = createGlowTexture();
  private readonly glowGeometry = new THREE.CircleGeometry(1, 40);
  private readonly glowMaterial = new THREE.MeshBasicMaterial({
    map: this.glowTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  // Rounded teardrop tongues in two layers: a red-orange body and a hot core.
  private readonly flameGeometry = createFlameGeometry(
    FLAME_OUTER_BOTTOM,
    FLAME_OUTER_TOP,
  );
  private readonly coreGeometry = createFlameGeometry(
    FLAME_INNER_BOTTOM,
    FLAME_INNER_TOP,
  );
  private readonly flameMaterial = createFlameMaterial(0.92);
  private readonly emberGeometry = new THREE.SphereGeometry(1, 5, 4);
  private readonly emberMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb347,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly color = new THREE.Color();
  private readonly euler = new THREE.Euler();

  constructor() {
    for (let i = 0; i < MOLOTOV_CONFIG.MOLOTOV_MAX_ZONES; i++) {
      this.entries.push(this.createEntry());
    }
  }

  private createEntry(): Entry {
    const group = new THREE.Group();
    const glow = new THREE.Mesh(this.glowGeometry, this.glowMaterial);
    const flames = new THREE.InstancedMesh(
      this.flameGeometry,
      this.flameMaterial,
      FLAMES,
    );
    const cores = new THREE.InstancedMesh(
      this.coreGeometry,
      this.flameMaterial,
      FLAMES,
    );
    const embers = new THREE.InstancedMesh(
      this.emberGeometry,
      this.emberMaterial,
      EMBERS,
    );

    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.03;
    flames.frustumCulled = false;
    cores.frustumCulled = false;
    embers.frustumCulled = false;
    group.add(glow, flames, cores, embers);
    group.visible = false;
    this.group.add(group);

    return { group, glow, flames, cores, embers };
  }

  /** Draws the zones as they are now (`time` in seconds, for the flicker). */
  public update(zones: readonly FireZone[], time: number): void {
    for (let e = 0; e < this.entries.length; e++) {
      const entry = this.entries[e];
      const zone = zones[e];

      entry.group.visible = zone !== undefined;

      if (zone) {
        this.draw(entry, zone, time);
      }
    }
  }

  private draw(entry: Entry, zone: FireZone, time: number): void {
    const radius = fireRadius(zone.age);
    const intensity = fireIntensity(zone.age);
    const seed = zone.seed;

    entry.group.position.copy(zone.position);

    // The glow covers exactly the gameplay radius.
    entry.glow.scale.setScalar(Math.max(radius, 0.01));
    this.glowMaterial.opacity = 0.2 + 0.8 * intensity;

    for (let i = 0; i < FLAMES; i++) {
      const angle = hash(seed, i, 0) * Math.PI * 2;
      // An uneven edge: flames stay inside the radius, some a little short of it.
      const edge =
        0.82 + 0.18 * Math.sin(angle * 3 + seed) * Math.cos(angle * 2 - seed);
      const along = Math.sqrt(hash(seed, i, 1)) * edge;
      const flicker =
        0.7 +
        0.3 *
          Math.sin(time * (6 + hash(seed, i, 2) * 6) + hash(seed, i, 3) * 6.28);
      // Flames come and go a little, leaving gaps.
      const alive = 0.5 + 0.5 * Math.sin(time * 1.7 + hash(seed, i, 4) * 6.28);
      const height =
        (0.4 + 0.6 * hash(seed, i, 5)) *
        intensity *
        flicker *
        (0.55 + 0.45 * alive);
      const width = 0.13 + 0.12 * hash(seed, i, 6);
      // Tongues lean and sway a little, each in its own rhythm.
      const sway = hash(seed, i, 9) * 6.28;

      this.position.set(
        Math.cos(angle) * along * radius,
        0,
        Math.sin(angle) * along * radius,
      );
      this.euler.set(
        0.18 * Math.sin(time * 3 + sway),
        hash(seed, i, 7) * 6.28,
        0.18 * Math.cos(time * 2.6 + sway),
      );
      this.rotation.setFromEuler(this.euler);
      this.scale.set(width, Math.max(height, 0.001), width);
      this.matrix.compose(this.position, this.rotation, this.scale);
      entry.flames.setMatrixAt(i, this.matrix);

      // The hot core: narrower and shorter, in the same place.
      this.scale.set(
        width * 0.55,
        Math.max(height * 0.68, 0.001),
        width * 0.55,
      );
      this.matrix.compose(this.position, this.rotation, this.scale);
      entry.cores.setMatrixAt(i, this.matrix);

      // Some tongues burn brighter than others.
      const shade = 0.78 + 0.22 * flicker * hash(seed, i, 8);

      this.color.setScalar(shade);
      entry.flames.setColorAt(i, this.color);
      entry.cores.setColorAt(i, this.color);
    }

    for (const mesh of [entry.flames, entry.cores]) {
      mesh.instanceMatrix.needsUpdate = true;

      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    }

    // A few embers drifting up from inside the fire.
    for (let i = 0; i < EMBERS; i++) {
      const angle = hash(seed, i, 20) * Math.PI * 2;
      const along = Math.sqrt(hash(seed, i, 21)) * 0.9;
      const phase =
        (time * (0.25 + 0.3 * hash(seed, i, 22)) + hash(seed, i, 23)) % 1;
      const size = 0.018 * intensity * (1 - phase);

      this.position.set(
        Math.cos(angle) * along * radius + Math.sin(time * 2 + i) * 0.1,
        0.2 + phase * 1.4,
        Math.sin(angle) * along * radius,
      );
      this.scale.set(size, size, size);
      this.rotation.identity();
      this.matrix.compose(this.position, this.rotation, this.scale);
      entry.embers.setMatrixAt(i, this.matrix);
    }

    entry.embers.instanceMatrix.needsUpdate = true;
  }

  public dispose(): void {
    this.glowTexture.dispose();
    this.glowGeometry.dispose();
    this.glowMaterial.dispose();
    this.flameGeometry.dispose();
    this.coreGeometry.dispose();
    this.flameMaterial.dispose();
    this.emberGeometry.dispose();
    this.emberMaterial.dispose();

    for (const entry of this.entries) {
      entry.flames.dispose();
      entry.cores.dispose();
      entry.embers.dispose();
    }

    this.group.removeFromParent();
  }
}
