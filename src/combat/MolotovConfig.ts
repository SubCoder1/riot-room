/**
 * All Molotov tuning lives here, so playtesting means editing this one block.
 * The flight values drive both the aim preview and the real bottle (the same
 * way the rock does), and the radius drives both the fire you see and the area
 * that burns you.
 */
export const MOLOTOV_CONFIG = {
  // ---- Flight (same model as the rock: straight at first, then an arc) ----
  MOLOTOV_THROW_SPEED: 24,
  /** Downward acceleration, m/s^2, once gravity has fully built up. */
  MOLOTOV_GRAVITY: 16,
  /** Straight flight (metres) before gravity starts to build. */
  MOLOTOV_GRAVITY_START: 3,
  /** Metres over which gravity builds up. */
  MOLOTOV_GRAVITY_RAMP: 22,
  MOLOTOV_MAX_RANGE: 250,
  /** Collision radius of the bottle, metres. */
  MOLOTOV_RADIUS: 0.09,

  // ---- Fire zone ----
  /** Full radius of the burning area, metres: the ONE radius for visuals and damage. */
  MOLOTOV_MAX_RADIUS: 3.0,
  /** Radius at the moment of impact, metres. */
  MOLOTOV_START_RADIUS: 0.5,
  /** Seconds to spread from the start radius to the full radius. */
  MOLOTOV_SPREAD_TIME: 0.8,
  /** Seconds the fire stays at full size, counted from when it is fully spread. */
  MOLOTOV_DURATION: 7.0,
  /** Seconds the fire shrinks and fades out at the end (it burns, then is removed). */
  MOLOTOV_FIRE_FADE_TIME: 0.8,
  /** At most this many fires exist at once (the oldest is put out first). */
  MOLOTOV_MAX_ZONES: 8,

  // ---- Damage over time ----
  /** Seconds between damage ticks for a player standing in fire. */
  MOLOTOV_TICK_INTERVAL: 0.5,
  /** Damage of the first tick. */
  MOLOTOV_DAMAGE_PER_TICK: 7,
  /** Staying in the fire hurts more: ticks grow up to this many times the base... */
  MOLOTOV_MAX_RAMP: 1.8,
  /** ...over this many seconds of continuous burning. */
  MOLOTOV_RAMP_SECONDS: 3,
  /**
   * The most one tick can ever do, whatever the ramp or how many fires overlap.
   * Overlapping fires never add ticks: a player takes at most one tick per interval.
   */
  MOLOTOV_MAX_OVERLAP_DAMAGE: 14,
  /** How long (seconds) after leaving the fire the burn-ramp takes to reset. */
  MOLOTOV_RAMP_RESET_TIME: 1.0,
  /** Extra reach around a body that counts as "in the fire", metres. */
  MOLOTOV_BODY_RADIUS: 0.3,
  /** How far above / below the fire a body's feet can be and still burn, metres. */
  MOLOTOV_VERTICAL_REACH: 1.2,
} as const;
