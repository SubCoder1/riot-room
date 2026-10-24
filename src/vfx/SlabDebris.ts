import * as THREE from "three";

import {
  CEILING_SLAB_AREA,
  CEILING_SLAB_FLOOR,
  CEILING_SLAB_TOP,
} from "../world/CeilingSlab";
import { createWoodMaterials } from "../world/CeilingSlabMesh";
import { mulberry32 } from "../world/materials/ConcreteTexture";

const PIECES = 22;
const GRAVITY = 14;

interface Piece {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  /** Half the piece's thinnest side: how high its centre rests above the floor. */
  rest: number;
  settled: boolean;
}

/**
 * The splinters of the broken wooden slab: a restrained handful of board
 * pieces that drop through the opening and lie on the Generator Room's floor.
 * Seeded, so every client that spawns them sees the same pieces fall the same
 * way. They stay for the round (`clear` removes them for the next).
 */
export class SlabDebris {
  public readonly group = new THREE.Group();

  private readonly pieces: Piece[] = [];
  private readonly woods = createWoodMaterials();
  private readonly geometries: THREE.BoxGeometry[] = [];

  public get active(): boolean {
    return this.pieces.length > 0;
  }

  /** The slab breaks: its boards fall from where it was. */
  public spawn(): void {
    this.clear();

    const area = CEILING_SLAB_AREA;
    const random = mulberry32(3319);

    for (let i = 0; i < PIECES; i++) {
      const length = 0.15 + random() * 0.4;
      const width = 0.05 + random() * 0.1;
      const thickness = 0.03 + random() * 0.03;
      const geometry = new THREE.BoxGeometry(width, thickness, length);
      const mesh = new THREE.Mesh(geometry, this.woods[i % this.woods.length]);

      mesh.position.set(
        area.minX + 0.15 + random() * (area.maxX - area.minX - 0.3),
        CEILING_SLAB_TOP - 0.1 - random() * 0.2,
        area.minZ + 0.15 + random() * (area.maxZ - area.minZ - 0.3),
      );
      mesh.rotation.set(random() * 3, random() * 3, random() * 3);
      mesh.castShadow = false;
      this.geometries.push(geometry);
      this.group.add(mesh);
      this.pieces.push({
        mesh,
        velocity: new THREE.Vector3(
          (random() - 0.5) * 1.6,
          -random() * 1.5,
          (random() - 0.5) * 1.6,
        ),
        spin: new THREE.Vector3(
          (random() - 0.5) * 9,
          (random() - 0.5) * 9,
          (random() - 0.5) * 9,
        ),
        rest: thickness / 2,
        settled: false,
      });
    }
  }

  public update(dt: number): void {
    for (const piece of this.pieces) {
      if (piece.settled) {
        continue;
      }

      piece.velocity.y -= GRAVITY * dt;
      piece.mesh.position.addScaledVector(piece.velocity, dt);
      piece.mesh.rotation.x += piece.spin.x * dt;
      piece.mesh.rotation.y += piece.spin.y * dt;
      piece.mesh.rotation.z += piece.spin.z * dt;

      const floor = CEILING_SLAB_FLOOR + piece.rest;

      if (piece.mesh.position.y <= floor) {
        // It lands flat and lies where it fell.
        piece.mesh.position.y = floor;
        piece.mesh.rotation.x = 0;
        piece.mesh.rotation.z = 0;
        piece.settled = true;
      }
    }
  }

  /** A new round: the pieces are gone (the slab is whole again). */
  public clear(): void {
    for (const piece of this.pieces) {
      piece.mesh.removeFromParent();
    }

    this.pieces.length = 0;
    this.geometries.forEach((geometry) => geometry.dispose());
    this.geometries.length = 0;
  }

  public dispose(): void {
    this.clear();
    this.woods.forEach((material) => material.dispose());
    this.group.removeFromParent();
  }
}
