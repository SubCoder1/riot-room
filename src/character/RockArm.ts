import * as THREE from "three";

import type { HeldKind, RockPose } from "../inventory/RockStance";
import {
  BOTTLE_SCALE,
  createBottle,
  createFlame,
  flickerScale,
  createBottleParts,
  createRockGeometry,
  createRockMaterial,
  disposeBottleParts,
  flickerFlame,
  type BottleParts,
} from "../vfx/ThrowableMeshes";

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Key positions of the throwing hand, in metres, relative to the shoulder (and
 * the hip for the pocket). F is the way the player looks (flat), R their right,
 * A the crosshair direction (pitch included).
 */
interface Frame {
  shoulder: THREE.Vector3;
  hips: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  aim: THREE.Vector3;
}

const ROCK_RADIUS = 0.062;
/** The rock sits this far beyond the wrist bone, along the forearm. */
const HELD_OFFSET = 0.09;

/**
 * The right arm's rock handling: a small procedural pose (hand to the pocket,
 * up to ready, out toward the crosshair, back and through for a throw) layered
 * on top of whatever animation is playing, plus the rock held in the hand.
 */
export class RockArm {
  /** Set by the character: first person keeps the loaded hand in view. */
  public firstPerson = false;

  /** Parented to the hand; holds the rock and the bottle, one shown at a time. */
  private holder: THREE.Group | null = null;
  private rock: THREE.Mesh | null = null;
  private bottle: THREE.Group | null = null;
  private bottleParts: BottleParts | null = null;
  /** A small flame at the left hand's fingers: the lighter that lights the rag. */
  private lighter: THREE.Group | null = null;
  private lighterHolder: THREE.Group | null = null;
  private litAt = 0;
  private wasLit = false;
  private readonly handQuat = new THREE.Quaternion();

  private readonly shoulder = new THREE.Vector3();
  private readonly leftShoulder = new THREE.Vector3();
  private readonly goal = new THREE.Vector3();
  private readonly elbow = new THREE.Vector3();
  private readonly wrist = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly key = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly pole = new THREE.Vector3();
  private readonly current = new THREE.Vector3();
  private readonly elbowNew = new THREE.Vector3();
  private readonly frame: Frame = {
    shoulder: new THREE.Vector3(),
    hips: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    aim: new THREE.Vector3(),
  };

  private readonly root: THREE.Object3D;
  private readonly rotateBoneBetween: (
    bone: THREE.Object3D,
    from: THREE.Vector3,
    to: THREE.Vector3,
  ) => void;

  constructor(
    root: THREE.Object3D,
    rotateBoneBetween: (
      bone: THREE.Object3D,
      from: THREE.Vector3,
      to: THREE.Vector3,
    ) => void,
  ) {
    this.root = root;
    this.rotateBoneBetween = rotateBoneBetween;
  }

  /**
   * Shows what is in the hand: the rock, the Molotov (lit or not), or nothing.
   * Created on first use.
   */
  public setHeld(kind: HeldKind | null, lit = false, lighting = false): void {
    if (!kind && !this.holder) {
      return;
    }

    const holder = this.ensureHolder();

    if (!holder || !this.rock || !this.bottle) {
      return;
    }

    this.updateLighter(lighting && kind === "molotov");

    holder.visible = kind !== null;
    this.rock.visible = kind === "rock";
    this.bottle.visible = kind === "molotov";

    if (kind !== "molotov") {
      this.wasLit = false;

      return;
    }

    const now = performance.now() / 1000;

    if (lit && !this.wasLit) {
      this.litAt = now;
    }

    this.wasLit = lit;

    // The bottle stays upright in the world whatever the hand does.
    const hand = holder.parent;

    if (hand) {
      hand.getWorldQuaternion(this.handQuat).invert();
      this.bottle.quaternion.copy(this.handQuat);
    }

    flickerFlame(this.bottle, now, lit, now - this.litAt);
  }

