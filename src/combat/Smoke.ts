import * as THREE from "three";

import type { CombatSystem } from "./CombatSystem";
import { SMOKE_CONFIG as C } from "./SmokeConfig";
import type { ThrowWorld } from "./ThrowableFlight";

export interface SmokeCloud {
  readonly id: number;
  readonly ownerId: string;
  /** Centre of the cloud (a little above the surface it started on). */
  readonly position: THREE.Vector3;
  /** Seconds since it started to emit. */
  age: number;
  /** Varies the look of each cloud (never the gameplay). */
  readonly seed: number;
}

export type SmokePhase = "expanding" | "holding" | "dissipating";

const EXPAND_END = C.SMOKE_EXPAND_TIME;
const HOLD_END = C.SMOKE_EXPAND_TIME + C.SMOKE_DURATION;
const LIFE = HOLD_END + C.SMOKE_FADE_TIME;
/** Seconds the density takes to come up at the very start (a puff, not a pop). */
const DENSITY_RAMP = 0.6;
/** The cloud's centre sits this high above the floor it landed on (metres). */
export const SMOKE_CENTRE_LIFT = 0.8;

/** Seconds from the start of emission until the cloud is gone. */
export const SMOKE_LIFETIME = LIFE;

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const clamp01 = (t: number): number => Math.min(Math.max(t, 0), 1);

export function smokePhase(age: number): SmokePhase {
  return age < EXPAND_END
    ? "expanding"
    : age < HOLD_END
      ? "holding"
      : "dissipating";
}

/**
 * The radius of a cloud at a given age. THE radius: the puffs are drawn inside
 * it and sight is lost through it, so what looks like smoke is smoke. It grows
 * from the canister, holds, then shrinks a little as the cloud thins out.
 */
export function smokeRadius(age: number): number {
  if (age >= LIFE) {
    return 0;
  }

  if (age < EXPAND_END) {
    return (
      C.SMOKE_START_RADIUS +
      (C.SMOKE_MAX_RADIUS - C.SMOKE_START_RADIUS) *
        easeOut(clamp01(age / EXPAND_END))
    );
  }

  if (age < HOLD_END) {
    return C.SMOKE_MAX_RADIUS;
  }

  const fade = clamp01((age - HOLD_END) / C.SMOKE_FADE_TIME);

  return C.SMOKE_MAX_RADIUS * (1 - 0.25 * fade);
}

/** 0 to 1: how thick the smoke is (a quick build-up, a slow thinning at the end). */
export function smokeThickness(age: number): number {
  if (age >= LIFE) {
    return 0;
  }

  if (age >= HOLD_END) {
    return 1 - clamp01((age - HOLD_END) / C.SMOKE_FADE_TIME);
  }

  return clamp01(age / DENSITY_RAMP);
}

/** How many samples are taken along a sight line through one cloud. */
const SAMPLES = 10;

/**
 * The smoke clouds in the world. Pure logic with no rendering, so a server can
 * run the same class: it creates the clouds, ages them out and answers "how
 * much can be seen through here?". Clients only draw the clouds.
 *
 * Smoke is only a visibility effect: it never damages, never blocks movement,
 * punches or guards, and gives no protection from anything but being seen.
 */
export class SmokeSystem {
  private readonly list: SmokeCloud[] = [];
  private nextId = 1;

  private readonly combat: CombatSystem | null;
  private readonly world: ThrowWorld | null;
  private readonly sample = new THREE.Vector3();

  constructor(
    combat: CombatSystem | null = null,
    world: ThrowWorld | null = null,
  ) {
    this.combat = combat;
    this.world = world;
  }

  public get clouds(): readonly SmokeCloud[] {
    return this.list;
  }

  /**
   * Starts a cloud where a smoke grenade went off. It is put on the surface
   * below it (never in mid-air) and the oldest cloud disperses if there are
   * too many.
   */
  public emit(ownerId: string, at: THREE.Vector3): SmokeCloud {
    while (this.list.length >= C.SMOKE_MAX_CLOUDS) {
      this.remove(0);
    }

    const floor = this.world?.surfaceY
      ? this.world.surfaceY(at.x, at.z, at.y)
      : Math.max(at.y - 0.1, 0);
    const cloud: SmokeCloud = {
      id: this.nextId++,
      ownerId,
      position: new THREE.Vector3(at.x, floor + SMOKE_CENTRE_LIFT, at.z),
      age: 0,
      seed: Math.random() * 1000,
    };

    this.list.push(cloud);
    this.combat?.events.emit({
      type: "smoke-started",
      cloudId: cloud.id,
      ownerId,
      x: cloud.position.x,
      y: cloud.position.y,
      z: cloud.position.z,
    });

    return cloud;
  }

  public clear(): void {
    while (this.list.length > 0) {
      this.remove(0);
    }
  }

  public update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      this.list[i].age += dt;

      if (this.list[i].age >= LIFE) {
        this.remove(i);
      }
    }
  }

  /**
   * How thick the smoke is at a point, 0 (clear) to 1 (dense): the strongest of
   * the clouds around it, full in the core and thinning toward the edge.
   */
  public densityAt(point: THREE.Vector3): number {
    let density = 0;

    for (const cloud of this.list) {
      const radius = smokeRadius(cloud.age);

      if (radius <= 0) {
        continue;
      }

      const distance = point.distanceTo(cloud.position) / radius;

      if (distance >= 1) {
        continue;
      }

      const core = C.SMOKE_CORE_SHARE;
      const edge = distance <= core ? 1 : 1 - (distance - core) / (1 - core);

      density = Math.max(
        density,
        edge * edge * (3 - 2 * edge) * smokeThickness(cloud.age),
      );
    }

    return density;
  }

  /**
   * The share of the view that survives looking from `from` to `to` (1 = clear,
   * 0 = nothing gets through): the exponential of the smoke along the line.
   */
  public visibility(from: THREE.Vector3, to: THREE.Vector3): number {
    if (this.list.length === 0) {
      return 1;
    }

    const length = from.distanceTo(to);

    if (length < 1e-6) {
      return 1;
    }

    // Only the samples are needed: a cheap midpoint rule along the line.
    const slice = length / SAMPLES;
    let thick = 0;

    for (let i = 0; i < SAMPLES; i++) {
      this.sample.lerpVectors(from, to, (i + 0.5) / SAMPLES);
      thick += this.densityAt(this.sample) * slice;
    }

    return Math.exp(-C.SMOKE_EXTINCTION * thick);
  }

  /** True when the smoke between the two points is thick enough to hide one from the other. */
  public blocksSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    return this.visibility(from, to) < C.SMOKE_SIGHT_THRESHOLD;
  }

  private remove(index: number): void {
    const [cloud] = this.list.splice(index, 1);

    this.combat?.events.emit({ type: "smoke-ended", cloudId: cloud.id });
  }
}
