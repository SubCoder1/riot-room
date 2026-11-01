import * as THREE from "three";

import { createDynamite } from "./DynamiteMesh";
import { IgnitionSpark } from "./IgnitionSpark";

/**
 * The dynamite bundle once it is planted on the breach surface: the same
 * bundle that lies in the Armory, set flat against the surface with its length
 * across it, and, once lit, a small flame on the fuse's tip. Hidden until it
 * is planted; placed from the surface's point and normal, so it is the same
 * every time.
 */

/** Where the fuse's tip is in the bundle's own space (see createDynamite). */
const FUSE_TIP = new THREE.Vector3(0.2, 0.056, 0);
/** Where the wire leaves the sticks (the flame's end of the road). */
const FUSE_BASE = new THREE.Vector3(0.112, 0.0355, 0);
/** The planted bundle is drawn this much larger than the one on the table. */
export const PLANTED_SCALE = 1.7;

export class PlantedCharge {
  public readonly group = new THREE.Group();

  private readonly bundle = createDynamite();
  private readonly flame: THREE.Mesh;
  private readonly final = new THREE.Vector3();
  private lit = false;
  private litAt = 0;
  private readonly spark = new IgnitionSpark(0.02);
  private readonly down = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();

  constructor() {
    const geometry = new THREE.ConeGeometry(0.007, 0.035, 8);

    geometry.translate(0, 0.025, 0);
    this.flame = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0xffa83a,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    this.flame.position.copy(FUSE_TIP);
    this.flame.visible = false;
    this.flame.frustumCulled = false;
    // Bigger than the one in the hand or on the table, so it reads on the wall.
    this.bundle.scale.setScalar(PLANTED_SCALE);
    this.bundle.add(this.flame, this.spark.group);
    this.spark.group.position.copy(FUSE_TIP);
    this.group.add(this.bundle);
    this.group.name = "planted-charge";
    this.group.visible = false;
  }

  /**
   * Sets the bundle on the surface at `point` whose normal is `normal` (the
   * way it faces, away from the surface): its back against the surface and its
   * length running across it (level, or along the wall), and shows it.
   */
  public plant(point: THREE.Vector3, normal: THREE.Vector3): void {
    const facing = normal.clone().normalize();
    // Across the surface: level if there is a level way across it.
    const reference =
      Math.abs(facing.y) > 0.9
        ? new THREE.Vector3(0, 0, 1)
        : new THREE.Vector3(0, 1, 0);
    const along = reference.clone().cross(facing).normalize();
    const third = new THREE.Vector3().crossVectors(along, facing);

    // Local x runs along the surface, local y away from it, local z the rest.
    this.group.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(along, facing, third),
    );
    // The bundle's base is at its y = 0, so its back rests on the surface.
    this.group.position.copy(point);
    this.final.copy(point);
    this.burn(0);
    this.lit = false;
    this.flame.visible = false;
    this.group.visible = true;
  }

  /**
   * The bundle is being set down: `t` (0 to 1) of the way from the hand's
   * position `from` to its place on the surface.
   */
  public settle(from: THREE.Vector3, t: number): void {
    const k = Math.min(Math.max(t, 0), 1);

    this.group.position.lerpVectors(from, this.final, k * k * (3 - 2 * k));
  }

  /** Where the burning wire's spark is now (false when it is not sparking). */
  public sparkPoint(out: THREE.Vector3): boolean {
    if (!this.lit || !this.group.visible) {
      return false;
    }

    this.spark.group.getWorldPosition(out);

    return true;
  }

  /**
   * The flame creeps down the wire into the bundle: `t` is 0 at the tip and 1
   * when it has reached the sticks (the wire is shorter as it burns).
   */
  public burn(t: number): void {
    const k = Math.min(Math.max(t, 0), 1);

    this.flame.position.lerpVectors(FUSE_TIP, FUSE_BASE, k);
    this.spark.group.position.copy(this.flame.position);
    this.bundle.getObjectByName("fuse")?.scale.setY(Math.max(1 - k, 0.04));
  }

  /** The fuse is lit: a small flame on its tip. */
  public ignite(): void {
    if (this.group.visible && !this.lit) {
      this.lit = true;
      this.litAt = performance.now() / 1000;
      this.flame.visible = true;
    }
  }

  /** Takes it away (a new round, or once it has gone off). */
  public hide(): void {
    this.lit = false;
    this.flame.visible = false;
    this.spark.update(null);
    this.group.visible = false;
  }

  public get isShown(): boolean {
    return this.group.visible;
  }

  /** The fuse's tip in the world: where the lighter goes. */
  public fuseTip(out: THREE.Vector3): THREE.Vector3 {
    this.group.updateMatrixWorld(true);

    return out.copy(FUSE_TIP).applyMatrix4(this.bundle.matrixWorld);
  }

  /** The flame flickers (call every frame while lit). */
  public update(time: number): void {
    if (!this.lit) {
      return;
    }

    // The wire sparks without a break all the way down, arcing to the floor.
    this.turn.copy(this.group.quaternion).invert();
    this.spark.setDown(this.down.set(0, -1, 0).applyQuaternion(this.turn));
    this.spark.update(Math.max(time - this.litAt, 0));

    const flicker =
      0.85 + 0.15 * Math.sin(time * 38) + 0.08 * Math.sin(time * 61);

    this.flame.scale.set(flicker, 0.9 + 0.3 * flicker, flicker);
  }

  public dispose(): void {
    this.spark.dispose();
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;

      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
    this.group.removeFromParent();
  }
}