  /**
   * Where a thrown rock leaves the hand: the held rock's position. False if the
   * model is not ready.
   */
  public getReleasePoint(out: THREE.Vector3): boolean {
    const hand = this.root.getObjectByName("RightHand");
    const fore = this.root.getObjectByName("RightForeArm");

    if (!hand || !fore) {
      return false;
    }

    this.root.updateMatrixWorld(true);
    hand.getWorldPosition(out);
    fore.getWorldPosition(this.elbow);
    this.axis.subVectors(out, this.elbow).normalize();
    out.addScaledVector(this.axis, HELD_OFFSET);

    return true;
  }

  /**
   * Poses the arms. The right (throwing) hand goes to the pocket, ready,
   * cocked back beside the shoulder, through the throw. While aiming and
   * throwing the left arm points forward at the target, like someone lining
   * up a throw. Call after the animation and the look aiming, with the look
   * direction as a flat forward and the crosshair direction.
   */
  public apply(
    pose: RockPose,
    forward: THREE.Vector3,
    aim: THREE.Vector3,
  ): void {
    if (pose.weight < 0.002) {
      return;
    }

    const rightUpper = this.root.getObjectByName("RightArm");
    const leftUpper = this.root.getObjectByName("LeftArm");
    const hips = this.root.getObjectByName("Hips");

    if (!rightUpper || !leftUpper || !hips) {
      return;
    }

    this.root.updateMatrixWorld(true);

    const frame = this.frame;

    rightUpper.getWorldPosition(frame.shoulder);
    hips.getWorldPosition(frame.hips);
    leftUpper.getWorldPosition(this.leftShoulder);
    frame.right
      .subVectors(frame.shoulder, this.leftShoulder)
      .setY(0)
      .normalize();
    frame.forward.copy(forward);
    frame.aim.copy(aim);

    this.keyPosition(pose, frame, this.goal);
    this.pole
      .copy(frame.right)
      .multiplyScalar(0.55)
      .addScaledVector(UP, -0.85)
      .addScaledVector(frame.forward, -0.2);
    this.solve("Right", this.goal, pose.weight, this.pole);

    // Lighting a Molotov: the left hand comes across with a small flame to the rag.
    const lighting = pose.light * pose.weight;
    const flame = this.bottle?.getObjectByName("flame");

    if (lighting > 0.002 && flame) {
      flame.getWorldPosition(this.goal);
      this.goal
        .addScaledVector(frame.right, -0.1)
        .addScaledVector(UP, -0.07)
        .addScaledVector(frame.forward, -0.02);
      this.pole
        .copy(frame.right)
        .multiplyScalar(-0.5)
        .addScaledVector(UP, -0.85);
      this.solve("Left", this.goal, lighting, this.pole);
    }

    // The free arm points at the target while the throwing arm is loaded.
    const pointing = (pose.aim + pose.windup + pose.release) * pose.weight;

    if (pointing > 0.002) {
      this.goal
        .copy(this.leftShoulder)
        .addScaledVector(aim, 0.5)
        .addScaledVector(UP, -0.02)
        .addScaledVector(frame.right, -0.06);
      this.pole
        .copy(frame.right)
        .multiplyScalar(-0.4)
        .addScaledVector(UP, -0.9);
      this.solve("Left", this.goal, pointing, this.pole);
    }
  }

