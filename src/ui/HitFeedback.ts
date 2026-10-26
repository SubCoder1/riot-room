import * as THREE from "three";

import type { DamageSourceId } from "../combat/AttackDefinitions";
import type { Combatant } from "../combat/Combatant";
import type { CombatEvent, CombatEventBus } from "../combat/CombatEvents";
import { createCapsule } from "../combat/Shapes";

/**
 * Hit feedback over an enemy: damage numbers that pop up beside an enemy you
 * hit and float up to its head, and a "BLOCKED" tag when your hit is blocked.
 *
 * There is deliberately no health bar, number or colour over anyone's head: a
 * player's health is shown only to that player, in their own HUD. The numbers
 * show the damage a hit did, never what is left.
 *
 * It only *reads* combat events and the combatants' poses, so the UI is never
 * the source of truth. Nothing here changes damage, hit detection or health.
 */

/** Metres between the top of the head and the tag. */
const ABOVE_HEAD = 0.28;
/** The tag is shown only within this distance (metres) of the camera. */
export const MAX_DISTANCE = 16;
const BLOCK_TAG_SECONDS = 0.7;

/** Damage numbers. */
const NUMBER_SECONDS = 0.9;
const POP_FRACTION = 0.12;
const MAX_NUMBERS = 24;

export type HitKind = "light" | "heavy" | "flying";

export function hitKindOf(attackId: DamageSourceId): HitKind {
  if (attackId === "heavy-run-punch") return "heavy";
  if (attackId.startsWith("flying")) return "flying";

  return "light";
}

interface Anchor {
  id: string;
  combatant: Combatant;
  tag: HTMLElement;
  tagLeft: number;
  // Last values written to the DOM, so unchanged frames cost nothing.
  shown: boolean;
  lastTransform: string;
}

interface FloatingNumber {
  element: HTMLElement;
  anchor: Anchor;
  age: number;
  /** World offsets from the enemy's head: where it starts and where it ends. */
  start: THREE.Vector3;
  end: THREE.Vector3;
  /** Sideways drift (world, along the camera's right at spawn). */
  drift: THREE.Vector3;
  active: boolean;
}

const tmpHead = new THREE.Vector3();
const tmpPoint = new THREE.Vector3();
const tmpCamera = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const headShape = createCapsule();

/** Top of an enemy's head in world space, or false if it has no pose yet. */
export function headTopOf(combatant: Combatant, out: THREE.Vector3): boolean {
  const head = combatant.getHurtboxes().find((h) => h.id === "head");

  if (!head) {
    combatant.getPosition(out);
    out.y += 1.8;

    return true;
  }

  if (!head.getShape(headShape)) {
    return false;
  }

  out.copy(headShape.start).add(headShape.end).multiplyScalar(0.5);
  out.y = Math.max(headShape.start.y, headShape.end.y) + headShape.radius;

  return true;
}

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

export class HitFeedback {
  /** Optional: true when nothing solid lies between the two points. */
  public lineOfSight:
    ((from: THREE.Vector3, to: THREE.Vector3) => boolean) | null = null;

  private readonly layer: HTMLElement;
  private readonly anchors = new Map<string, Anchor>();
  private readonly active: FloatingNumber[] = [];
  private readonly spare: FloatingNumber[] = [];
  private readonly getCombatants: () => readonly Combatant[];
  private readonly playerId: string;
  private readonly unsubscribe: () => void;
  private readonly random: () => number;
  private lastCamera: THREE.Camera | null = null;

  constructor(
    parent: HTMLElement,
    events: CombatEventBus,
    getCombatants: () => readonly Combatant[],
    playerId: string,
    random: () => number = Math.random,
  ) {
    this.getCombatants = getCombatants;
    this.playerId = playerId;
    this.random = random;

    this.layer = document.createElement("div");
    this.layer.className = "hit-feedback-layer";
    this.layer.setAttribute("aria-hidden", "true");
    parent.appendChild(this.layer);

    this.unsubscribe = events.subscribe((event) => this.onEvent(event));
  }

  /** The "BLOCKED" tag element over an enemy (for tests and tooling). */
  public tagElement(id: string): HTMLElement | undefined {
    return this.anchors.get(id)?.tag;
  }

  /** How many damage numbers are currently floating. */
  public get floatingCount(): number {
    return this.active.length;
  }

