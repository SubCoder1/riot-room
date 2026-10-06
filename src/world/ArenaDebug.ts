import * as THREE from "three";

import {
  ARENA_HALF,
  allSolids,
  type ArenaLayout,
  type SpawnPoint,
} from "./ArenaLayout";
import { MIN_SPAWN_DISTANCE, SPAWN_CLEARANCE } from "./SpawnSystem";

function labelSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");

  canvas.width = 128;
  canvas.height = 64;

  const context = canvas.getContext("2d");

  if (context) {
    context.fillStyle = "rgba(0, 0, 0, 0.6)";
    context.fillRect(0, 0, 128, 64);
    context.fillStyle = color;
    context.font = "bold 40px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 64, 34);
  }

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      depthTest: false,
      transparent: true,
    }),
  );

  sprite.scale.set(1.4, 0.7, 1);
  sprite.renderOrder = 999;

  return sprite;
}

/** One spawn marker: a pole, a clearance ring and an "S1" label. */
export function createSpawnPoint(point: SpawnPoint): THREE.Group {
  const group = new THREE.Group();

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8),
    new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
  );

  pole.position.y = 0.9;
  group.add(pole);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(SPAWN_CLEARANCE - 0.06, SPAWN_CLEARANCE, 40),
    new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    }),
  );

  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);

  // Half the minimum start distance: two neighbouring rings touch when the
  // points are exactly MIN_SPAWN_DISTANCE apart.
  const spread = new THREE.Mesh(
    new THREE.RingGeometry(
      MIN_SPAWN_DISTANCE / 2 - 0.04,
      MIN_SPAWN_DISTANCE / 2,
      64,
    ),
    new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.2,
    }),
  );

  spread.rotation.x = -Math.PI / 2;
  spread.position.y = 0.03;
  group.add(spread);

  const label = labelSprite(point.label, "#fde68a");

  label.position.y = 2.3;
  group.add(label);

  group.position.set(point.x, point.y, point.z);

  return group;
}

/**
 * Development overlay for the arena: spawn points with their safety radius, the
 * playable boundary, collision footprints and platform heights. Hidden until
 * toggled (it shares the F4 debug key with the combat overlay).
 */
export class ArenaDebug {
  public readonly group = new THREE.Group();

  constructor(layout: ArenaLayout) {
    this.group.name = "ArenaDebug";
    this.group.visible = false;

    for (const point of layout.spawnPoints) {
      this.group.add(createSpawnPoint(point));
    }

    // Playable boundary.
    const h = ARENA_HALF;
    const boundary = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-h, 0.06, -h),
        new THREE.Vector3(h, 0.06, -h),
        new THREE.Vector3(h, 0.06, h),
        new THREE.Vector3(-h, 0.06, h),
      ]),
      new THREE.LineBasicMaterial({ color: 0xf87171 }),
    );

    this.group.add(boundary);

    // Collision boxes (wireframe) and the height of anything you can stand on.
    const wire = new THREE.LineBasicMaterial({ color: 0x38bdf8 });

    for (const solid of allSolids(layout)) {
      let width: number;
      let depth: number;
      let x: number;
      let z: number;

      if (solid.kind === "cylinder") {
        width = depth = solid.radius * 2;
        x = solid.x;
        z = solid.z;
      } else {
        width = solid.maxX - solid.minX;
        depth = solid.maxZ - solid.minZ;
        x = (solid.minX + solid.maxX) / 2;
        z = (solid.minZ + solid.maxZ) / 2;
      }

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(
          new THREE.BoxGeometry(width, solid.height, depth),
        ),
        wire,
      );

      edges.position.set(x, solid.height / 2, z);
      this.group.add(edges);
    }

    for (const platform of layout.platforms) {
      const tag = labelSprite(`+${platform.height.toFixed(1)}m`, "#7dd3fc");

      tag.position.set(
        (platform.minX + platform.maxX) / 2,
        platform.height + 0.8,
        (platform.minZ + platform.maxZ) / 2,
      );
      this.group.add(tag);
    }
  }

  public toggle(): void {
    this.group.visible = !this.group.visible;
  }
}
