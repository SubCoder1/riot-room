import * as THREE from "three";

import { Character } from "../character/Character";
import { CHARACTER_ASSET_PATH } from "../character/CharacterConfig";
import type { AttackDefinition, HitboxHand } from "./AttackDefinitions";
import { CharacterRig } from "./CharacterRig";
import { guardedPartsFor } from "./CombatConfig";
import type { CombatEvent, CombatEventBus } from "./CombatEvents";
import {
  Health,
  type Combatant,
  type HitInfo,
  type Hurtbox,
  type HurtboxId,
} from "./Combatant";
import type { CapsuleShape } from "./Shapes";

const KNOCKBACK_DECAY = 6;
const RESPAWN_DELAY = 2.5;
const FALL_DURATION = 0.6;
const ZERO = new THREE.Vector3();

/**
 * Development-only target: a real character with 100 HP that can be hit,
 * knocked back, killed and respawned. It has no AI and never attacks.
 */
export class TrainingDummy implements Combatant {
  public readonly id = "dummy";
  public readonly name = "Dummy";
  public readonly health = new Health(100);

  /** Holds the character and the HP label; positioned at the dummy's feet. */
  public readonly root = new THREE.Group();
  public readonly character = new Character();

  /** Dev toggle: the dummy holds a guard so blocking can be tested. */
  public blockHeld = false;

  /** Dev toggle: the dummy crouches, so a crouched guard (covers the legs) can be tested. */
  public crouched = false;

  /** Dev toggle: the dummy looks up (its guard points up too), to test blocking aerial attacks. */
  public lookUp = false;

  /**
   * Dev toggle: when true the dummy keeps turning to face you. Off by default so
   * you can walk around it and test side and rear attacks against its guard.
   */
  public trackPlayer = false;

  private readonly events: CombatEventBus;
  private readonly spawn: THREE.Vector3;
  /** Half the arena width: knockback can't push the dummy through walls. */
  private readonly bounds: number;
  private readonly rig: CharacterRig;
  private readonly hurtboxes: Hurtbox[];
  private readonly position: THREE.Vector3;
  private readonly velocity = new THREE.Vector3();
  private readonly label: HpLabel;

  private yaw = 0;
  private dead = false;
  private respawnTimer = 0;
  private fall = 0;
  private hitstunLeft = 0;

  /** Last combat result shown under the HP (what the guard did with the last hit). */
  private note = "";
  private noteTimer = 0;

  constructor(events: CombatEventBus, spawn: THREE.Vector3, bounds: number) {
    this.events = events;
    this.spawn = spawn;
    this.bounds = bounds;
    this.position = spawn.clone();

    this.rig = new CharacterRig(this.character.group);
    this.hurtboxes = this.rig.createHurtboxes();

    this.root.add(this.character.group);

    this.label = new HpLabel();
    this.label.sprite.position.set(0, 2.15, 0);
    this.root.add(this.label.sprite);

    this.root.position.copy(this.position);
    this.refreshLabel();

    events.subscribe((event) => this.showResult(event));
  }

  /** Puts the outcome of the last attack on the label, so tests don't need the console. */
  private showResult(event: CombatEvent): void {
    if (!("targetId" in event) || event.targetId !== this.id) {
      return;
    }

    const upper = (text: string): string => text.toUpperCase();

    switch (event.type) {
      case "blocked":
        this.note = `BLOCKED (${event.attackId})`;
        break;

      case "block-failed":
        this.note = upper(`block failed: ${event.reason}`) + (event.detail ? ` - ${event.detail}` : "");
        break;

      case "guard-reduced":
        this.note = `GUARD REDUCED x${event.multiplier} (${event.attackId})`;
        break;

      case "guard-ignored":
        this.note = `GUARD IGNORED (${event.attackId})`;
        break;

      case "hit":
        // A hit that follows a failed/ignored block adds its damage to that note.
        this.note = this.noteTimer > 3.9 ? `${this.note} -${event.damage}` : `HIT -${event.damage}`;
        break;

      default:
        return;
    }

    this.noteTimer = 4;
  }

  private refreshLabel(): void {
    const status = this.noteTimer > 0 ? this.note : this.statusText();

    this.label.set(this.name.toUpperCase(), this.health.current, this.dead, status);
  }

  /** Persistent line: which dev toggles are on. */
  private statusText(): string {
    return `guard ${this.blockHeld ? "ON" : "off"}${this.crouched ? " crouch" : ""}${this.lookUp ? " look-up" : ""}`;
  }

  public async load(): Promise<boolean> {
    const loaded = await this.character.load(CHARACTER_ASSET_PATH);

    if (loaded) {
      this.character.group.visible = true;
    }

    return loaded;
  }

  public getPosition(out?: THREE.Vector3): THREE.Vector3 {
    return out ? out.copy(this.position) : this.position;
  }

  public getRig(): CharacterRig {
    return this.rig;
  }

  public isDead(): boolean {
    return this.dead;
  }

  public isBlocking(): boolean {
    return this.blockHeld && !this.dead;
  }

  public getLookPitch(): number {
    return this.lookUp ? 0.8 : 0;
  }

  public getGuardedParts(): readonly HurtboxId[] {
    if (!this.isBlocking()) {
      return [];
    }

    return guardedPartsFor(this.crouched, this.getLookPitch());
  }

