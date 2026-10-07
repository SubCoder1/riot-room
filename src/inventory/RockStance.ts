/**
 * The rock-in-hand states: what the player is doing with their ROCKS, and the
 * arm pose that goes with it. Pure logic (no input, rendering or combat), so it
 * is easy to test and the same states can later be driven by the network.
 *
 *   NORMAL -> EQUIPPING -> EQUIPPED <-> AIMING -> THROWING (a left click from
 *   EQUIPPED is a quick throw, no aiming needed) -> back to AIMING /
 *   EQUIPPED, and UNEQUIPPING (the put-away) from any of them when the player
 *   switches away.
 *
 * The rock itself is spent by the caller when `consumeRelease()` fires.
 */

export type RockState =
  | "NORMAL"
  | "ROCK_EQUIPPING"
  | "ROCK_EQUIPPED"
  | "ROCK_AIMING"
  | "ROCK_THROWING"
  | "ROCK_UNEQUIPPING";

/** Seconds. The animations are deliberately tiny. */
export const ROCK_TIMING = {
  equip: 0.32,
  /** The Molotov takes a little longer: out of the pocket, then lit. */
  equipMolotov: 0.7,
  unequip: 0.28,
  throw: 0.3,
} as const;

/** Where in the throw (0 to 1) the rock leaves the hand. */
const RELEASE_AT = 0.45;
/** Where in the equip the rock appears (the hand is at the pocket). */
const EQUIP_ROCK_AT = 0.45;
const EQUIP_MOLOTOV_AT = 0.25;
/** Where in the Molotov equip the hand is up in the lighting position, and lit. */
const LIGHT_FROM = 0.22;
const LIT_AT = 0.74;
/** The lighter flame is in the left hand from here, until just after the rag catches. */
const LIGHTER_FROM = 0.34;
const LIGHTER_UNTIL = 0.84;
/** Where in the put-away the rock vanishes (the hand is at the pocket). */
const UNEQUIP_ROCK_GONE_AT = 0.6;

/** What the hand holds: the rock and the Molotov share every state and the throw. */
export type HeldKind = "rock" | "molotov";

export interface RockInput {
  /** A throwable (ROCKS or MOLOTOV) is the selected slot. */
  selected: boolean;
  /** How many of the selected throwable are left in the inventory. */
  count: number;
  /** Which throwable is selected (the rock if not given). */
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
   * the rock pose lets go of it. The rock stays in the hand.
   */
  armBusy: boolean;
}

/**
 * Where the throwing hand goes, as weights of six key positions (they sum to
 * 1) and how much the pose overrides the normal animation (0 = none).
 */
export interface RockPose {
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

export class RockStance {
  public state: RockState = "NORMAL";
  /** Seconds in the current state. */
  public elapsed = 0;

  private released = false;
  private releaseQueued = false;
  private held: HeldKind = "rock";
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

  public update(dt: number, input: RockInput): void {
    this.clickUsed = false;
    this.elapsed += dt;

    const kind = input.kind ?? "rock";
    const wantsAny = input.selected && input.count > 0;
    // Wanting the same thing that is already in the hand. Another kind means
    // the one in the hand is put away first, then the new one comes out.
    const wants = wantsAny && (this.state === "NORMAL" || kind === this.held);
    const heldCount = input.heldCount ?? input.count;

    // Time-driven transitions.
    switch (this.state) {
      case "ROCK_EQUIPPING":
        if (this.elapsed >= this.equipTime) {
          this.enter("ROCK_EQUIPPED");
        }

        break;

      case "ROCK_UNEQUIPPING":
        if (this.elapsed >= ROCK_TIMING.unequip) {
          this.enter("NORMAL");
        }

        break;

      case "ROCK_THROWING":
        if (!this.released && this.elapsed >= ROCK_TIMING.throw * RELEASE_AT) {
          this.released = true;
          this.releaseQueued = true;
        }

        if (this.elapsed >= ROCK_TIMING.throw) {
          // Another rock left: the hand reaches into the pocket for it (the
          // equip animation again). Switched away with rocks left: put them away.
          this.enter(
            wants
              ? "ROCK_EQUIPPING"
              : heldCount > 0
                ? "ROCK_UNEQUIPPING"
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
            this.enter("ROCK_EQUIPPING");
          }

          break;

        case "ROCK_UNEQUIPPING":
          if (wants) {
            this.enter("ROCK_EQUIPPING");
          }

          break;

        case "ROCK_EQUIPPING":
          if (!wants) {
            this.enter("ROCK_UNEQUIPPING");
          }

          break;

        case "ROCK_EQUIPPED":
          if (!wants) {
            this.enter("ROCK_UNEQUIPPING");
          } else if (input.aimHeld && !input.armBusy) {
            this.enter("ROCK_AIMING");
          } else if (input.throwPressed && !input.armBusy) {
            // Quick throw: left click without aiming, straight along the crosshair.
            this.clickUsed = true;
            this.enter("ROCK_THROWING");
          }

          break;

        case "ROCK_AIMING":
          if (!wants) {
            this.enter("ROCK_UNEQUIPPING");
          } else if (!input.aimHeld) {
            this.enter("ROCK_EQUIPPED");
          } else if (input.throwPressed) {
            this.clickUsed = true;
            this.enter("ROCK_THROWING");
          }

          break;

        default:
          break;
      }
    }

    this.updatePose(dt, input);
  }

