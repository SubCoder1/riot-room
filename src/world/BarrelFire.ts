import * as THREE from "three";

import {
  FLAME_INNER_BOTTOM,
  FLAME_INNER_TOP,
  FLAME_OUTER_BOTTOM,
  FLAME_OUTER_TOP,
  createFlameGeometry,
  createFlameMaterial,
} from "../vfx/ThrowableMeshes";
import type { FireDrumDefinition } from "./ArenaLayout";

/** Tongues in one drum: each is an outer body with a hot core inside it. */
const TONGUES = 7;
/** Sparks that rise from the fire and fade. */
const SPARKS = 9;
const MOUTH_RADIUS = 0.22;

const flameGeometry = createFlameGeometry(FLAME_OUTER_BOTTOM, FLAME_OUTER_TOP);
const coreGeometry = createFlameGeometry(FLAME_INNER_BOTTOM, FLAME_INNER_TOP);
const flameMaterial = createFlameMaterial(0.9);
const bedMaterial = new THREE.MeshBasicMaterial({
  color: 0xff6a1c,
  transparent: true,
  opacity: 0.95,
  depthWrite: false,
});
const sparkMaterial = new THREE.MeshBasicMaterial({
  color: 0xffc25a,
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
});
const bedGeometry = new THREE.CircleGeometry(MOUTH_RADIUS + 0.02, 18);
const sparkGeometry = new THREE.SphereGeometry(0.012, 4, 3);

/** A stable pseudo-random number in [0, 1) from a seed and a channel. */
function hash(seed: number, channel: number): number {
  const x = Math.sin(seed * 12.9898 + channel * 78.233) * 43758.5453;

  return x - Math.floor(x);
}

/**
 * A fire burning in a steel drum: a bed of embers across its mouth, a handful
 * of tongues that lean and flare out of step with each other, a few sparks
 * rising, and one warm light (with shadows) that wavers with the flames. Drawn only: it
 * burns forever and hurts nobody (it stands in a drum's mouth, out of reach).
 */
export class BarrelFire {
  public readonly group = new THREE.Group();

  private readonly tongues: THREE.Mesh[] = [];
  private readonly cores: THREE.Mesh[] = [];
  private readonly sparks: THREE.Mesh[] = [];
  private readonly light = new THREE.PointLight(0xff8a3a, 0, 7.5, 2);
  private readonly seed: number;

  constructor(drum: FireDrumDefinition) {
    this.seed = drum.x * 7.31 + drum.z * 3.17;
    this.group.name = drum.id;
    this.group.position.set(drum.x, drum.y, drum.z);

    const bed = new THREE.Mesh(bedGeometry, bedMaterial);

    bed.rotation.x = -Math.PI / 2;
    bed.position.y = 0.01;
    bed.name = "embers";
    this.group.add(bed);

    for (let i = 0; i < TONGUES; i++) {
      const angle = hash(this.seed, i) * Math.PI * 2;
      const radius =
        i === 0 ? 0 : MOUTH_RADIUS * (0.35 + 0.55 * hash(this.seed, i + 20));
      const tongue = new THREE.Mesh(flameGeometry, flameMaterial);
      const core = new THREE.Mesh(coreGeometry, flameMaterial);

      tongue.position.set(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius,
      );
      core.position.copy(tongue.position);
      tongue.renderOrder = 1;
      core.renderOrder = 2;
      tongue.frustumCulled = false;
      core.frustumCulled = false;
      tongue.name = "flame";
      this.tongues.push(tongue);
      this.cores.push(core);
      this.group.add(tongue, core);
    }

    for (let i = 0; i < SPARKS; i++) {
      const spark = new THREE.Mesh(sparkGeometry, sparkMaterial);

      spark.frustumCulled = false;
      this.sparks.push(spark);
      this.group.add(spark);
    }

    this.light.position.set(0, 0.55, 0);
    this.light.name = `${drum.id}-light`;
    // With shadows, so the walls stop its light (the Break room's north wall is
    // three metres off: without them the room's ceiling glowed from outside).
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(512, 512);
    this.light.shadow.camera.near = 0.3;
    this.light.shadow.camera.far = 7.5;
    this.light.shadow.bias = -0.0008;
    this.light.shadow.normalBias = 0.01;
    this.group.add(this.light);
  }

  /** Moves the flames on to `time` (seconds). */
  public update(time: number): void {
    let flare = 0;

    this.tongues.forEach((tongue, i) => {
      const core = this.cores[i];
      // Each tongue has its own pace and phase: the fire never pulses as one.
      const pace = 3.4 + 2.2 * hash(this.seed, i + 40);
      const phase = hash(this.seed, i + 60) * 40;
      const wave =
        0.5 +
        0.28 * Math.sin(time * pace + phase) +
        0.14 * Math.sin(time * pace * 2.3 + phase * 1.7) +
        0.08 * Math.sin(time * pace * 5.1 + phase * 0.6);
      const middle = i === 0 ? 1.05 : 0.8;
      const height = (0.2 + 0.36 * wave) * middle;
      const width = (0.19 + 0.06 * wave) * (i === 0 ? 1.15 : 1);
      const sway = 0.2 * Math.sin(time * pace * 0.7 + phase);

      tongue.scale.set(width, height, width);
      tongue.rotation.set(
        sway,
        phase,
        0.8 * sway * Math.cos(time * 2.1 + phase),
      );
      core.scale.set(width * 0.55, height * 0.62, width * 0.55);
      core.rotation.copy(tongue.rotation);
      flare += wave;
    });

    flare /= this.tongues.length;

    this.sparks.forEach((spark, i) => {
      // A spark climbs for a couple of seconds, drifting, and starts again.
      const life = 1.6 + 1.4 * hash(this.seed, i + 80);
      const age = ((time + hash(this.seed, i + 90) * life) % life) / life;
      const angle = hash(this.seed, i + 100) * Math.PI * 2;

      spark.position.set(
        Math.cos(angle) * 0.15 * (1 - age) +
          0.18 * Math.sin(time * 1.3 + i) * age,
        0.2 + 1.5 * age,
        Math.sin(angle) * 0.15 * (1 - age) +
          0.18 * Math.cos(time * 1.1 + i) * age,
      );
      spark.scale.setScalar(
        Math.max(0.2, 1 - age) * (0.8 + 0.5 * hash(this.seed, i)),
      );
    });

    this.light.intensity =
      20 + 22 * flare + 3 * Math.sin(time * 23.7 + this.seed);
  }

  public dispose(): void {
    this.light.dispose();
  }
}
