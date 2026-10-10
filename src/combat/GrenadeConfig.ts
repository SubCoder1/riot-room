/**
 * All normal-grenade tuning lives here, so playtesting means editing this one
 * block. The flight values drive both the aim preview and the real grenade,
 * and the blast radius drives both the explosion you see and the area that
 * hurts.
 */
export const GRENADE_CONFIG = {
  /** How many a player starts with. */
  GRENADE_START_QUANTITY: 3,

  // ---- Flight (the shared model: straight at first, then an arc) ----
  GRENADE_THROW_SPEED: 19,
  /** Downward acceleration, m/s^2, once gravity has fully built up. */
  GRENADE_GRAVITY: 15,
  /** Straight flight (metres) before gravity starts to build. */
  GRENADE_GRAVITY_START: 1.5,
  /** Metres over which gravity builds up. */
  GRENADE_GRAVITY_RAMP: 7,
  GRENADE_MAX_RANGE: 250,
  /** Collision radius of the grenade, metres. */
  GRENADE_RADIUS: 0.06,

  // ---- Detonation ----
  /** Seconds from the throw to the explosion. */
  GRENADE_FUSE: 2.5,
  /** Blast radius, metres: the ONE radius for the visual and the damage. */
  GRENADE_BLAST_RADIUS: 6.5,
  /** Damage right at the blast centre. */
  GRENADE_MAX_DAMAGE: 65,
  /** Share of the maximum damage left at the very edge of the radius. */
  GRENADE_EDGE_DAMAGE_SHARE: 0.1,
  /** Shape of the falloff: 1 is linear, higher drops off faster near the centre. */
  GRENADE_FALLOFF_EXPONENT: 1.4,
  /** Push distance (metres) at the centre, scaled by the same falloff. */
  GRENADE_KNOCKBACK: 2.2,
  /** Stagger (seconds) at the centre, scaled by the same falloff. */
  GRENADE_HITSTUN: 0.6,
  /** Share of the damage that gets through a raised guard (never 0). */
  GRENADE_GUARD_MULTIPLIER: 0.5,
  /** Share of the damage the thrower takes from their own grenade (0 = none). */
  GRENADE_SELF_DAMAGE_MULTIPLIER: 0,
  /** How far above a resting grenade the blast "starts" for the sight checks, metres. */
  GRENADE_BLAST_LIFT: 0.25,
} as const;
