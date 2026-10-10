/**
 * The throwable-in-hand states: what the player is doing with their grenade,
 * Molotov or smoke grenade, and the arm pose that goes with it. Pure logic (no input, rendering or combat), so it
 * is easy to test and the same states can later be driven by the network.
 *
 *   NORMAL -> EQUIPPING -> EQUIPPED <-> AIMING -> THROWING (a left click from
 *   EQUIPPED is a quick throw, no aiming needed) -> back to AIMING /
 *   EQUIPPED, and UNEQUIPPING (the put-away) from any of them when the player
 *   switches away.
 *
 * The item itself is spent by the caller when `consumeRelease()` fires.
 */

export type ThrowState =
  | "NORMAL"
  | "THROW_EQUIPPING"
  | "THROW_EQUIPPED"
  | "THROW_AIMING"
  | "THROW_THROWING"
  | "THROW_UNEQUIPPING";

/** Seconds. The animations are deliberately tiny. */
export const THROW_TIMING = {
  equip: 0.32,
  /** The Molotov and the smoke grenade take a little longer: out of the pocket, then lit or armed. */
  equipMolotov: 0.7,
  unequip: 0.28,
  throw: 0.3,
  /**
   * A grenade's pin is pulled only when the throw is made: this quick pull
   * (the other hand to the grenade, the pin out) plays first, then the throw.
   */
  grenadePin: 0.2,
} as const;

/** Where in the throw (0 to 1) the item leaves the hand. */
const RELEASE_AT = 0.45;
/** Where in the equip the item appears (the hand is at the pocket). */
const EQUIP_ITEM_AT = 0.45;
const EQUIP_MOLOTOV_AT = 0.25;
/** Where in the Molotov equip the hand is up in the lighting position, and lit. */
const LIGHT_FROM = 0.22;
const LIT_AT = 0.74;
/** The lighter flame is in the left hand from here, until just after the rag catches. */
const LIGHTER_FROM = 0.34;
const LIGHTER_UNTIL = 0.84;
/** Where in a smoke grenade's equip the other hand pulls the pin out (0 to 1). */
const PIN_FROM = 0.36;
const PIN_TO = 0.62;
/** Where in the put-away the item vanishes (the hand is at the pocket). */
const UNEQUIP_ITEM_GONE_AT = 0.6;

/** What the hand holds: every throwable shares every state and the throw. */
export type HeldKind = "grenade" | "molotov" | "smoke";

export interface ThrowInput {
  /** A throwable (GRENADE, MOLOTOV or SMOKE) is the selected slot. */
  selected: boolean;
  /** How many of the selected throwable are left in the inventory. */
  count: number;
  /** Which throwable is selected (the grenade if not given). */
  kind?: HeldKind;
  /**
   * How many of the throwable currently in the hand are left (the same as
   * `count` if not given). Decides the put-away after a throw.
   */
  heldCount?: number;
  /** The aim button (right click) is held. */
  aimHeld: boolean;
  /** The throw button (left click) was pressed this frame. */
  throwPressed: boolean;
  /**
   * The arm is needed for something else right now (punching, blocking), so
   * the throwing pose lets go of it. The item stays in the hand.
   */
  armBusy: boolean;
}

/**
 * Where the throwing hand goes, as weights of six key positions (they sum to
 * 1) and how much the pose overrides the normal animation (0 = none).
 */
export interface ThrowPose {
  pocket: number;
  /** Up near the chest: where a Molotov is lit. */
  light: number;
  ready: number;
  aim: number;
  windup: number;
  release: number;
  weight: number;
}

type KeyName = "pocket" | "light" | "ready" | "aim" | "windup" | "release";

const KEYS: readonly KeyName[] = [
  "pocket",
  "light",
  "ready",
  "aim",
  "windup",
  "release",
];

export class ThrowStance {
  public state: ThrowState = "NORMAL";
  /** Seconds in the current state. */
  public elapsed = 0;

  private released = false;
  private releaseQueued = false;
  private held: HeldKind = "grenade";
  private clickUsed = false;

  private readonly mix: Record<KeyName, number> = {
    pocket: 1,
    light: 0,
    ready: 0,
    aim: 0,
    windup: 0,
    release: 0,
  };
  private overall = 0;

