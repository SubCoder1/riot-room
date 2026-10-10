import * as THREE from "three";

import type { CombatSystem } from "./CombatSystem";
import type { Combatant } from "./Combatant";
import { MOLOTOV_CONFIG as C } from "./MolotovConfig";
import type { ThrowWorld } from "./ThrowableFlight";

export type FirePhase = "spreading" | "active" | "fading";

export interface FireZone {
  readonly id: number;
  readonly ownerId: string;
  /** Centre of the fire, on the surface it landed on. */
  readonly position: THREE.Vector3;
  /** Seconds since it ignited. */
  age: number;
  /** Varies the look of each fire (never the gameplay). */
  readonly seed: number;
}

const SPREAD_END = C.MOLOTOV_SPREAD_TIME;
const ACTIVE_END = C.MOLOTOV_SPREAD_TIME + C.MOLOTOV_DURATION;
const LIFE = ACTIVE_END + C.MOLOTOV_FIRE_FADE_TIME;

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const clamp01 = (t: number): number => Math.min(Math.max(t, 0), 1);

export function firePhase(age: number): FirePhase {
  return age < SPREAD_END
    ? "spreading"
    : age < ACTIVE_END
      ? "active"
      : "fading";
}

/**
 * The radius of a fire at a given age. This is THE radius: the flames are
 * drawn inside it and bodies inside it are burnt, so what you see is what
 * hurts. It grows from the impact, holds, then shrinks as the fire dies.
 */
export function fireRadius(age: number): number {
  if (age >= LIFE) {
    return 0;
  }

  if (age < SPREAD_END) {
    return (
      C.MOLOTOV_START_RADIUS +
      (C.MOLOTOV_MAX_RADIUS - C.MOLOTOV_START_RADIUS) *
        easeOut(clamp01(age / SPREAD_END))
    );
  }

  if (age < ACTIVE_END) {
    return C.MOLOTOV_MAX_RADIUS;
  }

  return (
    C.MOLOTOV_MAX_RADIUS *
    (1 - easeOut(clamp01((age - ACTIVE_END) / C.MOLOTOV_FIRE_FADE_TIME)))
  );
}

/** 0 to 1: how strongly the fire is burning (a quick ignition, a fade at the end). */
export function fireIntensity(age: number): number {
  if (age >= LIFE) {
    return 0;
  }

  if (age >= ACTIVE_END) {
    return 1 - clamp01((age - ACTIVE_END) / C.MOLOTOV_FIRE_FADE_TIME);
  }

  return clamp01(age / 0.25);
}

/** Seconds from ignition until the fire is gone. */
export const FIRE_LIFETIME = LIFE;

interface Burn {
  /** Seconds of continuous burning (drives the growing damage). */
  exposure: number;
  outside: number;
  tick: number;
}

/**
 * The fires on the ground. Pure logic over the Combatant interface, with no
 * rendering, so a server can run the same class: it creates the fires, times
 * them out and decides who is burning. Clients only draw the zones.
 */
export class FireSystem {
  private readonly list: FireZone[] = [];
  private readonly burns = new Map<string, Burn>();
  private readonly feet = new THREE.Vector3();
  private nextId = 1;

  private readonly combat: CombatSystem;
  private readonly world: ThrowWorld;

  constructor(combat: CombatSystem, world: ThrowWorld) {
    this.combat = combat;
    this.world = world;
  }

  public get zones(): readonly FireZone[] {
    return this.list;
  }

  /**
   * Starts a fire where a bottle broke. It is put on the surface below the
   * impact (never in mid-air), and the oldest fire goes out if there are too many.
   */
  public ignite(ownerId: string, impact: THREE.Vector3): FireZone {
    while (this.list.length >= C.MOLOTOV_MAX_ZONES) {
      this.remove(0);
    }

    const y = this.world.surfaceY
      ? this.world.surfaceY(impact.x, impact.z, impact.y)
      : 0;
    const zone: FireZone = {
      id: this.nextId++,
      ownerId,
      position: new THREE.Vector3(impact.x, y, impact.z),
      age: 0,
      seed: Math.random() * 1000,
    };

    this.list.push(zone);
    this.combat.events.emit({
      type: "fire-started",
      zoneId: zone.id,
      ownerId,
      x: zone.position.x,
      y: zone.position.y,
      z: zone.position.z,
    });

    return zone;
  }

  public clear(): void {
    while (this.list.length > 0) {
      this.remove(0);
    }

    this.burns.clear();
  }

  public update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      this.list[i].age += dt;

      if (this.list[i].age >= LIFE) {
        this.remove(i);
      }
    }

    for (const target of this.combat.getCombatants()) {
      this.burn(target, dt);
    }
  }

  /** A fire the body is standing in, or null. */
  private fireAround(target: Combatant): FireZone | null {
    target.getPosition(this.feet);

    for (const zone of this.list) {
      const radius = fireRadius(zone.age) + C.MOLOTOV_BODY_RADIUS;
      const dx = this.feet.x - zone.position.x;
      const dz = this.feet.z - zone.position.z;
      const dy = this.feet.y - zone.position.y;

      if (
        dx * dx + dz * dz <= radius * radius &&
        dy >= -0.6 &&
        dy <= C.MOLOTOV_VERTICAL_REACH
      ) {
        return zone;
      }
    }

    return null;
  }

  private burn(target: Combatant, dt: number): void {
    const state = this.burns.get(target.id) ?? {
      exposure: 0,
      outside: 0,
      tick: 0,
    };

    this.burns.set(target.id, state);

    const zone = target.isDead() ? null : this.fireAround(target);

    if (!zone) {
      state.tick = 0;
      state.outside += dt;

      if (state.outside >= C.MOLOTOV_RAMP_RESET_TIME) {
        state.exposure = 0;
      }

      return;
    }

    state.outside = 0;
    state.exposure += dt;
    state.tick += dt;

    // One tick per interval however many fires overlap.
    while (state.tick >= C.MOLOTOV_TICK_INTERVAL) {
      state.tick -= C.MOLOTOV_TICK_INTERVAL;

      this.combat.applyHazardDamage({
        sourceId: "molotov-fire",
        attackerId: zone.ownerId,
        targetId: target.id,
        hurtbox: "legs",
        damage: this.tickDamage(state.exposure),
      });
    }
  }

  /** Burning for longer hurts more, up to a cap that overlapping fires never exceed. */
  private tickDamage(exposure: number): number {
    const ramp =
      1 + (C.MOLOTOV_MAX_RAMP - 1) * clamp01(exposure / C.MOLOTOV_RAMP_SECONDS);

    return Math.min(
      C.MOLOTOV_MAX_OVERLAP_DAMAGE,
      Math.max(1, Math.round(C.MOLOTOV_DAMAGE_PER_TICK * ramp)),
    );
  }

  private remove(index: number): void {
    const [zone] = this.list.splice(index, 1);

    this.combat.events.emit({ type: "fire-ended", zoneId: zone.id });
  }
}
