import * as THREE from "three";

import type { ProjectileSystem } from "../combat/Projectiles";
import { THROW_CONFIG } from "../combat/ThrowConfig";
import {
  BOTTLE_SCALE,
  GRENADE_SCALE,
  SMOKE_SCALE,
  createBottle,
  createBottleParts,
  createGrenade,
  createGrenadeParts,
  createSmokeCanister,
  disposeBottleParts,
  disposeGrenadeParts,
  flickerFlame,
} from "./ThrowableMeshes";

/** Radians of tumble per metre flown (about one turn a second at throwing speed). */
const BOTTLE_TUMBLE_PER_METRE = 0.26;
/** A grenade tumbles a little faster than a bottle: it is small and dense. */
const GRENADE_TUMBLE_PER_METRE = 0.9;

/**
 * Draws the grenades, smoke grenades and Molotov bottles in flight, bouncing
 * or lying on the ground. A fixed pool of meshes (no allocation per throw)
 * that only reads the projectile system.
 */
export class ThrownItemView {
  public readonly group = new THREE.Group();

  private readonly grenades: THREE.Group[] = [];
  private readonly canisters: THREE.Group[] = [];
  private readonly bottles: THREE.Group[] = [];
  private readonly grenadeParts = createGrenadeParts();
  private readonly bottleParts = createBottleParts();
  private readonly projectiles: ProjectileSystem;

  constructor(projectiles: ProjectileSystem) {
    this.projectiles = projectiles;

    for (let i = 0; i < THROW_CONFIG.THROW_MAX_ACTIVE; i++) {
      const grenade = createGrenade(this.grenadeParts);
      const canister = createSmokeCanister(this.grenadeParts);
      const bottle = createBottle(this.bottleParts);

      grenade.scale.setScalar(GRENADE_SCALE);
      canister.scale.setScalar(SMOKE_SCALE);
      grenade.visible = false;
      canister.visible = false;
      bottle.visible = false;
      this.grenades.push(grenade);
      this.canisters.push(canister);
      this.bottles.push(bottle);
      this.group.add(grenade, canister, bottle);
    }
  }

  public update(): void {
    const time = performance.now() / 1000;
    let grenades = 0;
    let canisters = 0;
    let bottles = 0;

    for (const item of this.projectiles.active) {
      if (item.kind === "molotov") {
        const bottle = this.bottles[bottles++];

        if (!bottle) {
          continue;
        }

        bottle.visible = true;
        bottle.scale.setScalar(BOTTLE_SCALE);
        bottle.position.copy(item.position);
        // A slow, steady tumble end over end around the line of flight, with
        // its flame still lit: it faces the way it is travelling and turns
        // about once a second, however fast it goes.
        bottle.rotation.set(
          item.travelled * BOTTLE_TUMBLE_PER_METRE,
          Math.atan2(item.velocity.x, item.velocity.z),
          0,
          "YXZ",
        );
        flickerFlame(bottle, time, true, 1);

        continue;
      }

      const mesh =
        item.kind === "grenade"
          ? this.grenades[grenades++]
          : this.canisters[canisters++];

      if (!mesh) {
        continue;
      }

      mesh.visible = true;
      mesh.position.copy(item.position);

      if (item.resting) {
        // Lying still: it keeps whatever way up it landed.
        mesh.position.y += 0.03;
      } else {
        mesh.rotation.set(
          item.travelled * GRENADE_TUMBLE_PER_METRE,
          item.id,
          item.rolling ? Math.PI / 2 : 0,
        );
      }
    }

    for (let i = grenades; i < this.grenades.length; i++) {
      this.grenades[i].visible = false;
    }

    for (let i = canisters; i < this.canisters.length; i++) {
      this.canisters[i].visible = false;
    }

    for (let i = bottles; i < this.bottles.length; i++) {
      this.bottles[i].visible = false;
    }
  }

  public dispose(): void {
    disposeGrenadeParts(this.grenadeParts);
    disposeBottleParts(this.bottleParts);
    this.group.removeFromParent();
  }
}
