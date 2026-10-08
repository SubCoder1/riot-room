import * as THREE from "three";

import { buildArena } from "./ArenaBuilder";
import type { ArenaLayout } from "./ArenaLayout";
import { ARENA_LAYOUT } from "./UpperFloorMap";

/**
 * The combat arena: graybox geometry built from the shared layout, plus its
 * lights. Collision lives in ArenaCollision and spawn points in SpawnSystem;
 * all three read the same ArenaLayout.
 */
export class Arena {
  public readonly group: THREE.Group;

  private readonly layout: ArenaLayout;

  constructor(layout: ArenaLayout = ARENA_LAYOUT) {
    this.layout = layout;
    this.group = new THREE.Group();
    this.buildArena();
  }

  private buildArena(): void {
    this.group.add(buildArena(this.layout));

    const ambientLight = new THREE.HemisphereLight(0xdfeeff, 0x111827, 1.3);
    ambientLight.position.set(0, 8, 0);
    this.group.add(ambientLight);

    // The map is 64 x 48 m, so the key light's shadow box has to cover it.
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(18, 40, 22);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(4096, 4096);
    keyLight.shadow.camera.left = -42;
    keyLight.shadow.camera.right = 42;
    keyLight.shadow.camera.top = 36;
    keyLight.shadow.camera.bottom = -36;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 110;
    this.group.add(keyLight);

    // A soft fill from the other side so shaded faces and ramps stay readable.
    const fillLight = new THREE.DirectionalLight(0x9db4d6, 0.6);
    fillLight.position.set(-16, 14, -12);
    this.group.add(fillLight);

    const rimLight = new THREE.PointLight(0x7dd3fc, 1.2, 80, 2);
    rimLight.position.set(-12, 9, -10);
    this.group.add(rimLight);
  }
}
