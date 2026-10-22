import * as THREE from "three";

import { Lightning } from "./Lightning";

/**
 * The night's moving parts: the odd fault in a work light, and distant
 * lightning. A flash raises only the shadow-casting sky light (so roofs and
 * walls keep it out of the rooms) and a trace of the hemisphere light, then
 * everything returns to its base values.
 */

const FLASH_COLOUR = new THREE.Color(0xe4ebf5);
/** Extra key-light intensity at a full flash. */
const KEY_BOOST = 7;
/** Extra hemisphere intensity at a full flash (it reaches indoors, so tiny). */
const HEMI_BOOST = 0.3;

/** A floodlight and its drawn glow (lens and beam). */
export interface Halogen {
  light: THREE.Light;
  glow: THREE.Object3D;
}

interface HalogenState extends Halogen {
  base: number;
  /** Seconds until the next dip, and the dip under way (if any). */
  next: number;
  kind: "stutter" | "sag" | null;
  age: number;
  length: number;
  depth: number;
}

interface Flicker {
  light: THREE.Light;
  base: number;
  /** Seconds until the next fault, and how long the current one has left. */
  next: number;
  left: number;
  depth: number;
}

export class NightAtmosphere {
  public readonly lightning: Lightning;

  private readonly key: THREE.DirectionalLight;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly rainFlash: { value: number };
  private readonly sky: {
    mesh: THREE.Object3D;
    uniforms: { uFlash: { value: number } };
  } | null;
  private readonly baseKeyColour: THREE.Color;
  private readonly baseKey: number;
  private readonly baseHemi: number;
  private readonly flickers: Flicker[];
  private readonly halogens: HalogenState[];

  constructor(
    key: THREE.DirectionalLight,
    hemisphere: THREE.HemisphereLight,
    rainFlash: { value: number },
    flickering: THREE.Light[],
    halogens: Halogen[] = [],
    lightning: Lightning = new Lightning(),
    sky: {
      mesh: THREE.Object3D;
      uniforms: { uFlash: { value: number } };
    } | null = null,
  ) {
    this.sky = sky;
    this.key = key;
    this.hemisphere = hemisphere;
    this.rainFlash = rainFlash;
    this.lightning = lightning;
    this.baseKeyColour = key.color.clone();
    this.baseKey = key.intensity;
    this.baseHemi = hemisphere.intensity;
    this.halogens = halogens.map((h) => ({
      ...h,
      base: h.light.intensity,
      next: 2 + Math.random() * 14,
      kind: null,
      age: 0,
      length: 0,
      depth: 0,
    }));
    this.flickers = flickering.map((light) => ({
      light,
      base: light.intensity,
      next: 2 + Math.random() * 5,
      left: 0,
      depth: 0,
    }));
  }

  public update(dt: number): void {
    const level = this.lightning.update(dt);

    this.key.intensity = this.baseKey + level * KEY_BOOST;
    this.key.color.copy(this.baseKeyColour).lerp(FLASH_COLOUR, level);
    this.hemisphere.intensity = this.baseHemi + level * HEMI_BOOST;
    this.rainFlash.value = level;

    // The sky shows only while there is a flash to light it.
    if (this.sky) {
      this.sky.uniforms.uFlash.value = level;
      this.sky.mesh.visible = level > 0.004;
    }

    for (const h of this.halogens) {
      this.updateHalogen(h, dt);
    }

    for (const f of this.flickers) {
      if (f.left > 0) {
        f.left -= dt;

        // A stutter: a few quick dips, not a smooth wave.
        const on = Math.sin(f.left * 90) > -0.2;

        f.light.intensity = f.base * (on ? 1 - f.depth * 0.4 : 1 - f.depth);

        if (f.left <= 0) {
          f.light.intensity = f.base;
          f.next = 3 + Math.random() * 8;
        }
      } else {
        f.next -= dt;

        if (f.next <= 0) {
          f.left = 0.12 + Math.random() * 0.25;
          f.depth = 0.35 + Math.random() * 0.4;
        }
      }
    }
  }

  /**
   * Floodlights now and then lose power: a quick stutter (on and off, a few
   * times) or a slow sag and recovery, each at a random time, depth and length.
   */
  private updateHalogen(h: HalogenState, dt: number): void {
    let level = 1;

    if (h.kind === null) {
      h.next -= dt;

      if (h.next <= 0) {
        h.kind = Math.random() < 0.55 ? "stutter" : "sag";
        h.age = 0;
        h.length =
          h.kind === "stutter"
            ? 0.15 + Math.random() * 0.45
            : 1 + Math.random() * 2.5;
        h.depth = 0.3 + Math.random() * 0.55;
      }
    } else {
      h.age += dt;

      if (h.age >= h.length) {
        h.kind = null;
        h.next = 4 + Math.random() * 18;
      } else if (h.kind === "stutter") {
        // A few quick dips, not a smooth wave.
        const on = Math.sin(h.age * 70 + h.depth * 9) > -0.1;

        level = on ? 1 - h.depth * 0.2 : 1 - h.depth;
      } else {
        // Down and back up on a smooth curve.
        level = 1 - h.depth * Math.sin((h.age / h.length) * Math.PI);
      }
    }

    h.light.intensity = h.base * level;
    h.glow.userData.setLevel?.(level);
  }

  /** Puts every light back to its base value. */
  public dispose(): void {
    this.lightning.reset();
    this.key.intensity = this.baseKey;
    this.key.color.copy(this.baseKeyColour);
    this.hemisphere.intensity = this.baseHemi;
    this.rainFlash.value = 0;

    if (this.sky) {
      this.sky.uniforms.uFlash.value = 0;
      this.sky.mesh.visible = false;
    }

    for (const f of this.flickers) {
      f.light.intensity = f.base;
    }

    for (const h of this.halogens) {
      h.light.intensity = h.base;
      h.kind = null;
      h.glow.userData.setLevel?.(1);
    }
  }
}
