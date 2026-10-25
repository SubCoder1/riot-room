import * as THREE from "three";

import type { GeneratorDefinition } from "../world/ArenaLayout";

/** A soft round glow, drawn once and shared. */
function glowTexture(): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
      const a = Math.max(0, Math.exp(-d * d * 6) - Math.exp(-6));
      const o = (y * size + x) * 4;

      data[o] = 255;
      data[o + 1] = 70;
      data[o + 2] = 50;
      data[o + 3] = Math.round(255 * a);
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);

  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

interface Running {
  /** The generator's body (the animated group named `anim:<pile id>`). */
  body: THREE.Object3D | null;
  lamp: THREE.Mesh;
  halo: THREE.Sprite;
  seed: number;
  /** When a start-up shudder began (the clock `update` is given), or -1. */
  kickedAt: number;
}

/**
 * What shows a generator is running: its body shakes a little (a fine, fast
 * tremor over a slow heavy sway, a few millimetres at most), and a small red
 * indicator lamp glows with a slow, shallow pulse. Drawn only: the on/off
 * state is `PowerState`. A generator that is off stands still and its lamp
 * stays lit (it shows the unit has its own supply, not that it is running).
 */
export class GeneratorView {
  private readonly running = new Map<string, Running>();
  private readonly texture = glowTexture();
  private readonly lampGeometry = new THREE.SphereGeometry(0.018, 10, 8);
  private readonly lampMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4a3a,
    toneMapped: false,
    fog: false,
  });
  private readonly haloMaterial = new THREE.SpriteMaterial({
    map: this.texture,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.55,
    fog: false,
  });

  /** Finds each generator's body in the arena and puts its lamp on it. */
  public attach(
    arena: THREE.Object3D,
    generators: readonly GeneratorDefinition[],
  ): void {
    for (const g of generators) {
      const body = arena.getObjectByName(`anim:${g.body}`) ?? null;
      const lamp = new THREE.Mesh(this.lampGeometry, this.lampMaterial);
      const halo = new THREE.Sprite(this.haloMaterial.clone());

      lamp.position.set(g.indicator.x, g.indicator.y, g.indicator.z);
      halo.position.copy(lamp.position);
      halo.scale.setScalar(0.16);
      halo.renderOrder = 6;
      // On the body, so the lamp shakes with the panel it sits in.
      (body ?? arena).add(lamp, halo);
      this.running.set(g.id, {
        body,
        lamp,
        halo,
        seed: g.x * 3.1 + g.z * 1.7,
        kickedAt: -1,
      });
    }
  }

  /** A generator has just been started: its body shudders harder for a moment. */
  public kick(id: string, time: number): void {
    const g = this.running.get(id);

    if (g) {
      g.kickedAt = time;
    }
  }

  /** `on(id)`: whether each generator is running. */
  public update(time: number, on: (id: string) => boolean): void {
    for (const [id, g] of this.running) {
      const t = time + g.seed;

      if (g.body) {
        // A slow heavy sway and a fine fast tremor: a few millimetres while it
        // runs (you see it as a hum in the metal), more for the first second or
        // two after a start.
        const shudder =
          g.kickedAt >= 0 ? Math.max(0, 1 - (time - g.kickedAt) / 2) : 0;
        const amount = on(id) ? 1 + 2.2 * shudder : 0;

        g.body.position.set(
          amount * (0.004 * Math.sin(t * 61) + 0.0025 * Math.sin(t * 7.3)),
          amount * (0.0055 * Math.sin(t * 83 + 1.3)),
          amount *
            (0.0035 * Math.sin(t * 53 + 0.4) + 0.002 * Math.sin(t * 5.1)),
        );
      }

      // A slow, shallow pulse (never a flash).
      const pulse = 0.8 + 0.2 * Math.sin(t * 1.3);

      g.halo.material.opacity = 0.55 * pulse;
      g.halo.scale.setScalar(0.14 + 0.03 * pulse);
    }
  }

  public dispose(): void {
    this.texture.dispose();
    this.lampGeometry.dispose();
    this.lampMaterial.dispose();
    this.haloMaterial.dispose();

    for (const g of this.running.values()) {
      g.lamp.removeFromParent();
      g.halo.removeFromParent();
      g.halo.material.dispose();
    }
  }
}