  /**
   * Two-bone solve for one arm: the hand goes toward `goal` (blended in by
   * `weight` from where the animation has it) and the elbow bends toward `pole`.
   */
  private solve(
    side: "Left" | "Right",
    goal: THREE.Vector3,
    weight: number,
    pole: THREE.Vector3,
  ): void {
    const upper = this.root.getObjectByName(side + "Arm");
    const fore = this.root.getObjectByName(side + "ForeArm");
    const hand = this.root.getObjectByName(side + "Hand");

    if (!upper || !fore || !hand) {
      return;
    }

    upper.getWorldPosition(this.shoulder);
    fore.getWorldPosition(this.elbow);
    hand.getWorldPosition(this.wrist);

    // Blend from where the animation has the hand to where the pose wants it.
    this.target.lerpVectors(this.wrist, goal, weight);

    const upperLength = this.elbow.distanceTo(this.shoulder);
    const foreLength = this.wrist.distanceTo(this.elbow);

    this.axis.subVectors(this.target, this.shoulder);

    const reach = THREE.MathUtils.clamp(
      this.axis.length(),
      Math.abs(upperLength - foreLength) + 0.02,
      (upperLength + foreLength) * 0.98,
    );

    this.axis.normalize();
    this.target.copy(this.shoulder).addScaledVector(this.axis, reach);

    // The elbow bends from where it is now toward the pole as the pose takes over.
    this.current.subVectors(this.elbow, this.shoulder);
    this.current.addScaledVector(this.axis, -this.current.dot(this.axis));

    pole.addScaledVector(this.axis, -pole.dot(this.axis));

    if (this.current.lengthSq() > 1e-6 && pole.lengthSq() > 1e-6) {
      this.current.normalize();
      pole.normalize();
      pole.lerpVectors(this.current, pole, weight);
    }

    pole.addScaledVector(this.axis, -pole.dot(this.axis));
    pole.normalize();

    // Along the shoulder-to-hand line, then out by the pole.
    const along =
      (upperLength * upperLength - foreLength * foreLength + reach * reach) /
      (2 * reach);
    const out = Math.sqrt(
      Math.max(upperLength * upperLength - along * along, 0),
    );

    this.elbowNew
      .copy(this.shoulder)
      .addScaledVector(this.axis, along)
      .addScaledVector(pole, out);

    this.rotateBoneBetween(
      upper,
      this.elbow.clone().sub(this.shoulder),
      this.elbowNew.clone().sub(this.shoulder),
    );

    this.root.updateMatrixWorld(true);

    fore.getWorldPosition(this.elbow);
    hand.getWorldPosition(this.wrist);

    this.rotateBoneBetween(
      fore,
      this.wrist.clone().sub(this.elbow),
      this.target.clone().sub(this.elbow),
    );

    this.root.updateMatrixWorld(true);
  }

  private keyPosition(
    pose: RockPose,
    frame: Frame,
    out: THREE.Vector3,
  ): THREE.Vector3 {
    const { shoulder, hips, forward, right, aim } = frame;

    out.set(0, 0, 0);

    // In the hip pocket.
    this.key
      .copy(hips)
      .addScaledVector(right, 0.2)
      .addScaledVector(UP, -0.02)
      .addScaledVector(forward, 0.04);
    out.addScaledVector(this.key, pose.pocket);

    // Lighting a Molotov: up near the chest, in front of the body.
    this.key
      .copy(shoulder)
      .addScaledVector(forward, this.firstPerson ? 0.5 : 0.34)
      .addScaledVector(UP, this.firstPerson ? -0.14 : 0)
      .addScaledVector(right, this.firstPerson ? 0.02 : -0.1);
    out.addScaledVector(this.key, pose.light);

    // Held ready, low in front of the chest.
    this.key
      .copy(shoulder)
      .addScaledVector(forward, 0.42)
      .addScaledVector(UP, -0.06)
      .addScaledVector(right, -0.02);
    out.addScaledVector(this.key, pose.ready);

    // Aiming: loaded, the hand cocked out beside the shoulder. In first person
    // it is held far enough forward to be seen at the right edge of the view,
    // so the aim line visibly comes from the rock.
    this.key
      .copy(shoulder)
      .addScaledVector(forward, this.firstPerson ? 0.55 : -0.05)
      .addScaledVector(UP, this.firstPerson ? -0.02 : 0.12)
      .addScaledVector(right, this.firstPerson ? 0.1 : 0.26);
    out.addScaledVector(this.key, pose.aim);

    // Wind-up: all the way back.
    this.key
      .copy(shoulder)
      .addScaledVector(forward, -0.3)
      .addScaledVector(UP, 0.18)
      .addScaledVector(right, 0.25);
    out.addScaledVector(this.key, pose.windup);

    // Release: the arm swings through toward the target.
    this.key
      .copy(shoulder)
      .addScaledVector(aim, 0.6)
      .addScaledVector(UP, -0.02)
      .addScaledVector(right, -0.04);
    out.addScaledVector(this.key, pose.release);

    return out;
  }