  public update(dt: number, camera: THREE.Camera): void {
    this.lastCamera = camera;
    camera.updateMatrixWorld(true);
    camera.getWorldPosition(tmpCamera);

    const width = window.innerWidth;
    const height = window.innerHeight;
    const seen = new Set<string>();

    for (const combatant of this.getCombatants()) {
      if (combatant.id === this.playerId) {
        continue;
      }

      seen.add(combatant.id);

      const anchor = this.anchorFor(combatant);

      anchor.tagLeft = Math.max(0, anchor.tagLeft - dt);
      this.place(anchor, camera, width, height);
    }

    // An enemy that was removed takes its tag (and numbers) with it.
    for (const [id, anchor] of this.anchors) {
      if (!seen.has(id)) {
        anchor.tag.remove();
        this.anchors.delete(id);
      }
    }

    for (let k = this.active.length - 1; k >= 0; k--) {
      const number = this.active[k];

      number.age += dt;

      if (number.age >= NUMBER_SECONDS || !this.anchors.has(number.anchor.id)) {
        this.recycle(k);
        continue;
      }

      this.placeNumber(number, camera, width, height);
    }
  }

  /** Removes everything this created and stops listening. */
  public dispose(): void {
    this.unsubscribe();
    this.layer.remove();
    this.anchors.clear();
    this.active.length = 0;
    this.spare.length = 0;
  }

  // ----------------------------------------------------------
  // Anchors (one per enemy: where its numbers and its tag are placed)
  // ----------------------------------------------------------

  /** The anchor for an enemy by id, made on demand (a hit can come before the first frame). */
  private anchorById(id: string): Anchor | undefined {
    const existing = this.anchors.get(id);

    if (existing) {
      return existing;
    }

    const combatant = this.getCombatants().find((c) => c.id === id);

    return combatant && combatant.id !== this.playerId
      ? this.anchorFor(combatant)
      : undefined;
  }

  private anchorFor(combatant: Combatant): Anchor {
    let anchor = this.anchors.get(combatant.id);

    if (anchor) {
      return anchor;
    }

    const tag = document.createElement("div");

    tag.className = "hit-tag";
    tag.style.visibility = "hidden";
    this.layer.appendChild(tag);

    anchor = {
      id: combatant.id,
      combatant,
      tag,
      tagLeft: 0,
      shown: false,
      lastTransform: "",
    };
    this.anchors.set(combatant.id, anchor);

    return anchor;
  }

  /** Projects the "BLOCKED" tag above the head, only while it is up. */
  private place(
    anchor: Anchor,
    camera: THREE.Camera,
    width: number,
    height: number,
  ): void {
    let visible =
      anchor.tagLeft > 0 &&
      anchor.combatant.health.current > 0 &&
      headTopOf(anchor.combatant, tmpHead);

    if (visible) {
      tmpPoint.copy(tmpHead);
      tmpPoint.y += ABOVE_HEAD;

      if (tmpPoint.distanceTo(tmpCamera) > MAX_DISTANCE) {
        visible = false;
      }

      // Something solid between the camera and the tag hides it.
      if (
        visible &&
        this.lineOfSight &&
        !this.lineOfSight(tmpCamera, tmpPoint)
      ) {
        visible = false;
      }

      tmpPoint.project(camera);

      if (
        tmpPoint.z > 1 ||
        tmpPoint.z < -1 ||
        Math.abs(tmpPoint.x) > 1.1 ||
        Math.abs(tmpPoint.y) > 1.1
      ) {
        visible = false;
      }
    }

    if (visible !== anchor.shown) {
      anchor.shown = visible;
      anchor.tag.style.visibility = visible ? "visible" : "hidden";
      anchor.tag.textContent = visible ? "BLOCKED" : "";
    }

    if (!visible) {
      return;
    }

    const x = Math.round((tmpPoint.x * 0.5 + 0.5) * width);
    const y = Math.round((-tmpPoint.y * 0.5 + 0.5) * height);
    const transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;

    if (transform !== anchor.lastTransform) {
      anchor.lastTransform = transform;
      anchor.tag.style.transform = transform;
    }
  }

  // ----------------------------------------------------------
  // Events
  // ----------------------------------------------------------

