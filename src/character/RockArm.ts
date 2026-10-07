import * as THREE from "three";

import type { RockPose } from "../inventory/RockStance";

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

  private mesh: THREE.Mesh | null = null;

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

  /** Shows or hides the rock in the hand (created on first use). */
  public setHeld(visible: boolean): void {
    if (!visible && !this.mesh) {
      return;
    }

    const mesh = this.ensureMesh();

    if (mesh) {
      mesh.visible = visible;
    }
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
      .addScaledVector(UP, this.firstPerson ? -0.05 : 0.12)
      .addScaledVector(right, this.firstPerson ? 0.2 : 0.26);
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

  private ensureMesh(): THREE.Mesh | null {
    if (this.mesh) {
      return this.mesh;
    }

    const hand = this.root.getObjectByName("RightHand");
    const fore = this.root.getObjectByName("RightForeArm");

    if (!hand || !fore) {
      return null;
    }

    this.root.updateMatrixWorld(true);

    const geometry = new THREE.IcosahedronGeometry(ROCK_RADIUS, 1);
    const position = geometry.getAttribute("position");

    // A lumpy rock rather than a ball (stable: depends on the vertex only).
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const bump =
        1 + 0.18 * Math.sin(x * 97 + y * 53) * Math.cos(z * 71 + x * 29);

      position.setXYZ(i, x * bump * 1.1, y * bump * 0.85, z * bump);
    }

    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: 0x8d8b84,
        roughness: 0.95,
        metalness: 0,
        flatShading: true,
      }),
    );

    mesh.name = "HeldRock";
    mesh.frustumCulled = false;

    // Parent it to the hand: it follows every animation. The offset is worked
    // out once, in the hand's own space, from a point just past the wrist.
    const wrist = hand.getWorldPosition(new THREE.Vector3());
    const elbow = fore.getWorldPosition(new THREE.Vector3());
    const beyond = wrist
      .clone()
      .add(wrist.clone().sub(elbow).normalize().multiplyScalar(HELD_OFFSET));

    mesh.position.copy(hand.worldToLocal(beyond));

    // Undo the bone's scale (the skeleton may not be in metres).
    const scale = hand.getWorldScale(new THREE.Vector3());

    mesh.scale.set(1 / scale.x, 1 / scale.y, 1 / scale.z);

    hand.add(mesh);
    this.mesh = mesh;

    return mesh;
  }

  public dispose(): void {
    if (!this.mesh) {
      return;
    }

    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh = null;
  }
}
