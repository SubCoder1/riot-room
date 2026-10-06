import * as THREE from "three";

import { buildArena } from "./ArenaBuilder";
import { ARENA_LAYOUT, type ArenaLayout } from "./ArenaLayout";

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

    const ambientLight = new THREE.HemisphereLight(0xdfeeff, 0x111827, 1.5);
    ambientLight.position.set(0, 8, 0);
    this.group.add(ambientLight);

    // The arena is 40 m wide, so the key light's shadow box has to cover it.
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(14, 30, 18);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -32;
    keyLight.shadow.camera.right = 32;
    keyLight.shadow.camera.top = 32;
    keyLight.shadow.camera.bottom = -32;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 80;
    this.group.add(keyLight);

    // A soft fill from the other side so shaded faces and ramps stay readable.
    const fillLight = new THREE.DirectionalLight(0x9db4d6, 0.6);
    fillLight.position.set(-16, 14, -12);
    this.group.add(fillLight);

    const rimLight = new THREE.PointLight(0x7dd3fc, 1.2, 60, 2);
    rimLight.position.set(-12, 5, -10);
    this.group.add(rimLight);
  }
}
