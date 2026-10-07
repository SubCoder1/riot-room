import * as THREE from "three";

import type { ProjectileSystem } from "../combat/Projectiles";
import { ROCK_CONFIG } from "../combat/RockConfig";

/**
 * Draws the rocks in flight. A fixed pool of meshes (no allocation per throw)
 * that only reads the projectile system.
 */
export class RockProjectileView {
  public readonly group = new THREE.Group();

  private readonly meshes: THREE.Mesh[] = [];
  private readonly geometry = new THREE.IcosahedronGeometry(
    ROCK_CONFIG.ROCK_RADIUS,
    1,
  );
  private readonly material = new THREE.MeshStandardMaterial({
    color: 0x8d8b84,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  });
  private readonly projectiles: ProjectileSystem;

  constructor(projectiles: ProjectileSystem) {
    this.projectiles = projectiles;

    for (let i = 0; i < ROCK_CONFIG.ROCK_MAX_ACTIVE; i++) {
      const mesh = new THREE.Mesh(this.geometry, this.material);

      mesh.visible = false;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
  }

  public update(): void {
    const active = this.projectiles.active;

    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      const rock = active[i];

      mesh.visible = rock !== undefined;

      if (rock) {
        mesh.position.copy(rock.position);
        // Tumbling, a little differently for each rock.
        mesh.rotation.set(rock.travelled * 3, rock.travelled * 2 + rock.id, 0);
      }
    }
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.group.removeFromParent();
  }
}
