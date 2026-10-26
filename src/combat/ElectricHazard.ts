import * as THREE from "three";

import type { ElectricPuddleDefinition } from "../world/ArenaLayout";
import type { CombatSystem } from "./CombatSystem";

/** Damage of one shock (a quarter of a full health bar). */
export const SHOCK_DAMAGE = 20;
/** Seconds between shocks while someone stays in the water. */
export const SHOCK_INTERVAL = 0.8;
/** How far above or below the puddle's floor a body still stands in it (m). */
const FLOOR_REACH = 0.5;

/**
 * Puddles with a current in them, and the one switch that cuts it. Pure logic
 * over the combat system (no drawing), so a server can run the same class:
 * while the current is live, a body whose feet are in a puddle is shocked, and
 * again every SHOCK_INTERVAL seconds it stays there (never every frame). Dry
 * ground, a puddle's floor above or below, and the dead are never touched; and
 * once the current is cut nobody is.
 */
export class ElectricHazard {
  private liveNow = true;
  /** Seconds until each body may be shocked again. */
  private readonly cooldown = new Map<string, number>();
  private readonly feet = new THREE.Vector3();

  private readonly combat: CombatSystem;
  private readonly puddles: readonly ElectricPuddleDefinition[];

  constructor(
    combat: CombatSystem,
    puddles: readonly ElectricPuddleDefinition[],
  ) {
    this.combat = combat;
    this.puddles = puddles;
  }

  public get live(): boolean {
    return this.liveNow;
  }

  /** Cuts or restores the current. */
  public setLive(live: boolean): void {
    this.liveNow = live;

    if (!live) {
      this.cooldown.clear();
    }
  }

  /** Whether (x, z) at feet height `y` is in a puddle. */
  public inWater(x: number, z: number, y: number): boolean {
    return this.puddles.some((p) => {
      const dx = (x - p.x) / p.rx;
      const dz = (z - p.z) / p.rz;
      const inGap = p.gap !== undefined && z >= p.gap.minZ && z <= p.gap.maxZ;

      return (
        !inGap && dx * dx + dz * dz <= 1 && Math.abs(y - p.y) <= FLOOR_REACH
      );
    });
  }

  /** Call once a frame. */
  public update(dt: number): void {
    for (const [id, left] of this.cooldown) {
      this.cooldown.set(id, left - dt);
    }

    if (!this.liveNow) {
      return;
    }

    for (const target of this.combat.getCombatants()) {
      if (target.isDead()) {
        continue;
      }

      target.getPosition(this.feet);

      if (!this.inWater(this.feet.x, this.feet.z, this.feet.y)) {
        // Out of the water: the next step in gets a shock at once.
        this.cooldown.delete(target.id);
        continue;
      }

      if ((this.cooldown.get(target.id) ?? 0) > 0) {
        continue;
      }

      this.cooldown.set(target.id, SHOCK_INTERVAL);
      this.combat.applyHazardDamage({
        sourceId: "electric-shock",
        // (The hazard has no owner: the body is its own "attacker".)
        attackerId: target.id,
        targetId: target.id,
        hurtbox: "legs",
        damage: SHOCK_DAMAGE,
        hitstun: 0.25,
        direction: new THREE.Vector3(0, 0, 1),
      });
    }
  }

  public reset(): void {
    this.liveNow = true;
    this.cooldown.clear();
  }
}
