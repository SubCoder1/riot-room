import * as THREE from "three";

import type { GeneratorDefinition } from "../world/ArenaLayout";

/** Particles kept for each generator (the oldest is reused). */
const POOL = 80;

const VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  varying float vAlpha;

  void main() {
    vAlpha = aAlpha;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * 420.0 / max(-view.z, 0.5);
    gl_Position = projectionMatrix * view;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColour;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float soft = smoothstep(1.0, 0.15, d);

    if (soft * vAlpha < 0.003) {
      discard;
    }

    gl_FragColor = vec4(uColour, soft * vAlpha);
  }
`;

interface Puff {
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size0: number;
  size1: number;
  alpha: number;
}

interface Stack {
  at: THREE.Vector3;
  puffs: Puff[];
  running: boolean;
  /** Seconds of heavy smoke still to come (a start-up). */
  heavy: number;
  carry: number;
  points: THREE.Points;
  position: THREE.BufferAttribute;
  size: THREE.BufferAttribute;
  alpha: THREE.BufferAttribute;
}

/** Puffs a second: a thin trickle while it runs, a thick plume while it starts. */
export const IDLE_RATE = 3;
export const START_RATE = 34;
/** Seconds of heavy smoke after a start. */
export const START_SECONDS = 3;

/**
 * Smoke from each generator's exhaust: a thin, slow grey trickle while it
 * runs, a thick, quick plume for a few seconds when it is started, nothing
 * while it is off (what is already in the air thins out and goes). Drawn
 * only; whether a generator runs is `PowerState`.
 */
export class GeneratorSmoke {
  public readonly group = new THREE.Group();

  private readonly stacks = new Map<string, Stack>();
  private readonly material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { uColour: { value: new THREE.Color(0x5a5e64) } },
    transparent: true,
    depthWrite: false,
    fog: false,
  });

  constructor(generators: readonly GeneratorDefinition[]) {
    this.group.name = "generator-smoke";

    for (const g of generators) {
      const geometry = new THREE.BufferGeometry();
      const position = new THREE.BufferAttribute(new Float32Array(POOL * 3), 3);
      const size = new THREE.BufferAttribute(new Float32Array(POOL), 1);
      const alpha = new THREE.BufferAttribute(new Float32Array(POOL), 1);

      geometry.setAttribute("position", position);
      geometry.setAttribute("aSize", size);
      geometry.setAttribute("aAlpha", alpha);
      geometry.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(g.exhaust.x, g.exhaust.y + 1.5, g.exhaust.z),
        6,
      );

      const points = new THREE.Points(geometry, this.material);

      points.frustumCulled = false;
      points.renderOrder = 5;
      this.group.add(points);
      this.stacks.set(g.id, {
        at: new THREE.Vector3(g.exhaust.x, g.exhaust.y, g.exhaust.z),
        puffs: [],
        running: true,
        heavy: 0,
        carry: 0,
        points,
        position,
        size,
        alpha,
      });
    }
  }

  /** Whether a generator runs (and so gives off its thin trickle). */
  public setRunning(id: string, running: boolean): void {
    const stack = this.stacks.get(id);

    if (stack) {
      stack.running = running;

      if (!running) {
        stack.heavy = 0;
      }
    }
  }

  /** A start-up: heavy smoke for a few seconds. */
  public startUp(id: string): void {
    const stack = this.stacks.get(id);

    if (stack) {
      stack.running = true;
      stack.heavy = START_SECONDS;
    }
  }

  /** Live puffs of a generator. */
  public count(id: string): number {
    return this.stacks.get(id)?.puffs.length ?? 0;
  }

  public update(dt: number): void {
    for (const stack of this.stacks.values()) {
      const heavy = stack.heavy > 0;
      const rate = !stack.running ? 0 : heavy ? START_RATE : IDLE_RATE;

      stack.heavy = Math.max(0, stack.heavy - dt);
      stack.carry += rate * dt;

      while (stack.carry >= 1) {
        stack.carry -= 1;
        this.emit(stack, heavy);
      }

      stack.puffs = stack.puffs.filter((puff) => {
        puff.age += dt;

        return puff.age < puff.life;
      });

      stack.puffs.forEach((puff, i) => {
        const t = puff.age / puff.life;

        puff.x += puff.vx * dt;
        puff.y += puff.vy * dt;
        puff.z += puff.vz * dt;
        // It slows as it climbs, and the breeze takes it.
        puff.vy *= 1 - 0.35 * dt;
        stack.position.setXYZ(i, puff.x, puff.y, puff.z);
        stack.size.setX(i, puff.size0 + (puff.size1 - puff.size0) * t);
        // In quickly, out slowly: no puff ever pops in or out.
        stack.alpha.setX(
          i,
          puff.alpha * Math.min(t / 0.12, 1) * (1 - t) * (1 - t),
        );
      });

      stack.points.geometry.setDrawRange(0, stack.puffs.length);
      stack.position.needsUpdate = true;
      stack.size.needsUpdate = true;
      stack.alpha.needsUpdate = true;
    }
  }

  private emit(stack: Stack, heavy: boolean): void {
    if (stack.puffs.length >= POOL) {
      stack.puffs.shift();
    }

    const r = (): number => Math.random() - 0.5;

    stack.puffs.push(
      heavy
        ? {
            age: 0,
            life: 2.6 + Math.random() * 1.4,
            x: stack.at.x + r() * 0.08,
            y: stack.at.y,
            z: stack.at.z + r() * 0.08,
            vx: r() * 0.5 + 0.12,
            vy: 0.7 + Math.random() * 0.5,
            vz: r() * 0.5,
            size0: 0.28,
            size1: 1.3 + Math.random() * 0.5,
            alpha: 0.62,
          }
        : {
            age: 0,
            life: 2.2 + Math.random() * 1.2,
            x: stack.at.x + r() * 0.04,
            y: stack.at.y,
            z: stack.at.z + r() * 0.04,
            vx: r() * 0.12 + 0.06,
            vy: 0.3 + Math.random() * 0.15,
            vz: r() * 0.12,
            size0: 0.1,
            size1: 0.5 + Math.random() * 0.2,
            alpha: 0.2,
          },
    );
  }

  public dispose(): void {
    for (const stack of this.stacks.values()) {
      stack.points.geometry.dispose();
      stack.points.removeFromParent();
    }

    this.material.dispose();
    this.group.removeFromParent();
  }
}