  /** True once, on the frame the rock leaves the hand. */
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
    return this.state === "ROCK_AIMING";
  }

  /** Punching is off while aiming or throwing. */
  public get canPunch(): boolean {
    return this.state !== "ROCK_AIMING" && this.state !== "ROCK_THROWING";
  }

  /** So is blocking. */
  public get canBlock(): boolean {
    return this.canPunch;
  }

  /** Aiming or throwing: the upper body points where the player looks. */
  public get pointsAtCrosshair(): boolean {
    return !this.canPunch;
  }

  /** What is in the hand (or was last): the rock or the Molotov. */
  public get heldKind(): HeldKind {
    return this.held;
  }

  /** The left hand has a small flame up to the rag (the Molotov is being lit). */
  public get lighting(): boolean {
    return (
      this.held === "molotov" &&
      this.state === "ROCK_EQUIPPING" &&
      this.progress >= LIGHTER_FROM &&
      this.progress < LIGHTER_UNTIL
    );
  }

  /** The Molotov is lit: from its ignition in the equip until it is thrown or put away. */
  public get lit(): boolean {
    if (this.held !== "molotov") {
      return false;
    }

    switch (this.state) {
      case "ROCK_EQUIPPING":
        return this.progress >= LIT_AT;
      case "ROCK_EQUIPPED":
      case "ROCK_AIMING":
        return true;
      case "ROCK_THROWING":
        return !this.released;
      default:
        return false;
    }
  }

  /** Whether the held item (rock or Molotov) is shown in the hand. */
  public get rockVisible(): boolean {
    const progress = this.progress;

    switch (this.state) {
      case "ROCK_EQUIPPING":
        return (
          progress >=
          (this.held === "molotov" ? EQUIP_MOLOTOV_AT : EQUIP_ROCK_AT)
        );
      case "ROCK_EQUIPPED":
      case "ROCK_AIMING":
        return true;
      case "ROCK_THROWING":
        // Gone at the release; the next one comes out of the pocket after.
        return !this.released;
      case "ROCK_UNEQUIPPING":
        return progress < UNEQUIP_ROCK_GONE_AT;
      default:
        return false;
    }
  }

  public get pose(): RockPose {
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

  private get equipTime(): number {
    return this.held === "molotov"
      ? ROCK_TIMING.equipMolotov
      : ROCK_TIMING.equip;
  }

  private get progress(): number {
    const length =
      this.state === "ROCK_EQUIPPING"
        ? this.equipTime
        : this.state === "ROCK_UNEQUIPPING"
          ? ROCK_TIMING.unequip
          : this.state === "ROCK_THROWING"
            ? ROCK_TIMING.throw
            : 1;

    return Math.min(this.elapsed / length, 1);
  }

  private enter(state: RockState): void {
    this.state = state;
    this.elapsed = 0;
    this.released = false;
  }

  /** Eases the key-position weights toward what the state asks for. */
  private updatePose(dt: number, input: RockInput): void {
    const progress = this.progress;
    let key: KeyName = "ready";
    let overall = 1;
    let rate = 14;

    switch (this.state) {
      case "NORMAL":
        key = "pocket";
        overall = 0;

        break;

      case "ROCK_EQUIPPING":
        if (this.held === "molotov") {
          // Out of the pocket, up to be lit, then ready to throw.
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

      case "ROCK_EQUIPPED":
        key = "ready";
        overall = input.armBusy ? 0 : 1;

        break;

      case "ROCK_AIMING":
        key = "aim";

        break;

      case "ROCK_THROWING":
        key = progress < 0.3 ? "windup" : progress < 0.8 ? "release" : "aim";
        rate = 48;

        break;

      case "ROCK_UNEQUIPPING":
        key = "pocket";
        overall = progress < UNEQUIP_ROCK_GONE_AT ? 1 : 0;
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
