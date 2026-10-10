import * as THREE from "three";

import type { DamageSourceId } from "../combat/AttackDefinitions";
import type { Combatant } from "../combat/Combatant";
import type { CombatEvent, CombatEventBus } from "../combat/CombatEvents";
import { createCapsule } from "../combat/Shapes";

/**
 * A health bar above every nearby enemy's head, and damage numbers that pop up
 * beside an enemy you hit and float to its bar.
 *
 * The bar is a plain solid red rectangle, left aligned: as health drops it
 * shortens from the right. It is anchored to the head in the 3D world, always
 * faces the camera and is the same size on screen at any distance. It simply
 * isn't shown beyond MAX_DISTANCE, when something solid is in the way, when the
 * enemy is behind the camera, or when the enemy is dead.
 *
 * It only *reads* combat events and combatant health (re-read every frame), so
 * the UI is never the source of truth. Nothing here changes damage, hit
 * detection or health.
 */

/** Metres between the top of the head and the bar. */
const ABOVE_HEAD = 0.28;
/** Bars are shown only within this distance (metres) of the camera. */
export const MAX_DISTANCE = 16;
/** Width of a full bar in pixels (the same at every distance). */
export const BAR_WIDTH = 160;
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

interface Bar {
  id: string;
  combatant: Combatant;
  element: HTMLElement;
  fill: HTMLElement;
  tag: HTMLElement;
  tagLeft: number;
  // Last values written to the DOM, so unchanged frames cost nothing.
  shown: boolean;
  lastTransform: string;
  lastWidth: number;
}

interface FloatingNumber {
  element: HTMLElement;
  bar: Bar;
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

export class WorldHealthBars {
  /** Optional: true when nothing solid lies between the two points. */
  public lineOfSight:
    ((from: THREE.Vector3, to: THREE.Vector3) => boolean) | null = null;

  private readonly layer: HTMLElement;
  private readonly bars = new Map<string, Bar>();
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
    this.layer.className = "enemy-hp-layer";
    this.layer.setAttribute("aria-hidden", "true");
    parent.appendChild(this.layer);

    this.unsubscribe = events.subscribe((event) => this.onEvent(event));
  }

  /** The bar element above an enemy (for tests and tooling). */
  public barElement(id: string): HTMLElement | undefined {
    return this.bars.get(id)?.element;
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

      const bar = this.barFor(combatant);

      bar.tagLeft = Math.max(0, bar.tagLeft - dt);
      this.place(bar, camera, width, height);
    }

    // An enemy that was removed takes its bar (and numbers) with it.
    for (const [id, bar] of this.bars) {
      if (!seen.has(id)) {
        bar.element.remove();
        this.bars.delete(id);
      }
    }

    for (let k = this.active.length - 1; k >= 0; k--) {
      const number = this.active[k];

      number.age += dt;

      if (number.age >= NUMBER_SECONDS || !this.bars.has(number.bar.id)) {
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
    this.bars.clear();
    this.active.length = 0;
    this.spare.length = 0;
  }

  // ----------------------------------------------------------
  // Bars
  // ----------------------------------------------------------

  /** The bar for an enemy by id, made on demand (a hit can come before the first frame). */
  private barById(id: string): Bar | undefined {
    const existing = this.bars.get(id);

    if (existing) {
      return existing;
    }

    const combatant = this.getCombatants().find((c) => c.id === id);

    return combatant && combatant.id !== this.playerId
      ? this.barFor(combatant)
      : undefined;
  }

  private barFor(combatant: Combatant): Bar {
    let bar = this.bars.get(combatant.id);

    if (bar) {
      return bar;
    }

    const element = document.createElement("div");
    const fill = document.createElement("div");
    const tag = document.createElement("div");

    element.className = "enemy-hp";
    fill.className = "enemy-hp__fill";
    tag.className = "enemy-hp__tag";
    element.append(fill, tag);
    element.style.visibility = "hidden";
    this.layer.appendChild(element);

    bar = {
      id: combatant.id,
      combatant,
      element,
      fill,
      tag,
      tagLeft: 0,
      shown: false,
      lastTransform: "",
      lastWidth: -1,
    };
    this.bars.set(combatant.id, bar);

    return bar;
  }

  /** Projects the bar above the head and writes only what changed. */
  private place(
    bar: Bar,
    camera: THREE.Camera,
    width: number,
    height: number,
  ): void {
    const health = bar.combatant.health;
    const dead = health.current <= 0;

    let visible = !dead && headTopOf(bar.combatant, tmpHead);

    if (visible) {
      tmpPoint.copy(tmpHead);
      tmpPoint.y += ABOVE_HEAD;

      // Only enemies within range show a bar.
      if (tmpPoint.distanceTo(tmpCamera) > MAX_DISTANCE) {
        visible = false;
      }

      // Something solid between the camera and the bar hides it.
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

    if (visible !== bar.shown) {
      bar.shown = visible;
      bar.element.style.visibility = visible ? "visible" : "hidden";
    }

    if (!visible) {
      return;
    }

    const x = Math.round((tmpPoint.x * 0.5 + 0.5) * width);
    const y = Math.round((-tmpPoint.y * 0.5 + 0.5) * height);
    const transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;

    if (transform !== bar.lastTransform) {
      bar.lastTransform = transform;
      bar.element.style.transform = transform;
    }

    // Left aligned: the bar shortens from the right as health drops.
    const fraction = Math.min(1, Math.max(0, health.current / health.max));
    const fillWidth = Math.round(fraction * BAR_WIDTH);

    if (fillWidth !== bar.lastWidth) {
      bar.lastWidth = fillWidth;
      bar.fill.style.width = `${fillWidth}px`;
    }

    bar.element.dataset.hp = String(Math.ceil(health.current));
    bar.tag.textContent = bar.tagLeft > 0 ? "BLOCKED" : "";
  }

  // ----------------------------------------------------------
  // Events
  // ----------------------------------------------------------

  private onEvent(event: CombatEvent): void {
    if (event.type === "hit") {
      const bar = this.barById(event.targetId);

      if (bar && event.attackerId === this.playerId && event.damage > 0) {
        this.spawnNumber(
          bar,
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
      const bar = this.barById(event.targetId);

      if (bar && event.attackerId === this.playerId) {
        bar.tagLeft = BLOCK_TAG_SECONDS;
      }
    }
  }

  // ----------------------------------------------------------
  // Damage numbers
  // ----------------------------------------------------------

  private spawnNumber(
    bar: Bar,
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

    number.bar = bar;
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

    element.className = "enemy-hp__number";

    return {
      element,
      bar: undefined as unknown as Bar,
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
    if (!headTopOf(number.bar.combatant, tmpHead)) {
      return;
    }

    const t = Math.min(1, number.age / NUMBER_SECONDS);
    const rise = easeOutCubic(t);

    // Float from the side toward the head/bar, drifting sideways on the way.
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