  /** Shows the lighter flame on the left hand while a Molotov is being lit. */
  private updateLighter(show: boolean): void {
    if (!show && !this.lighter) {
      return;
    }

    if (!this.lighter && !this.createLighter()) {
      return;
    }

    if (!this.lighter || !this.lighterHolder || !this.lighterHolder.parent) {
      return;
    }

    this.lighter.visible = show;

    if (show) {
      const time = performance.now() / 1000;

      // Upright in the world, whatever the hand does.
      this.lighterHolder.parent.getWorldQuaternion(this.handQuat).invert();
      this.lighterHolder.quaternion.copy(this.handQuat);
      this.lighter.scale.copy(flickerScale(time));
    }
  }

  private createLighter(): boolean {
    const hand = this.root.getObjectByName("LeftHand");
    const fore = this.root.getObjectByName("LeftForeArm");

    if (!hand || !fore || !this.bottleParts) {
      return false;
    }

    this.root.updateMatrixWorld(true);

    const holder = new THREE.Group();
    const flame = createFlame(this.bottleParts, 0.014, 0.05);

    holder.add(flame);

    // At the fingertips: a point just past the wrist, in the hand's own space.
    const wrist = hand.getWorldPosition(new THREE.Vector3());
    const elbow = fore.getWorldPosition(new THREE.Vector3());
    const beyond = wrist
      .clone()
      .add(wrist.clone().sub(elbow).normalize().multiplyScalar(HELD_OFFSET));

    holder.position.copy(hand.worldToLocal(beyond));

    const scale = hand.getWorldScale(new THREE.Vector3());

    holder.scale.set(1 / scale.x, 1 / scale.y, 1 / scale.z);

    hand.add(holder);
    this.lighterHolder = holder;
    this.lighter = flame;
    flame.visible = false;

    return true;
  }

  private ensureHolder(): THREE.Group | null {
    if (this.holder) {
      return this.holder;
    }

    const hand = this.root.getObjectByName("RightHand");
    const fore = this.root.getObjectByName("RightForeArm");

    if (!hand || !fore) {
      return null;
    }

    this.root.updateMatrixWorld(true);

    const holder = new THREE.Group();

    holder.name = "HeldItem";

    this.rock = new THREE.Mesh(
      createRockGeometry(ROCK_RADIUS),
      createRockMaterial(),
    );
    this.rock.frustumCulled = false;

    this.bottleParts = createBottleParts();
    this.bottle = createBottle(this.bottleParts);
    this.bottle.visible = false;
    // A little smaller in the hand than in flight, so it never fills the view.
    this.bottle.scale.setScalar(BOTTLE_SCALE * 0.7);

    holder.add(this.rock, this.bottle);

    // Parent it to the hand: it follows every animation. The offset is worked
    // out once, in the hand's own space, from a point just past the wrist.
    const wrist = hand.getWorldPosition(new THREE.Vector3());
    const elbow = fore.getWorldPosition(new THREE.Vector3());
    const beyond = wrist
      .clone()
      .add(wrist.clone().sub(elbow).normalize().multiplyScalar(HELD_OFFSET));

    holder.position.copy(hand.worldToLocal(beyond));

    // Undo the bone's scale (the skeleton may not be in metres).
    const scale = hand.getWorldScale(new THREE.Vector3());

    holder.scale.set(1 / scale.x, 1 / scale.y, 1 / scale.z);

    hand.add(holder);
    this.holder = holder;

    return holder;
  }

  public dispose(): void {
    if (!this.holder) {
      return;
    }

    this.holder.removeFromParent();
    this.lighterHolder?.removeFromParent();
    this.lighterHolder = null;
    this.lighter = null;
    this.rock?.geometry.dispose();
    (this.rock?.material as THREE.Material | undefined)?.dispose();

    if (this.bottleParts) {
      disposeBottleParts(this.bottleParts);
    }

    this.holder = null;
    this.rock = null;
    this.bottle = null;
    this.bottleParts = null;
  }
}
