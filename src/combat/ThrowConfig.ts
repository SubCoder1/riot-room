/**
 * What every throwable (normal grenade, Molotov, smoke grenade) shares: how
 * the flight is stepped, how many can be in the air and how they bounce.
 * Each item's own numbers live next to it (GrenadeConfig, MolotovConfig,
 * SmokeConfig). The flight values are used by BOTH the aim preview and the
 * real throw, so what you see while aiming is what you throw.
 */
export const THROW_CONFIG = {
  /** The flight is stepped in fixed slices, in the preview and in the real throw. */
  THROW_STEP: 1 / 60,
  /** At most this many throwables are in the air at once (the oldest is dropped). */
  THROW_MAX_ACTIVE: 16,
  /**
   * The throw is aimed at the point on the crosshair line this far away (or
   * where the line meets scenery), so the item leaves the hand but heads for
   * the crosshair instead of travelling parallel to it.
   */
  THROW_CONVERGE_DISTANCE: 30,

  /** Share of the speed straight into a surface that is kept on a bounce... */
  THROW_BOUNCE_RESTITUTION: 0.35,
  /** ...and share of the sliding speed that is lost on each bounce. */
  THROW_BOUNCE_FRICTION: 0.35,
  /**
   * Landing on a floor slower than this (m/s, straight into it) the item stops
   * bouncing and rolls along the surface instead.
   */
  THROW_ROLL_ENTER_SPEED: 2.5,
  /** How fast a rolling item slows down (share of its speed lost per second). */
  THROW_ROLL_DRAG: 3.0,
  /** Below this speed (m/s) a rolling item has come to rest. */
  THROW_REST_SPEED: 0.35,
  /** An item that hits a body glances off it, keeping this share of its speed. */
  THROW_BODY_RESTITUTION: 0.3,
} as const;