  public getHurtboxes(): Hurtbox[] {
    return this.hurtboxes;
  }

  public getFacing(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  public getAttackShape(
    hand: HitboxHand,
    definition: AttackDefinition,
    out: CapsuleShape,
  ): boolean {
    return this.rig.getAttackShape(hand, definition, out);
  }

  public onHit(hit: HitInfo): void {
    this.hitstunLeft = hit.hitstun;

    // Knockback along the attacker's facing; distance ~ knockback metres.
    this.velocity
      .copy(hit.knockbackDirection)
      .multiplyScalar(hit.knockback * KNOCKBACK_DECAY);

    this.character.playHitReaction(
      THREE.MathUtils.clamp(hit.damage / 25, 0.4, 1.3),
    );

    if (this.health.isDead) {
      this.dead = true;
      this.respawnTimer = RESPAWN_DELAY;
    }
  }

  // A blocked hit only nudges the guard: no damage, a small shove and flinch.
  public onBlocked(hit: HitInfo): void {
    this.velocity
      .copy(hit.knockbackDirection)
      .multiplyScalar(hit.knockback * 0.25 * KNOCKBACK_DECAY);

    this.character.playHitReaction(0.25);
  }

  public update(dt: number, lookAt: THREE.Vector3): void {
    this.hitstunLeft = Math.max(0, this.hitstunLeft - dt);

    if (!this.dead) {
      if (this.trackPlayer) {
        this.yaw = Math.atan2(
          lookAt.x - this.position.x,
          lookAt.z - this.position.z,
        );
      }
    } else {
      this.fall = Math.min(1, this.fall + dt / FALL_DURATION);
      this.respawnTimer -= dt;

      if (this.respawnTimer <= 0) {
        this.respawn();
      }
    }

    this.position.addScaledVector(this.velocity, dt);
    this.velocity.multiplyScalar(Math.exp(-KNOCKBACK_DECAY * dt));
    this.position.x = THREE.MathUtils.clamp(
      this.position.x,
      -this.bounds,
      this.bounds,
    );
    this.position.z = THREE.MathUtils.clamp(
      this.position.z,
      -this.bounds,
      this.bounds,
    );

    this.root.position.copy(this.position);

    this.character.setTransform(ZERO, this.yaw);

    // Death: tip over backwards (tilt applied after the yaw).
    this.character.group.rotation.order = "YXZ";
    this.character.group.rotation.x = -this.fall * (Math.PI / 2) * 0.97;

    if (this.character.isLoaded) {
      this.character.setAim(this.getLookPitch(), this.isBlocking(), false);

      this.character.update(
        dt,
        this.crouched
          ? "crouch"
          : this.blockHeld && !this.dead
            ? "block"
            : "idle",
        false,
        false,
        this.blockHeld && !this.dead,
      );
    }

    this.rig.refresh();

    this.noteTimer = Math.max(0, this.noteTimer - dt);
    this.refreshLabel();
  }

  private respawn(): void {
    this.position.copy(this.spawn);
    this.velocity.set(0, 0, 0);
    this.health.reset();
    this.dead = false;
    this.fall = 0;
    this.hitstunLeft = 0;
    this.yaw = 0;
    this.crouched = false;
    this.lookUp = false;

    this.events.emit({
      type: "respawned",
      targetId: this.id,
      targetName: this.name,
    });
  }
}

/** Small development label: "DUMMY / HP: 90", drawn to a canvas sprite. */
class HpLabel {
  public readonly sprite: THREE.Sprite;

  private readonly canvas = document.createElement("canvas");
  private readonly texture: THREE.CanvasTexture;
  private lastText = "";

  constructor() {
    this.canvas.width = 512;
    this.canvas.height = 232;

    this.texture = new THREE.CanvasTexture(this.canvas);

    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.texture,
        transparent: true,
        depthTest: false,
      }),
    );

    this.sprite.scale.set(1.9, 0.86, 1);
    this.sprite.renderOrder = 998;
  }

  public set(name: string, health: number, dead: boolean, note: string): void {
    const second = dead ? "DEAD" : `HP: ${health}`;
    const text = `${name}\n${second}\n${note}`;

    if (text === this.lastText) {
      return;
    }

    this.lastText = text;

    const context = this.canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.clearRect(0, 0, 512, 232);
    context.fillStyle = "rgba(0, 0, 0, 0.55)";
    context.fillRect(8, 8, 496, 216);
    context.textAlign = "center";
    context.fillStyle = "#ffffff";
    context.font = "bold 44px sans-serif";
    context.fillText(name, 256, 56);
    context.fillStyle = dead ? "#f87171" : "#86efac";
    context.fillText(second, 256, 106);
    context.fillStyle = "#fde68a";
    context.font = "bold 22px sans-serif";

    // "REASON - detail" is drawn on two lines so nothing runs off the label.
    const [headline, detail] = note.split(" - ");

    context.fillText(headline.slice(0, 40), 256, 150);

    if (detail) {
      context.font = "bold 20px sans-serif";
      context.fillText(detail.slice(0, 50), 256, 186);
    }

    this.texture.needsUpdate = true;
  }
}
