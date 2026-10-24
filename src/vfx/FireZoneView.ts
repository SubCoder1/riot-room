import * as THREE from "three";

import {
  fireAge,
  fireIntensity,
  fireDyingFactor,
  fireRadius,
  FIRE_SPREAD_DONE,
  type FireZone,
} from "../combat/FireZones";
import { MOLOTOV_CONFIG } from "../combat/MolotovConfig";
import {
  FLAME_INNER_BOTTOM,
  FLAME_INNER_TOP,
  FLAME_OUTER_BOTTOM,
  FLAME_OUTER_TOP,
  createFlameGeometry,
  createFlameMaterial,
} from "./ThrowableMeshes";

const FLAMES = 110;
/** An ordinary fire draws this many tongues; a fuel fire all of them. */
const ORDINARY_FLAMES = 68;
/** The tongues come in clumps: this many, unevenly placed. */
const CLUMPS = 7;
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
  // A fuel fire burns hotter and darker: red at the foot going to purple, with
  // a pink-violet core.
  private readonly fuelFlameGeometry = createFlameGeometry(
    new THREE.Color(0xe01808),
    new THREE.Color(0x6a1840),
  );
  private readonly fuelCoreGeometry = createFlameGeometry(
    new THREE.Color(0xff4a1a),
    new THREE.Color(0xc42a2a),
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

  /**
   * Height of the surface at (x, z) as seen from `fromY`: each tongue of flame
   * stands on it, so a fire that spreads past the edge of a table or crate
   * burns on the floor beyond instead of hanging in the air.
   */
  public surfaceY: ((x: number, z: number, fromY: number) => number) | null =
    null;

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

    // Colours are set per tongue as it burns; giving the meshes their colour
    // buffer now means the first fire does not switch them to a shader
    // variant that must be compiled mid-game (see Game.warmUp).
    flames.setColorAt(0, this.color.setRGB(1, 1, 1));
    cores.setColorAt(0, this.color.setRGB(1, 1, 1));

    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.03;
    // The hot core is always drawn over the body of the flame (the two are
    // sorted by distance otherwise, and the body can hide the core).
    flames.renderOrder = 1;
    cores.renderOrder = 2;
    flames.frustumCulled = false;
    cores.frustumCulled = false;
    embers.frustumCulled = false;
    group.add(glow, flames, cores, embers);
    group.visible = false;
    this.group.add(group);

    return { group, glow, flames, cores, embers };
  }

  /**
   * For the warm-up draw: puts the fuel fire's geometry on the first fire
   * (and back), so it is on the graphics card before the first fuel fire.
   */
  public previewFuel(on: boolean): void {
    const entry = this.entries[0];

    entry.flames.geometry = on ? this.fuelFlameGeometry : this.flameGeometry;
    entry.cores.geometry = on ? this.fuelCoreGeometry : this.coreGeometry;
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
    // Tongues stay where they stand once the fire has spread: in the fade they
    // only die out, they never slide inward with the shrinking burn radius.
    const fuel = zone.fuel === true;
    const radius =
      fireRadius(Math.min(fireAge(zone), FIRE_SPREAD_DONE)) *
      (fuel ? MOLOTOV_CONFIG.FUEL_FIRE_RADIUS_SCALE : 1);
    // A fuel fire roars: much taller flames, a little broader.
    // (An ordinary fire stands taller than the clump scatter alone makes it.)
    const tall = fuel ? MOLOTOV_CONFIG.FUEL_FIRE_HEIGHT_SCALE : 1.7;
    const broad = fuel ? 1.5 : 1;
    const intensity = fireIntensity(fireAge(zone));
    const count = fuel ? FLAMES : ORDINARY_FLAMES;
    // A fuel fire sways harder (but not faster: see pace).
    const fury = fuel ? 1.3 : 1;
    // How fast the flames move: a slow, heavy burn (the sway and flicker rates
    // are scaled by it, the size of the sway is not).
    const pace = fuel ? 0.5 : 0.6;
    entry.flames.count = count;
    entry.cores.count = count;
    const seed = zone.seed;

    entry.group.position.copy(zone.position);
    const flameGeometry = fuel ? this.fuelFlameGeometry : this.flameGeometry;
    const coreGeometry = fuel ? this.fuelCoreGeometry : this.coreGeometry;

    if (entry.flames.geometry !== flameGeometry) {
      entry.flames.geometry = flameGeometry;
      entry.cores.geometry = coreGeometry;
    }

    // The glow covers exactly the gameplay radius.
    // (The flat glow disc is not drawn: it hung in the air over uneven ground
    // and showed as a hard-edged ring. The fire's light does its job.)
    entry.glow.visible = false;

    for (let i = 0; i < count; i++) {
      // Each tongue belongs to a clump (the fire is a few patches burning
      // harder than the rest, not an even scatter). Its place is the clump's
      // centre and a short random offset; it is kept inside the fire's radius.
      const clump = i % CLUMPS;
      const clumpAngle = hash(seed, clump, 40) * Math.PI * 2;
      const clumpAlong = 0.15 + 0.6 * Math.sqrt(hash(seed, clump, 41));
      const spread = 0.12 + 0.22 * hash(seed, clump, 42);
      const offsetAngle = hash(seed, i, 0) * Math.PI * 2;
      const offsetAlong = Math.sqrt(hash(seed, i, 1)) * spread;
      const px =
        Math.cos(clumpAngle) * clumpAlong + Math.cos(offsetAngle) * offsetAlong;
      const pz =
        Math.sin(clumpAngle) * clumpAlong + Math.sin(offsetAngle) * offsetAlong;
      const angle = Math.atan2(pz, px);
      // An uneven edge: flames stay inside the radius, some a little short of it.
      const edge =
        0.82 + 0.18 * Math.sin(angle * 3 + seed) * Math.cos(angle * 2 - seed);
      const along = Math.min(Math.hypot(px, pz), edge);
      // Taller in the heart of a clump, low at its edges: a tongue's share of
      // its clump's height falls with its distance from the clump's centre.
      const heart = 1 - 0.55 * Math.min(offsetAlong / spread, 1);
      const flicker =
        0.7 +
        0.3 *
          Math.sin(
            time * pace * (6 + hash(seed, i, 2) * 6) + hash(seed, i, 3) * 6.28,
          );
      // Flames come and go a little, leaving gaps.
      const alive =
        0.5 + 0.5 * Math.sin(time * 1.7 * pace + hash(seed, i, 4) * 6.28);
      // As the fire dies the tongues go out one at a time, each at its own
      // moment, sinking and guttering first; the last few are low and ragged.
      const dying = fireDyingFactor(fireAge(zone), hash(seed, i, 30));
      const gutter =
        dying < 1 ? 0.75 + 0.25 * Math.sin(time * 23 * pace + i * 3.1) : 1;
      const height =
        (0.45 + 0.6 * hash(seed, i, 5)) *
        (0.6 + 0.5 * hash(seed, clump, 43)) *
        heart *
        dying *
        gutter *
        intensity *
        flicker *
        tall *
        (0.55 + 0.45 * alive);
      // Tongues differ in width and in how flat they are (never a row of copies).
      const width = (0.1 + 0.11 * hash(seed, i, 6)) * broad;
      const flat = 0.85 + 0.3 * hash(seed, i, 10);
      // A tongue is never lower than it is wide (until the fire is dying): no
      // flat discs lying on the ground.
      const rawTongue =
        dying >= 1
          ? Math.max(height, width * 2.6 * intensity * (0.8 + 0.2 * flicker))
          : height;
      // (A fuel fire's tongues are tall but kept below chest height.)
      const tongue = fuel
        ? Math.min(rawTongue, MOLOTOV_CONFIG.FUEL_FIRE_MAX_FLAME_HEIGHT)
        : rawTongue;
      // Tongues lean and sway a little, each in its own rhythm.
      const sway = hash(seed, i, 9) * 6.28;

      let fx = Math.cos(angle) * along * radius;
      let fz = Math.sin(angle) * along * radius;

      // A fuel fire burns over the oil's own shape (the pool, its lobes and
      // the trail to the drum), not in a round patch.
      if (fuel && zone.shape && zone.shape.length > 0) {
        const total = zone.shape.reduce((sum, l) => sum + l.r * l.r, 0);
        let pick = hash(seed, i, 50) * total;
        let lobe = zone.shape[0];

        for (const l of zone.shape) {
          pick -= l.r * l.r;
          lobe = l;

          if (pick <= 0) {
            break;
          }
        }

        const a = hash(seed, i, 51) * Math.PI * 2;
        const d = Math.sqrt(hash(seed, i, 52)) * lobe.r * 0.92;

        fx = lobe.x + Math.cos(a) * d - zone.position.x;
        fz = lobe.z + Math.sin(a) * d - zone.position.z;
      }
      const ground = this.surfaceY
        ? Math.min(
            Math.max(
              this.surfaceY(
                zone.position.x + fx,
                zone.position.z + fz,
                zone.position.y + 0.5,
              ) - zone.position.y,
              -2,
            ),
            0.6,
          )
        : 0;

      this.position.set(fx, ground, fz);
      this.euler.set(
        0.26 * fury * Math.sin(time * 3 * pace + sway),
        hash(seed, i, 7) * 6.28,
        0.26 * fury * Math.cos(time * 2.6 * pace + sway),
      );
      this.rotation.setFromEuler(this.euler);
      this.scale.set(width * flat, Math.max(tongue, 0.001), width / flat);
      this.matrix.compose(this.position, this.rotation, this.scale);
      entry.flames.setMatrixAt(i, this.matrix);

      // The hot core: narrower and shorter, in the same place.
      this.scale.set(
        width * flat * 0.55,
        Math.max(tongue * 0.68, 0.001),
        (width / flat) * 0.55,
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
    this.fuelFlameGeometry.dispose();
    this.fuelCoreGeometry.dispose();
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