  public update(dt: number, input: ThrowInput): void {
    this.clickUsed = false;
    this.elapsed += dt;

    const kind = input.kind ?? "grenade";
    const wantsAny = input.selected && input.count > 0;
    // Wanting the same thing that is already in the hand. Another kind means
    // the one in the hand is put away first, then the new one comes out.
    const wants = wantsAny && (this.state === "NORMAL" || kind === this.held);
    const heldCount = input.heldCount ?? input.count;

    // Time-driven transitions.
    switch (this.state) {
      case "THROW_EQUIPPING":
        if (this.elapsed >= this.equipTime) {
          this.enter("THROW_EQUIPPED");
        }

        break;

      case "THROW_UNEQUIPPING":
        if (this.elapsed >= THROW_TIMING.unequip) {
          this.enter("NORMAL");
        }

        break;

      case "THROW_THROWING":
        if (
          !this.released &&
          this.elapsed >= this.pinTime + THROW_TIMING.throw * RELEASE_AT
        ) {
          this.released = true;
          this.releaseQueued = true;
        }

        if (this.elapsed >= this.pinTime + THROW_TIMING.throw) {
          // Another item left: the hand reaches into the pocket for it (the
          // equip animation again). Switched away with items left: put them away.
          this.enter(
            wants
              ? "THROW_EQUIPPING"
              : heldCount > 0
                ? "THROW_UNEQUIPPING"
                : "NORMAL",
          );
        }

        break;

      default:
        break;
    }

    // Input-driven transitions. A throw click on the very frame the aim begins
    // still throws, so it never turns into a punch.
    for (let pass = 0; pass < 2; pass++) {
      switch (this.state) {
        case "NORMAL":
          if (wantsAny) {
            this.held = kind;
            this.enter("THROW_EQUIPPING");
          }

          break;

        case "THROW_UNEQUIPPING":
          if (wants) {
            this.enter("THROW_EQUIPPING");
          }

          break;

        case "THROW_EQUIPPING":
          if (!wants) {
            this.enter("THROW_UNEQUIPPING");
          }

          break;

        case "THROW_EQUIPPED":
          if (!wants) {
            this.enter("THROW_UNEQUIPPING");
          } else if (input.aimHeld && !input.armBusy) {
            this.enter("THROW_AIMING");
          } else if (input.throwPressed && !input.armBusy) {
            // Quick throw: left click without aiming, straight along the crosshair.
            this.clickUsed = true;
            this.enter("THROW_THROWING");
          }

          break;

        case "THROW_AIMING":
          if (!wants) {
            this.enter("THROW_UNEQUIPPING");
          } else if (!input.aimHeld) {
            this.enter("THROW_EQUIPPED");
          } else if (input.throwPressed) {
            this.clickUsed = true;
            this.enter("THROW_THROWING");
          }

          break;

        default:
          break;
      }
    }

    this.updatePose(dt, input);
  }

  /** True once, on the frame the item leaves the hand. */
  public consumeRelease(): boolean {
    const release = this.releaseQueued;

    this.releaseQueued = false;

    return release;
  }

  /** The throw click was used by the stance (it must not also punch). */
  public get consumedClick(): boolean {
    return this.clickUsed;
  }

  public get isAiming(): boolean {
    return this.state === "THROW_AIMING";
  }

  /** Punching is off while aiming or throwing. */
  public get canPunch(): boolean {
    return this.state !== "THROW_AIMING" && this.state !== "THROW_THROWING";
  }

  /** So is blocking. */
  public get canBlock(): boolean {
    return this.canPunch;
  }

  /** Aiming or throwing: the upper body points where the player looks. */
  public get pointsAtCrosshair(): boolean {
    return !this.canPunch;
  }

  /** What is in the hand (or was last): the grenade, the Molotov or the smoke grenade. */
  public get heldKind(): HeldKind {
    return this.held;
  }

  /** The left hand has a small flame up to the rag (the Molotov is being lit). */
  public get lighting(): boolean {
    return (
      this.held === "molotov" &&
      this.state === "THROW_EQUIPPING" &&
      this.progress >= LIGHTER_FROM &&
      this.progress < LIGHTER_UNTIL
    );
  }

  /**
   * 0 to 1: how far the smoke grenade's pin has been pulled. Every time one is
   * taken out (the first and after each throw) the pin is in at the start of
   * the equip, comes out while the other hand is on it, and stays out.
   */
  public get pinPull(): number {
    if (this.held === "grenade") {
      // A grenade's pin comes out only at the start of the throw.
      return this.state === "THROW_THROWING"
        ? Math.min(Math.max(this.elapsed / this.pinTime, 0), 1)
        : 0;
    }

    if (this.held !== "smoke") {
      return 0;
    }

    switch (this.state) {
      case "THROW_EQUIPPING":
        return Math.min(
          Math.max((this.progress - PIN_FROM) / (PIN_TO - PIN_FROM), 0),
          1,
        );
      case "THROW_EQUIPPED":
      case "THROW_AIMING":
      case "THROW_THROWING":
      case "THROW_UNEQUIPPING":
        return 1;
      default:
        return 0;
    }
  }

