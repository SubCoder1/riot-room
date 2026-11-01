import * as THREE from "three";

/**
 * The spark where the lighter's flame meets the dynamite's wire: one bright,
 * solid warm-white core with a soft halo, and a few short streaks thrown
 * outward (up and away from the bundle, never back into it). It is a child of
 * the bundle at the wire's tip, so it is exactly where the wire is, and it is
 * driven by one number, `s` from 0 to 1 through its life: a crisp onset, a
 * short peak, a quick fade. No light, no particles, nothing left behind.
 */

/** How many sparks are in the air at once, and how many different throws each has in turn. */
const SPARKS = 52;
const THROWS = 6;
/** Gravity's pull (m/s squared). */
const PULL = 4.5;

interface Spark {
  /** Its throws, one after another (each leaves the moment the last has died). */
  directions: THREE.Vector3[];
  speed: number;
  /** When its first one leaves and how long each lives (s). */
  start: number;
  life: number;
}

/** The same sparks every time: a fixed spray, fast, thrown out from the tip. */
function spray(): Spark[] {
  let seed = 1337;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;

    return seed / 4294967296;
  };
  const out: Spark[] = [];

  for (let i = 0; i < SPARKS; i++) {
    // Thrown out in every direction but back into the bundle (which lies below, -x).
    const directions = Array.from({ length: THROWS }, () =>
      new THREE.Vector3(
        random() * 1.3 - 0.35,
        random() * 2 - 1,
        random() * 2 - 1,
      ).normalize(),
    );

    out.push({
      directions,
      speed: 1.2 + random() * 2.4,
      start: random() * 0.12,
      life: 0.2 + random() * 0.26,
    });
  }

  return out;
}

const FORWARD = new THREE.Vector3(0, 0, 1);

let haloMap: THREE.DataTexture | null = null;

function halo(): THREE.DataTexture {
  if (haloMap) {
    return haloMap;
  }

  const size = 32;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
      const a = Math.max(1 - d, 0) ** 2;
      const o = (y * size + x) * 4;

      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = Math.round(255 * a);
    }
  }

  haloMap = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  haloMap.magFilter = THREE.LinearFilter;
  haloMap.minFilter = THREE.LinearFilter;
  haloMap.needsUpdate = true;

  return haloMap;
}

export class IgnitionSpark {
  public readonly group = new THREE.Group();

  private readonly core: THREE.Mesh;
  private readonly glow: THREE.Sprite;
  private readonly streaks: THREE.Mesh[] = [];
  private readonly sparks = spray();
  private readonly geometry: THREE.BoxGeometry;
  private readonly materials: THREE.MeshBasicMaterial[];

  constructor(radius = 0.04) {
    this.core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(radius, 1),
      new THREE.MeshBasicMaterial({
        color: 0xfff6d8,
        toneMapped: false,
        fog: false,
        depthWrite: false,
      }),
    );
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: halo(),
        color: 0xffb54a,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        fog: false,
        toneMapped: false,
      }),
    );
    this.core.renderOrder = 12;
    this.glow.renderOrder = 10;
    this.group.add(this.glow, this.core);

    // Thin streaks (long along z), white-hot and orange, thrown from the tip.
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.materials = [0xfff0c0, 0xffc860, 0xff9a30].map(
      (color) =>
        new THREE.MeshBasicMaterial({
          color,
          toneMapped: false,
          fog: false,
          depthWrite: false,
        }),
    );

    this.sparks.forEach((spark, i) => {
      const streak = new THREE.Mesh(this.geometry, this.materials[i % 3]);

      streak.quaternion.setFromUnitVectors(FORWARD, spark.directions[0]);
      streak.renderOrder = 11;
      this.streaks.push(streak);
      this.group.add(streak);
    });

    this.group.visible = false;
  }

  private readonly velocity = new THREE.Vector3();
  private readonly gravity = new THREE.Vector3(-PULL, 0, 0);
  private readonly direction = new THREE.Vector3();

  /**
   * Which way is down in the bundle's own space (a unit vector), so the sparks
   * arc down whichever way the bundle is turned.
   */
  public setDown(down: THREE.Vector3): void {
    this.gravity.copy(down).multiplyScalar(PULL);
  }

  /**
   * Sparks for as long as it is called with the seconds since they began
   * (negative or null: none). It never stops or gaps: each spark is thrown
   * again, another way, the moment it dies.
   */
  public update(t: number | null): void {
    const on = t !== null && t >= 0;

    this.group.visible = on;

    if (!on) {
      return;
    }

    // A bright core that flickers all the while (the wire burning), with a
    // flash at the very first instant.
    const flash = Math.max(1 - t / 0.09, 0);
    const flicker = 0.85 + 0.15 * Math.sin(t * 90);

    this.core.scale.setScalar((0.6 + flash) * flicker);
    this.glow.scale.setScalar((0.2 + 0.18 * flash) * flicker);
    (this.glow.material as THREE.SpriteMaterial).opacity = 0.75 * flicker;

    this.sparks.forEach((spark, i) => {
      const streak = this.streaks[i];
      const since = t - spark.start;

      streak.visible = since >= 0;

      if (!streak.visible) {
        return;
      }

      const n = Math.floor(since / spark.life);
      const age = since - n * spark.life;
      const life = age / spark.life;

      this.direction.copy(spark.directions[(n + i) % THROWS]);

      // Thrown fast and slowing (air), pulled down (gravity): a real arc.
      const run = 1 - Math.exp(-6 * age);

      streak.position
        .copy(this.direction)
        .multiplyScalar((spark.speed * run) / 6)
        .addScaledVector(this.gravity, 0.5 * age * age);

      // Each streak points along its way, stretched by how fast it goes, and
      // thins out to nothing as it dies.
      this.velocity
        .copy(this.direction)
        .multiplyScalar(spark.speed * Math.exp(-6 * age))
        .addScaledVector(this.gravity, age);
      streak.quaternion.setFromUnitVectors(FORWARD, this.velocity.normalize());

      const fade = 1 - life * life;
      const speed = spark.speed * Math.exp(-6 * age) + 0.4;

      streak.scale.set(
        0.0065 * fade,
        0.0065 * fade,
        0.016 + 0.03 * speed * fade,
      );
    });
  }

  public dispose(): void {
    this.core.geometry.dispose();
    (this.core.material as THREE.Material).dispose();
    this.glow.material.dispose();
    this.geometry.dispose();

    for (const material of this.materials) {
      material.dispose();
    }

    this.group.removeFromParent();
  }
}
