import * as THREE from "three";

import type { ProjectileSystem } from "../combat/Projectiles";
import { ROCK_CONFIG } from "../combat/RockConfig";
import {
  BOTTLE_SCALE,
  createBottle,
  createBottleParts,
  createRockGeometry,
  createRockMaterial,
  disposeBottleParts,
  flickerFlame,
} from "./ThrowableMeshes";

/** Radians of tumble per metre flown (about one turn a second at throwing speed). */
const BOTTLE_TUMBLE_PER_METRE = 0.26;

/**
 * Draws the rocks and Molotov bottles in flight. A fixed pool of meshes (no
 * allocation per throw) that only reads the projectile system.
 */
export class RockProjectileView {
  public readonly group = new THREE.Group();

  private readonly rocks: THREE.Mesh[] = [];
  private readonly bottles: THREE.Group[] = [];
  private readonly rockGeometry = createRockGeometry(ROCK_CONFIG.ROCK_RADIUS);
  private readonly rockMaterial = createRockMaterial();
  private readonly bottleParts = createBottleParts();
  private readonly projectiles: ProjectileSystem;

  constructor(projectiles: ProjectileSystem) {
    this.projectiles = projectiles;

    for (let i = 0; i < ROCK_CONFIG.ROCK_MAX_ACTIVE; i++) {
      const rock = new THREE.Mesh(this.rockGeometry, this.rockMaterial);
      const bottle = createBottle(this.bottleParts);

      rock.visible = false;
      rock.frustumCulled = false;
      bottle.visible = false;
      this.rocks.push(rock);
      this.bottles.push(bottle);
      this.group.add(rock, bottle);
    }
  }

  public update(): void {
    const time = performance.now() / 1000;
    let rocks = 0;
    let bottles = 0;

    for (const projectile of this.projectiles.active) {
      if (projectile.kind === "molotov") {
        const bottle = this.bottles[bottles++];

        if (!bottle) {
          continue;
        }

        bottle.visible = true;
        bottle.scale.setScalar(BOTTLE_SCALE);
        bottle.position.copy(projectile.position);
        // A slow, steady tumble end over end around the line of flight, with
        // its flame still lit: it faces the way it is travelling and turns
        // about once a second, however fast it goes.
        bottle.rotation.set(
          projectile.travelled * BOTTLE_TUMBLE_PER_METRE,
          Math.atan2(projectile.velocity.x, projectile.velocity.z),
          0,
          "YXZ",
        );
        flickerFlame(bottle, time, true, 1);
      } else {
        const rock = this.rocks[rocks++];

        if (!rock) {
          continue;
        }

        rock.visible = true;
        rock.position.copy(projectile.position);
        // Tumbling, a little differently for each rock.
        rock.rotation.set(
          projectile.travelled * 3,
          projectile.travelled * 2 + projectile.id,
          0,
        );
      }
    }

    for (let i = rocks; i < this.rocks.length; i++) {
      this.rocks[i].visible = false;
    }

    for (let i = bottles; i < this.bottles.length; i++) {
      this.bottles[i].visible = false;
    }
  }

  public dispose(): void {
    this.rockGeometry.dispose();
    this.rockMaterial.dispose();
    disposeBottleParts(this.bottleParts);
    this.group.removeFromParent();
  }
}