  /** The Molotov is lit: from its ignition in the equip until it is thrown or put away. */
  public get lit(): boolean {
    if (this.held !== "molotov") {
      return false;
    }

    switch (this.state) {
      case "THROW_EQUIPPING":
        return this.progress >= LIT_AT;
      case "THROW_EQUIPPED":
      case "THROW_AIMING":
        return true;
      case "THROW_THROWING":
        return !this.released;
      default:
        return false;
    }
  }

  /** Whether the held item is shown in the hand. */
  public get itemVisible(): boolean {
    const progress = this.progress;

    switch (this.state) {
      case "THROW_EQUIPPING":
        return (
          progress >=
          (this.held === "grenade" ? EQUIP_ITEM_AT : EQUIP_MOLOTOV_AT)
        );
      case "THROW_EQUIPPED":
      case "THROW_AIMING":
        return true;
      case "THROW_THROWING":
        // Gone at the release; the next one comes out of the pocket after.
        return !this.released;
      case "THROW_UNEQUIPPING":
        return progress < UNEQUIP_ITEM_GONE_AT;
      default:
        return false;
    }
  }

  public get pose(): ThrowPose {
    const total = KEYS.reduce((sum, key) => sum + this.mix[key], 0) || 1;

    return {
      pocket: this.mix.pocket / total,
      light: this.mix.light / total,
      ready: this.mix.ready / total,
      aim: this.mix.aim / total,
      windup: this.mix.windup / total,
      release: this.mix.release / total,
      weight: this.overall,
    };
  }

  /** Back to the start (a new round). */
  public reset(): void {
    this.enter("NORMAL");
    this.releaseQueued = false;
    this.overall = 0;
  }

  /** The quick pin pull that starts a grenade's throw (none for the others). */
  private get pinTime(): number {
    return this.held === "grenade" ? THROW_TIMING.grenadePin : 0;
  }

  private get equipTime(): number {
    // A Molotov (lit) and a smoke grenade (pin pulled) are prepared with the
    // other hand on the way up, so they take the longer equip.
    return this.held === "grenade"
      ? THROW_TIMING.equip
      : THROW_TIMING.equipMolotov;
  }

  private get progress(): number {
    const length =
      this.state === "THROW_EQUIPPING"
        ? this.equipTime
        : this.state === "THROW_UNEQUIPPING"
          ? THROW_TIMING.unequip
          : this.state === "THROW_THROWING"
            ? this.pinTime + THROW_TIMING.throw
            : 1;

    return Math.min(this.elapsed / length, 1);
  }

  private enter(state: ThrowState): void {
    this.state = state;
    this.elapsed = 0;
    this.released = false;
  }

  /** Eases the key-position weights toward what the state asks for. */
  private updatePose(dt: number, input: ThrowInput): void {
    const progress = this.progress;
    let key: KeyName = "ready";
    let overall = 1;
    let rate = 14;

    switch (this.state) {
      case "NORMAL":
        key = "pocket";
        overall = 0;

        break;

      case "THROW_EQUIPPING":
        if (this.held !== "grenade") {
          // Out of the pocket, up to be lit (or its pin pulled), then ready to throw.
          key =
            progress < LIGHT_FROM
              ? "pocket"
              : progress < LIT_AT
                ? "light"
                : "ready";
        } else {
          key = progress < 0.35 ? "pocket" : "ready";
        }

        rate = 16;

        break;

      case "THROW_EQUIPPED":
        key = "ready";
        overall = input.armBusy ? 0 : 1;

        break;

      case "THROW_AIMING":
        key = "aim";

        break;

      case "THROW_THROWING": {
        // A grenade: the pin first (hand up, other hand on it), then the throw.
        const swing = (this.elapsed - this.pinTime) / THROW_TIMING.throw;

        key =
          this.elapsed < this.pinTime
            ? "light"
            : swing < 0.3
              ? "windup"
              : swing < 0.8
                ? "release"
                : "aim";
        rate = this.elapsed < this.pinTime ? 30 : 48;

        break;
      }

      case "THROW_UNEQUIPPING":
        key = "pocket";
        overall = progress < UNEQUIP_ITEM_GONE_AT ? 1 : 0;
        rate = 16;

        break;
    }

    const k = 1 - Math.exp(-rate * dt);

    for (const name of KEYS) {
      this.mix[name] += ((name === key ? 1 : 0) - this.mix[name]) * k;
    }

    this.overall += (overall - this.overall) * (1 - Math.exp(-18 * dt));
  }
}
