import * as THREE from "three";

/**
 * Rainwater dripping through the Armory's vent grille: a few single drops, each
 * leaving one gap in the grille now and then (never together, never in a loop),
 * falling to the floor and opening one small ring where they land. Four drops
 * and four rings, all made once; nothing is made while it runs.
 */

export interface DripPoint {
  x: number;
  z: number;
}

type Phase = "wait" | "fall" | "splash";

interface Drip {
  point: DripPoint;
  phase: Phase;
  /** Seconds left to wait, or into the splash. */
  timer: number;
  y: number;
  speed: number;
  drop: THREE.Mesh;
  ring: THREE.Mesh;
}

const GRAVITY = 9.8;
const SPLASH_SECONDS = 0.55;

export class VentDrips {
  public readonly group = new THREE.Group();

  private readonly drips: Drip[] = [];
  private readonly dropGeometry = new THREE.CylinderGeometry(
    0.006,
    0.006,
    0.07,
    5,
  );
  private readonly ringGeometry = new THREE.RingGeometry(0.022, 0.03, 20);
  private readonly dropMaterial = new THREE.MeshBasicMaterial({
    color: 0xcfe0ee,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    fog: false,
  });
  private readonly ceilingY: number;
  private readonly floorY: number;
  private readonly random: () => number;

  public constructor(
    points: readonly DripPoint[],
    ceilingY: number,
    floorY: number,
    random: () => number = Math.random,
  ) {
    this.ceilingY = ceilingY;
    this.floorY = floorY;
    this.random = random;
    this.group.name = "ArmoryVentDrips";

    for (const point of points) {
      const drop = new THREE.Mesh(this.dropGeometry, this.dropMaterial);
      const ring = new THREE.Mesh(
        this.ringGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xbcd0e0,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false,
        }),
      );

      drop.visible = false;
      drop.frustumCulled = false;
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(point.x, floorY + 0.014, point.z);
      ring.visible = false;
      this.group.add(drop, ring);
      this.drips.push({
        point,
        phase: "wait",
        // Staggered, so they never start together.
        timer: 1 + this.random() * 7,
        y: ceilingY,
        speed: 0,
        drop,
        ring,
      });
    }
  }

  /** How long the next drop waits: seconds, uneven. */
  private nextWait(): number {
    return 2.5 + this.random() * 6.5;
  }

  /** Moves every drop on by `dt` seconds. */
  public update(dt: number): void {
    for (const drip of this.drips) {
      if (drip.phase === "wait") {
        drip.timer -= dt;

        if (drip.timer <= 0) {
          drip.phase = "fall";
          drip.y = this.ceilingY;
          drip.speed = 0.3;
          drip.drop.visible = true;
        }
      }

      if (drip.phase === "fall") {
        drip.speed += GRAVITY * dt;
        drip.y -= drip.speed * dt;

        if (drip.y <= this.floorY + 0.03) {
          drip.phase = "splash";
          drip.timer = 0;
          drip.drop.visible = false;
          drip.ring.visible = true;
        } else {
          drip.drop.position.set(drip.point.x, drip.y, drip.point.z);
          // Stretched a little as it speeds up.
          drip.drop.scale.y = 1 + Math.min(drip.speed * 0.25, 1.6);
        }
      }

      if (drip.phase === "splash") {
        drip.timer += dt;

        const t = drip.timer / SPLASH_SECONDS;
        const material = drip.ring.material as THREE.MeshBasicMaterial;

        drip.ring.scale.setScalar(1 + t * 5);
        material.opacity = 0.45 * Math.max(0, 1 - t);

        if (t >= 1) {
          drip.phase = "wait";
          drip.timer = this.nextWait();
          drip.ring.visible = false;
        }
      }
    }
  }

  /** What each drip is doing (for tests). */
  public states(): Array<{ phase: Phase; y: number }> {
    return this.drips.map((drip) => ({ phase: drip.phase, y: drip.y }));
  }

  public dispose(): void {
    this.dropGeometry.dispose();
    this.ringGeometry.dispose();
    this.dropMaterial.dispose();

    for (const drip of this.drips) {
      (drip.ring.material as THREE.Material).dispose();
    }

    this.group.removeFromParent();
  }
}