  private onEvent(event: CombatEvent): void {
    if (event.type === "hit") {
      const anchor = this.anchorById(event.targetId);

      if (anchor && event.attackerId === this.playerId && event.damage > 0) {
        this.spawnNumber(
          anchor,
          event.damage,
          event.attackId,
          event.healthLeft <= 0,
        );
      }
    } else if (
      event.type === "blocked" ||
      // A guarded blast still hurts, but the guard is shown like any block.
      (event.type === "guard-reduced" && event.attackId === "grenade-blast")
    ) {
      const anchor = this.anchorById(event.targetId);

      if (anchor && event.attackerId === this.playerId) {
        anchor.tagLeft = BLOCK_TAG_SECONDS;
      }
    }
  }

  // ----------------------------------------------------------
  // Damage numbers
  // ----------------------------------------------------------

  private spawnNumber(
    anchor: Anchor,
    damage: number,
    attackId: DamageSourceId,
    killed: boolean,
  ): void {
    // The oldest number makes room if too many are in flight.
    if (this.active.length >= MAX_NUMBERS) {
      this.recycle(0);
    }

    const number = this.spare.pop() ?? this.createNumber();
    const camera = this.lastCamera;

    // Beside the enemy: to the camera's left or right, plus a little in front,
    // at chest height, with some variation so rapid hits don't pile up.
    const side = this.random() < 0.5 ? -1 : 1;

    tmpRight.set(1, 0, 0);

    if (camera) {
      tmpRight.applyQuaternion(camera.quaternion);
      tmpRight.y = 0;

      if (tmpRight.lengthSq() > 1e-6) {
        tmpRight.normalize();
      } else {
        tmpRight.set(1, 0, 0);
      }
    }

    const spread = 0.45 + this.random() * 0.35;

    number.anchor = anchor;
    number.age = 0;
    number.active = true;
    number.start
      .copy(tmpRight)
      .multiplyScalar(side * spread)
      .setY(-0.55 + this.random() * 0.25);
    number.end
      .copy(tmpRight)
      .multiplyScalar(side * 0.12)
      .setY(ABOVE_HEAD + 0.1);
    number.drift
      .copy(tmpRight)
      .multiplyScalar(side * (0.1 + this.random() * 0.1));

    const element = number.element;

    element.textContent = `-${damage}`;
    element.dataset.kind = killed ? "ko" : hitKindOf(attackId);
    // Colour follows the weight of the attack: light is yellow, heavy is red.
    element.dataset.weight = attackId.includes("heavy") ? "heavy" : "light";
    element.style.visibility = "hidden";
    this.layer.appendChild(element);
    this.active.push(number);
  }

  private createNumber(): FloatingNumber {
    const element = document.createElement("div");

    element.className = "hit-number";

    return {
      element,
      anchor: undefined as unknown as Anchor,
      age: 0,
      start: new THREE.Vector3(),
      end: new THREE.Vector3(),
      drift: new THREE.Vector3(),
      active: false,
    };
  }

  private recycle(index: number): void {
    const [number] = this.active.splice(index, 1);

    number.active = false;
    number.element.remove();
    this.spare.push(number);
  }

  private placeNumber(
    number: FloatingNumber,
    camera: THREE.Camera,
    width: number,
    height: number,
  ): void {
    if (!headTopOf(number.anchor.combatant, tmpHead)) {
      return;
    }

    const t = Math.min(1, number.age / NUMBER_SECONDS);
    const rise = easeOutCubic(t);

    // Float from the side toward the head, drifting sideways on the way.
    tmpPoint
      .copy(number.start)
      .lerp(number.end, rise)
      .addScaledVector(number.drift, Math.sin(t * Math.PI))
      .add(tmpHead)
      .project(camera);

    const behind = tmpPoint.z > 1 || tmpPoint.z < -1;
    const x = Math.round((tmpPoint.x * 0.5 + 0.5) * width);
    const y = Math.round((-tmpPoint.y * 0.5 + 0.5) * height);

    // Pop in (0.7 -> 1), shrink a little as it leaves.
    const scale =
      t < POP_FRACTION
        ? 0.7 + 0.3 * (t / POP_FRACTION)
        : t > 0.7
          ? 1 - 0.15 * ((t - 0.7) / 0.3)
          : 1;
    const opacity = t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45);
    const style = number.element.style;

    style.visibility = behind ? "hidden" : "visible";
    style.opacity = opacity.toFixed(2);
    style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
  }
}
