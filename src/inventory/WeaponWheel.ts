import type { PlayerUtilities, UtilityType } from "./PlayerUtilities";

/** How long the wheel stays up after the last scroll (seconds). */
export const WHEEL_VISIBLE_SECONDS = 1.5;

/**
 * The weapon wheel's behaviour, with no drawing and no input devices.
 *
 * Scrolling the mouse wheel at any time brings the wheel up and, in the same
 * moment, moves to the next (or previous) slot and equips it. The wheel fades
 * out on its own a moment after the last scroll. Nothing here needs a held key,
 * so it never gets in the way of whatever the player is doing.
 */
export class WeaponWheel {
  private readonly utilities: PlayerUtilities;
  private visibleLeft = 0;

  constructor(utilities: PlayerUtilities) {
    this.utilities = utilities;
  }

  /** Whether the wheel is on screen. */
  public get isOpen(): boolean {
    return this.visibleLeft > 0;
  }

  /** The slot that is selected (and shown highlighted on the wheel). */
  public get highlighted(): UtilityType {
    return this.utilities.selected;
  }

  public get highlightedIndex(): number {
    return Math.max(
      0,
      this.utilities.slots.findIndex((s) => s.type === this.utilities.selected),
    );
  }

  /**
   * One mouse-wheel scroll: positive steps go to the next slot, negative to the
   * previous, wrapping around. The wheel opens (or stays open, with its timer
   * restarted) and the new slot is equipped immediately.
   */
  public scroll(steps: number): void {
    const whole = Math.trunc(steps);

    if (whole === 0) {
      return;
    }

    const count = this.utilities.slots.length;
    const next = (((this.highlightedIndex + whole) % count) + count) % count;

    this.utilities.select(this.utilities.slots[next].type);
    this.visibleLeft = WHEEL_VISIBLE_SECONDS;
  }

  /** Counts down the time the wheel stays up. Call once per frame. */
  public update(dt: number): void {
    if (this.visibleLeft > 0) {
      this.visibleLeft = Math.max(0, this.visibleLeft - dt);
    }
  }
}
