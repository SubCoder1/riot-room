import * as THREE from "three";

import type { HeldKind, ThrowPose } from "../inventory/ThrowStance";
import { createDynamite } from "../vfx/DynamiteMesh";
import { BREACH_TIMING } from "../mission/Breach";
import { IgnitionSpark } from "../vfx/IgnitionSpark";
import {
  BOTTLE_SCALE,
  createBottle,
  createFlame,
  flickerScale,
  createBottleParts,
  createGrenade,
  createGrenadeParts,
  createSmokeCanister,
  disposeBottleParts,
  disposeGrenadeParts,
  flickerFlame,
  GRENADE_SCALE,
  SMOKE_SCALE,
  type BottleParts,
  type GrenadeParts,
} from "../vfx/ThrowableMeshes";

const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * How the dynamite bundle stands in the hand: upright, its length (and the
 * wire at its top end) up, leaning a little forward and to the left of the
 * view. `lean` is how far it leans from vertical, `turn` toward which side (0
 * forward, positive to the player's left).
 */
const CARRY_LEAN = 0.3;
const CARRY_TURN = 0.2;
/** Half the bundle's height: its centre is this far above its base (model space). */
const BUNDLE_MID = 0.0355;
/** The wire's tip in the bundle's own space (see createDynamite). */
const WIRE_TIP = new THREE.Vector3(0.2, 0.056, 0);
/** The lighter is drawn larger than life so it reads in the hand. */
const LIGHTER_SCALE = 1.8;
/** The flame's middle, in the lighter's own space: where it should meet the wire. */
const FLAME_MID = new THREE.Vector3(0, 0.06, 0);
/** The lighting sequence's beats, as fractions of its length. */
const BEAT = {
  /** The lighter is flicked twice: the first only sparks, the second lights. */
  FLICK_1: 0.12,
  FLICK_2: 0.24,
  SPARK: 0.42,
  LIGHTER_OFF: 0.62,
  PLACED: 0.8,
} as const;
/** Seconds the hands take to ease back after the lighting is stopped. */
const RELEASE_SECONDS = 0.45;
/** A held bundle is drawn a little smaller than it lies on the table. */
const HELD_DYNAMITE = 0.78;

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

/** A grenade is drawn a little smaller in the hand than in flight. */
const HELD_GRENADE = 0.78;
/** The held item sits this far beyond the wrist bone, along the forearm. */
const HELD_OFFSET = 0.09;

/**
 * The right arm's throwable handling: a small procedural pose (hand to the
 * pocket, up to ready, out toward the crosshair, back and through for a throw)
 * layered on top of whatever animation is playing, plus the grenade, Molotov
 * or smoke grenade held in the hand.
 */
export class ThrowArm {
  /** Set by the character: first person keeps the loaded hand in view. */
  public firstPerson = false;

  /** Parented to the hand; holds the three items, one shown at a time. */
  private holder: THREE.Group | null = null;
  private grenade: THREE.Group | null = null;
  private canister: THREE.Group | null = null;
  private bottle: THREE.Group | null = null;
  private dynamite: THREE.Group | null = null;
  /** A small lighter, in the hand only while the dynamite is being lit. */
  private lighterProp: THREE.Group | null = null;
  private lighterFlame: THREE.Group | null = null;
  private ignition: { progress: number; target: THREE.Vector3 } | null = null;
  /** The lighter's own hand: the left, holding it for the sequence. */
  private lighterHand: THREE.Group | null = null;
  private spark: IgnitionSpark | null = null;
  /** Easing back to rest after a lighting that was stopped: 1 to 0 over RELEASE_SECONDS. */
  private releasing = false;
  private releaseLeft = 0;
  private releaseAt = 0;
  /** Sparks at the lighter's wheel at each flick. */
  private lighterSpark: IgnitionSpark | null = null;
  private readonly jerkTurn = new THREE.Quaternion();
  private wireFlame: THREE.Mesh | null = null;
  /** Nudges the lighter hand until the flame is on the wire, whatever the arm does. */
  private readonly lighterNudge = new THREE.Vector3();
  private readonly tip = new THREE.Vector3();
  private readonly flameAt = new THREE.Vector3();
  private readonly tilt = new THREE.Quaternion();
  private readonly carryTurn = new THREE.Quaternion();
  private readonly carryLean = new THREE.Quaternion();
  private readonly ignitionGoal = new THREE.Vector3();
  private readonly ignitionFrom = new THREE.Vector3();
  private readonly ignitionTo = new THREE.Vector3();
  private bottleParts: BottleParts | null = null;
  private grenadeParts: GrenadeParts | null = null;
  /** A small flame at the left hand's fingers: the lighter that lights the rag. */
  private lighter: THREE.Group | null = null;
  private lighterHolder: THREE.Group | null = null;
  private litAt = 0;
  private heldKind: HeldKind | null = null;
  private readonly pinTarget = new THREE.Vector3();
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
   * Shows what is in the hand: the grenade, the Molotov (lit or not), the
   * smoke grenade, or nothing.
   * Created on first use.
   */
  public setHeld(
    kind: HeldKind | null,
    lit = false,
    lighting = false,
    pinPull = 0,
  ): void {
    if (!kind && !this.holder) {
      return;
    }

    const holder = this.ensureHolder();

    if (
      !holder ||
      !this.grenade ||
      !this.canister ||
      !this.bottle ||
      !this.dynamite
    ) {
      return;
    }

    this.updateLighter(lighting && kind === "molotov");

    holder.visible = kind !== null;
    this.grenade.visible = kind === "grenade";
    this.canister.visible = kind === "smoke";
    this.bottle.visible = kind === "molotov";
    this.dynamite.visible = kind === "dynamite";

    this.heldKind = kind;

    if (kind === "dynamite") {
      this.wasLit = false;
      this.carryDynamite(holder, this.dynamite);

      return;
    }

    if (kind === "smoke" || kind === "grenade") {
      // Like the bottle, the grenade stays upright in the world whatever the
      // hand does: it is carried up to the chest and the pin is pulled.
      const item = kind === "smoke" ? this.canister : this.grenade;

      this.wasLit = false;
      this.keepUpright(holder, item);
      this.pullPin(item, pinPull);

      return;
    }

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
    this.keepUpright(holder, this.bottle);

    flickerFlame(this.bottle, now, lit, now - this.litAt);
  }

  /**
   * Where the lit Molotov's flame is in the world, for the light it gives. False
   * when no Molotov is held or it is not lit.
   */
  public getHeldFlame(out: THREE.Vector3): boolean {
    const flame = this.bottle?.getObjectByName("flame");

    if (
      this.heldKind !== "molotov" ||
      !this.bottle?.visible ||
      !flame?.visible
    ) {
      return false;
    }

    flame.updateWorldMatrix(true, false);
    flame.getWorldPosition(out);

    return true;
  }

  /**
   * Where a thrown item leaves the hand: the held item's position. False if
   * the model is not ready.
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
    pose: ThrowPose,
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

    // Preparing it: the left hand comes across to the rag of a Molotov (with a
    // small flame) or to the cap of a smoke grenade (to pull its pin).
    const lighting = pose.light * pose.weight;
    const flame =
      this.heldKind === "smoke"
        ? this.canister
        : this.heldKind === "grenade"
          ? this.grenade
          : this.bottle?.getObjectByName("flame");

    if (lighting > 0.002 && flame) {
      flame.getWorldPosition(this.goal);

      if (this.heldKind === "smoke") {
        // The cap is at the top of the canister (the group's centre is its middle).
        this.goal.y += 0.1 * SMOKE_SCALE * 0.7;
      } else if (this.heldKind === "grenade") {
        this.goal.y += 0.085 * GRENADE_SCALE * HELD_GRENADE;
      }

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

  private readonly lookUp = new THREE.Vector3();

  private keyPosition(
    pose: ThrowPose,
    frame: Frame,
    out: THREE.Vector3,
  ): THREE.Vector3 {
    const { shoulder, hips, right, aim } = frame;

    // In first person the hand is held where the view is: ahead and below the
    // line of sight, tipping up and down with it exactly as the left hand and
    // the body do (a flat forward left the right hand hanging in place while
    // the view looked up or down). Seen from outside it keeps the flat frame.
    const forward = this.firstPerson ? aim : frame.forward;
    const up = this.firstPerson
      ? this.lookUp.crossVectors(right, aim).normalize()
      : UP;

    out.set(0, 0, 0);

    // In the hip pocket.
    this.key
      .copy(hips)
      .addScaledVector(right, 0.2)
      .addScaledVector(UP, -0.02)
      .addScaledVector(frame.forward, 0.04);
    out.addScaledVector(this.key, pose.pocket);

    // Lighting a Molotov: up near the chest, in front of the body.
    this.key
      .copy(shoulder)
      .addScaledVector(forward, this.firstPerson ? 0.5 : 0.34)
      .addScaledVector(up, this.firstPerson ? -0.14 : 0)
      .addScaledVector(right, this.firstPerson ? 0.02 : -0.1);
    out.addScaledVector(this.key, pose.light);

    // Held ready, low in front of the chest.
    this.key
      .copy(shoulder)
      .addScaledVector(forward, 0.42)
      .addScaledVector(up, -0.06)
      .addScaledVector(right, -0.02);
    out.addScaledVector(this.key, pose.ready);

    // Aiming: loaded, the hand cocked out beside the shoulder. In first person
    // it is held far enough forward to be seen at the right edge of the view,
    // so the aim line visibly comes from the item.
    this.key
      .copy(shoulder)
      .addScaledVector(forward, this.firstPerson ? 0.55 : -0.05)
      .addScaledVector(up, this.firstPerson ? -0.02 : 0.12)
      .addScaledVector(right, this.firstPerson ? 0.1 : 0.26);
    out.addScaledVector(this.key, pose.aim);

    // Wind-up: all the way back.
    this.key
      .copy(shoulder)
      .addScaledVector(frame.forward, -0.3)
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

  /**
   * The smoke grenade's pin: it is in the cap at 0, and as `pull` goes to 1 it
   * is drawn out toward the left hand (the one that pulls it) and is gone.
   * Every equip starts with it back in, so the pull plays every time.
   */
  private pullPin(canister: THREE.Group, pull: number): void {
    const pin = canister.getObjectByName("pin");
    const hand = this.root.getObjectByName("LeftHand");

    if (!pin) {
      return;
    }

    // Each item remembers where its own pin sits when it is in.
    const home = (pin.userData.home ??= pin.position.clone()) as THREE.Vector3;

    pin.visible = pull < 0.97;

    if (pull <= 0 || !hand) {
      pin.position.copy(home);

      return;
    }

    hand.getWorldPosition(this.pinTarget);
    canister.worldToLocal(this.pinTarget);

    // Out and toward the hand, with a little lift at the start of the pull.
    pin.position.lerpVectors(home, this.pinTarget, pull * pull);
    pin.position.y += 0.02 * Math.sin(Math.min(pull, 1) * Math.PI);
  }

  /**
   * The dynamite bundle stands upright in the hand, whatever the hand does:
   * the hand's own turn is undone, the player's facing is put in, and the
   * bundle is stood on its end with a slight lean forward and to the left.
   * The hand holds it a little below its middle.
   */
  private carryDynamite(
    holder: THREE.Group,
    item: THREE.Group,
    lean = CARRY_LEAN,
    turn = CARRY_TURN,
  ): void {
    const hand = holder.parent;

    if (!hand) {
      return;
    }

    hand.getWorldQuaternion(this.handQuat).invert();
    this.root.getWorldQuaternion(this.carryFacing);
    // Its length (model x) up, then leaned over toward forward and left.
    this.carryLean.setFromAxisAngle(Z_AXIS, Math.PI / 2 - lean);
    this.carryTurn.setFromAxisAngle(UP, -Math.PI / 2 + turn);
    item.quaternion
      .copy(this.handQuat)
      .multiply(this.carryFacing)
      .multiply(this.carryTurn)
      .multiply(this.carryLean);

    // The bundle's middle in the palm, a little toward its base.
    item.position
      .set(-0.025 / HELD_DYNAMITE, BUNDLE_MID, 0)
      .applyQuaternion(item.quaternion)
      .multiplyScalar(-HELD_DYNAMITE);
  }

  private readonly carryFacing = new THREE.Quaternion();

  /**
   * The dynamite's lighting and placing: `progress` runs 0 to 1 through the
   * sequence and `target` is where the bundle ends up on the breach surface.
   * Null when not under way. The lighter is a prop of this sequence only:
   * nothing else can show or use it.
   */
  public setIgnition(progress: number | null, target?: THREE.Vector3): void {
    if (progress === null || !target) {
      if (this.releasing) {
        return;
      }

      // Stopped part-way (the key was let go): the hands ease back to rest
      // rather than snapping (see applyIgnition). Done, or never started: gone.
      if (this.ignition && this.ignition.progress < 0.9) {
        this.releasing = true;
        this.releaseLeft = 1;
        this.releaseAt = performance.now();
      } else {
        this.ignition = null;
        this.lighterNudge.set(0, 0, 0);

        if (this.lighterProp) {
          this.lighterProp.visible = false;
        }
      }

      this.spark?.update(null);
      this.lighterSpark?.update(null);

      if (this.wireFlame) {
        this.wireFlame.visible = false;
      }

      return;
    }

    this.releasing = false;
    this.ignition ??= { progress: 0, target: new THREE.Vector3() };
    this.ignition.progress = progress;
    this.ignition.target.copy(target);
  }

  /** Something is held in the throwing hand. */
  public get isHolding(): boolean {
    return this.heldKind !== null;
  }

  /** The lighting is under way, or the hands are still easing back from it. */
  public get isIgnitionActive(): boolean {
    return this.ignition !== null;
  }

  /** Where the held bundle's spark is (false when it is not sparking). */
  public getSparkPoint(out: THREE.Vector3): boolean {
    if (!this.spark?.group.visible || !this.dynamite?.visible) {
      return false;
    }

    this.spark.group.getWorldPosition(out);

    return true;
  }

  /** The held bundle's middle in the world (false when it is not in the hand). */
  public getBundlePoint(out: THREE.Vector3): boolean {
    if (!this.dynamite?.visible) {
      return false;
    }

    this.dynamite.getWorldPosition(out);

    return true;
  }

  /**
   * One sequence through the right hand and the left: the right brings the
   * upright bundle up in front of the chest and tips it only as far as it takes
   * to show the wire; the left brings the lighter up from the hip, flicks it
   * and puts the flame on the wire; the wire sparks; the lighter drops away and
   * the right hand sets the bundle against the surface, lets go and withdraws.
   * Call after the animation and the look aiming.
   */
  public applyIgnition(forward: THREE.Vector3, aim: THREE.Vector3): void {
    const ignition = this.ignition;
    const holder = this.ensureHolder();
    const dynamite = this.dynamite;
    const lighter = this.lighterProp;
    const flame = this.lighterFlame;

    if (!ignition || !holder || !dynamite || !lighter || !flame) {
      return;
    }

    const rightUpper = this.root.getObjectByName("RightArm");
    const leftUpper = this.root.getObjectByName("LeftArm");
    const hips = this.root.getObjectByName("Hips");

    if (!rightUpper || !leftUpper || !hips) {
      return;
    }

    // After a stop the pose is held where it was and eased out: the arms'
    // weights fall away to nothing, the bundle straightens, the lighter goes.
    let ease = 1;

    if (this.releasing) {
      const now = performance.now();

      this.releaseLeft -=
        Math.min((now - this.releaseAt) / 1000, 0.05) / RELEASE_SECONDS;
      this.releaseAt = now;

      if (this.releaseLeft <= 0) {
        this.releasing = false;
        this.ignition = null;
        this.lighterNudge.set(0, 0, 0);
        lighter.visible = false;
        flame.visible = false;

        return;
      }

      ease = this.releaseLeft * this.releaseLeft * (3 - 2 * this.releaseLeft);
    }

    const p = ignition.progress;
    const smooth = (a: number, b: number, x: number): number => {
      const t = Math.min(Math.max((x - a) / (b - a), 0), 1);

      return t * t * (3 - 2 * t);
    };

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

    const ahead = this.firstPerson ? aim : forward;
    const up = this.firstPerson
      ? this.lookUp.crossVectors(frame.right, aim).normalize()
      : UP;

    // ---- the right hand: the bundle.
    // Held low in front of the chest, off the crosshair; the wire end tips
    // toward the lighter's side only while it is being lit.
    const work = this.ignitionFrom
      .copy(frame.shoulder)
      .addScaledVector(ahead, 0.5)
      .addScaledVector(up, 0.0)
      .addScaledVector(frame.right, -0.1);
    const rest = this.goal
      .copy(frame.hips)
      .addScaledVector(frame.right, 0.2)
      .addScaledVector(UP, -0.02)
      .addScaledVector(frame.forward, 0.04);
    // The surface: the arm's reach toward it, a hand's length short.
    const place = this.ignitionTo.copy(ignition.target).sub(frame.shoulder);
    const reach = Math.min(Math.max(place.length() - 0.14, 0.3), 0.72);

    place
      .normalize()
      .multiplyScalar(reach)
      .add(frame.shoulder)
      .addScaledVector(UP, -0.03);

    const goal = this.ignitionGoal;

    goal.copy(rest).lerp(work, smooth(0, 0.18, p));
    goal.lerp(place, smooth(0.6, 0.8, p));
    goal.lerp(rest, smooth(0.9, 1, p));

    const weight = smooth(0, 0.1, p) * (1 - smooth(0.93, 1, p)) * ease;

    this.pole
      .copy(frame.right)
      .multiplyScalar(0.55)
      .addScaledVector(UP, -0.85)
      .addScaledVector(frame.forward, -0.2);
    this.solve("Right", goal, weight, this.pole);

    // ---- the bundle: upright, tipped to show the wire, then set down.
    const tipped = smooth(0.1, 0.26, p) * (1 - smooth(0.58, 0.78, p)) * ease;

    holder.visible = true;

    for (const item of [this.grenade, this.canister, this.bottle]) {
      if (item) {
        item.visible = false;
      }
    }

    dynamite.visible = p < BEAT.PLACED;
    this.carryDynamite(
      holder,
      dynamite,
      CARRY_LEAN + (0.85 - CARRY_LEAN) * tipped,
      CARRY_TURN + (0.85 - CARRY_TURN) * tipped,
    );
    this.root.updateMatrixWorld(true);
    this.tip.copy(WIRE_TIP);
    dynamite.localToWorld(this.tip);

    // ---- the left hand: the lighter.
    const leftWeight = smooth(0.06, 0.2, p) * (1 - smooth(0.6, 0.76, p)) * ease;

    lighter.visible = leftWeight > 0.02;

    if (leftWeight > 0.002 && this.lighterHand) {
      // Held upright, leaning a little toward the wire.
      this.tilt.setFromUnitVectors(
        UP,
        this.pole
          .copy(UP)
          .addScaledVector(frame.right, 0.5)
          .addScaledVector(ahead, 0.1)
          .normalize(),
      );
      this.lighterHand.parent?.getWorldQuaternion(this.carryFacing);
      // A thumb's flick at each strike: the lighter jerks a little.
      const jerk =
        Math.max(0, 1 - Math.abs(p - BEAT.FLICK_1 - 0.01) / 0.025) +
        Math.max(0, 1 - Math.abs(p - BEAT.FLICK_2 - 0.01) / 0.025);

      lighter.quaternion
        .copy(this.carryFacing)
        .invert()
        .multiply(this.tilt)
        .multiply(this.jerkTurn.setFromAxisAngle(Z_AXIS, 0.28 * jerk));

      // From the hip up to the wire: the hand goes where puts the flame on it.
      const flameAbove = this.flameAt
        .copy(FLAME_MID)
        .multiplyScalar(LIGHTER_SCALE)
        .applyQuaternion(this.tilt);
      const toWire = this.target
        .copy(this.tip)
        .sub(flameAbove)
        .add(this.lighterNudge)
        .addScaledVector(
          this.axis.copy(this.tip).sub(this.leftShoulder).normalize(),
          -HELD_OFFSET,
        );
      const start = this.current
        .copy(frame.hips)
        .addScaledVector(frame.right, -0.22)
        .addScaledVector(frame.forward, 0.05)
        .addScaledVector(UP, 0.05);

      this.elbowNew.copy(start).lerp(toWire, smooth(0.06, 0.3, p));
      this.pole
        .copy(frame.right)
        .multiplyScalar(-0.5)
        .addScaledVector(UP, -0.85);
      this.solve("Left", this.elbowNew, leftWeight, this.pole);

      // Where the flame really is now: close the gap by the next frame.
      if (p > BEAT.FLICK_2 && p < BEAT.LIGHTER_OFF) {
        this.root.updateMatrixWorld(true);
        this.flameAt.copy(FLAME_MID);
        lighter.localToWorld(this.flameAt);
        this.lighterNudge
          .addScaledVector(this.target.copy(this.tip).sub(this.flameAt), 0.5)
          .clampLength(0, 0.2);
      }
    }

    // ---- the flame, the spark and the burning wire.
    // The first flick only throws sparks (a flame that does not catch); the
    // second catches and stays lit until the lighter is put away.
    const missed =
      !this.releasing && p > BEAT.FLICK_1 && p < BEAT.FLICK_1 + 0.03;
    const lit = !this.releasing && p > BEAT.FLICK_2 && p < BEAT.LIGHTER_OFF;

    flame.visible = lit || missed;

    if (lit || missed) {
      flame.scale
        .copy(flickerScale(performance.now() / 1000))
        .multiplyScalar(
          lit ? smooth(BEAT.FLICK_2, BEAT.FLICK_2 + 0.06, p) : 0.35,
        );
    }

    if (this.lighterSpark) {
      const seconds = BREACH_TIMING.IGNITE_SECONDS;
      const since =
        p >= BEAT.FLICK_2
          ? (p - BEAT.FLICK_2) * seconds
          : (p - BEAT.FLICK_1) * seconds;
      // A few frames of sparks at each flick.
      const on = since >= 0 && since < 0.14 && leftWeight > 0.02;

      if (on) {
        lighter.getWorldQuaternion(this.carryFacing).invert();
        this.lighterSpark.setDown(
          this.target.set(0, -1, 0).applyQuaternion(this.carryFacing),
        );
      }

      this.lighterSpark.update(on ? since : null);
    }

    // Sparking from the moment the flame meets the wire, without a break, until
    // the bundle is set down (the planted one carries on, see PlantedCharge).
    if (this.spark) {
      const sparking = p >= BEAT.SPARK && dynamite.visible;

      if (sparking) {
        dynamite.getWorldQuaternion(this.carryFacing).invert();
        this.spark.setDown(
          this.target.set(0, -1, 0).applyQuaternion(this.carryFacing),
        );
      }

      this.spark.update(
        sparking ? (p - BEAT.SPARK) * BREACH_TIMING.IGNITE_SECONDS : null,
      );
    }

    if (this.wireFlame) {
      this.wireFlame.visible = p >= BEAT.SPARK && dynamite.visible;
      this.wireFlame.scale.set(
        1,
        0.9 + 0.3 * Math.sin(performance.now() * 0.04),
        1,
      );
    }
  }

  /** Counter-rotates `item` so it stays upright in the world, whatever the hand does. */
  private keepUpright(holder: THREE.Group, item: THREE.Group): void {
    const hand = holder.parent;

    if (hand) {
      hand.getWorldQuaternion(this.handQuat).invert();
      item.quaternion.copy(this.handQuat);
    }
  }

  /**
   * Builds everything held in the hand now (the grenade, the canister, the
   * bottle and the lighter's flame), all hidden, so the first time one is taken
   * out nothing has to be made, compiled or uploaded at that moment.
   */
  public prepare(): void {
    this.ensureHolder();

    if (!this.lighter) {
      this.createLighter();
    }
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

    this.grenadeParts = createGrenadeParts();
    this.grenade = createGrenade(this.grenadeParts);
    // A little smaller in the hand than in flight, so it never fills the view.
    this.grenade.scale.setScalar(GRENADE_SCALE * HELD_GRENADE);
    this.grenade.visible = false;
    this.canister = createSmokeCanister(this.grenadeParts);
    this.canister.scale.setScalar(SMOKE_SCALE * 0.7);
    this.canister.visible = false;

    this.bottleParts = createBottleParts();
    this.bottle = createBottle(this.bottleParts);
    this.bottle.visible = false;
    // A little smaller in the hand than in flight, so it never fills the view.
    this.bottle.scale.setScalar(BOTTLE_SCALE * 0.7);

    this.dynamite = createDynamite();
    this.dynamite.scale.setScalar(HELD_DYNAMITE);
    this.dynamite.visible = false;

    this.lighterProp = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.052, 0.013),
      new THREE.MeshStandardMaterial({
        color: 0x8c9199,
        emissive: 0x2a2d33,
        roughness: 0.45,
        metalness: 0.6,
      }),
    );
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.014, 0.014),
      new THREE.MeshStandardMaterial({
        color: 0x5d636b,
        emissive: 0x202226,
        roughness: 0.5,
        metalness: 0.6,
      }),
    );

    cap.position.y = 0.033;
    this.lighterProp.add(body, cap);
    this.lighterFlame = createFlame(this.bottleParts, 0.011, 0.04);
    this.lighterFlame.position.y = 0.04;
    this.lighterFlame.visible = false;
    this.lighterProp.add(this.lighterFlame);
    this.lighterProp.visible = false;
    this.lighterProp.scale.setScalar(LIGHTER_SCALE);
    this.lighterSpark = new IgnitionSpark(0.007);
    this.lighterSpark.group.position.set(0, 0.045, 0);
    this.lighterSpark.group.scale.setScalar(0.35);
    this.lighterProp.add(this.lighterSpark.group);

    // A spark and a small flame on the wire's tip, for the lighting.
    this.spark = new IgnitionSpark();
    this.spark.group.position.copy(WIRE_TIP);
    this.dynamite.add(this.spark.group);

    const wireGeometry = new THREE.ConeGeometry(0.008, 0.04, 8);

    wireGeometry.translate(0, 0.02, 0);
    this.wireFlame = new THREE.Mesh(
      wireGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xffa83a,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    this.wireFlame.position.copy(WIRE_TIP);
    this.wireFlame.visible = false;
    this.dynamite.add(this.wireFlame);

    holder.add(this.grenade, this.canister, this.bottle, this.dynamite);

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
    this.attachLighter();

    return holder;
  }

  /** The lighter goes in the left hand (hidden until the dynamite is lit). */
  private attachLighter(): void {
    const hand = this.root.getObjectByName("LeftHand");
    const fore = this.root.getObjectByName("LeftForeArm");

    if (!hand || !fore || !this.lighterProp) {
      return;
    }

    const group = new THREE.Group();
    const wrist = hand.getWorldPosition(new THREE.Vector3());
    const elbow = fore.getWorldPosition(new THREE.Vector3());
    const beyond = wrist
      .clone()
      .add(wrist.clone().sub(elbow).normalize().multiplyScalar(HELD_OFFSET));

    group.position.copy(hand.worldToLocal(beyond));

    const scale = hand.getWorldScale(new THREE.Vector3());

    group.scale.set(1 / scale.x, 1 / scale.y, 1 / scale.z);
    group.add(this.lighterProp);
    hand.add(group);
    this.lighterHand = group;
  }

  public dispose(): void {
    this.lighterHand?.removeFromParent();
    this.lighterHand = null;
    this.spark?.dispose();
    this.spark = null;
    this.lighterSpark?.dispose();
    this.lighterSpark = null;

    if (this.wireFlame) {
      this.wireFlame.geometry.dispose();
      (this.wireFlame.material as THREE.Material).dispose();
      this.wireFlame = null;
    }

    if (!this.holder) {
      return;
    }

    this.holder.removeFromParent();
    this.lighterHolder?.removeFromParent();
    this.lighterHolder = null;
    this.lighter = null;

    if (this.grenadeParts) {
      disposeGrenadeParts(this.grenadeParts);
    }

    if (this.bottleParts) {
      disposeBottleParts(this.bottleParts);
    }

    this.lighterProp?.traverse((object) => {
      const mesh = object as THREE.Mesh;

      if (mesh.isMesh && mesh.material !== this.bottleParts?.flame) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
    this.lighterProp = null;
    this.lighterFlame = null;
    this.dynamite?.traverse((object) => {
      const mesh = object as THREE.Mesh;

      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
    this.dynamite = null;
    this.holder = null;
    this.grenade = null;
    this.canister = null;
    this.bottle = null;
    this.bottleParts = null;
    this.grenadeParts = null;
  }
}
