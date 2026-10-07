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
  unequip: 0.28,
  throw: 0.3,
} as const;

/** Where in the throw (0 to 1) the rock leaves the hand. */
const RELEASE_AT = 0.45;
/** Where in the equip the rock appears (the hand is at the pocket). */
const EQUIP_ROCK_AT = 0.45;
/** Where in the put-away the rock vanishes (the hand is at the pocket). */
const UNEQUIP_ROCK_GONE_AT = 0.6;

export interface RockInput {
  /** ROCKS is the selected slot. */
  selected: boolean;
  /** Rocks left in the inventory. */
  count: number;
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
 * Where the throwing hand goes, as weights of five key positions (they sum to
 * 1) and how much the pose overrides the normal animation (0 = none).
 */
export interface RockPose {
  pocket: number;
  ready: number;
  aim: number;
  windup: number;
  release: number;
  weight: number;
}

type KeyName = "pocket" | "ready" | "aim" | "windup" | "release";

const KEYS: readonly KeyName[] = [
  "pocket",
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
  private clickUsed = false;

  private readonly mix: Record<KeyName, number> = {
    pocket: 1,
    ready: 0,
    aim: 0,
    windup: 0,
    release: 0,
  };
  private overall = 0;

  public update(dt: number, input: RockInput): void {
    this.clickUsed = false;
    this.elapsed += dt;

    const wants = input.selected && input.count > 0;

    // Time-driven transitions.
    switch (this.state) {
      case "ROCK_EQUIPPING":
        if (this.elapsed >= ROCK_TIMING.equip) {
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
              : input.count > 0
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
          if (wants) {
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

  /** Whether a rock is shown in the hand. */
  public get rockVisible(): boolean {
    const progress = this.progress;

    switch (this.state) {
      case "ROCK_EQUIPPING":
        return progress >= EQUIP_ROCK_AT;
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

  private get progress(): number {
    const length =
      this.state === "ROCK_EQUIPPING"
        ? ROCK_TIMING.equip
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
        key = progress < 0.35 ? "pocket" : "ready";
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
