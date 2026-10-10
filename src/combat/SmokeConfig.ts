/**
 * All smoke-grenade tuning lives here. The radius drives both the cloud you
 * see and the area that hides things, so what looks like smoke is smoke.
 */
export const SMOKE_CONFIG = {
  /** How many a player starts with. */
  SMOKE_START_QUANTITY: 2,

  // ---- Flight (the shared model) ----
  SMOKE_THROW_SPEED: 18,
  SMOKE_GRAVITY: 15,
  SMOKE_GRAVITY_START: 1.5,
  SMOKE_GRAVITY_RAMP: 7,
  SMOKE_MAX_RANGE: 250,
  SMOKE_RADIUS: 0.06,

  // ---- Cloud ----
  /** Seconds from the throw until the canister starts to emit. */
  SMOKE_FUSE: 1.2,
  /** Radius at the moment it starts to emit, metres. */
  SMOKE_START_RADIUS: 0.8,
  /** Full radius, metres. */
  SMOKE_MAX_RADIUS: 5.0,
  /** Seconds to grow from the start radius to the full radius. */
  SMOKE_EXPAND_TIME: 1.8,
  /** Seconds the cloud stays at full size, counted from when it is fully grown. */
  SMOKE_DURATION: 14,
  /** Seconds it thins out and shrinks at the end. */
  SMOKE_FADE_TIME: 5,
  /** At most this many clouds exist at once (the oldest is dispersed first). */
  SMOKE_MAX_CLOUDS: 4,

  // ---- Look (drawing only) ----
  /** Puffs per cloud. */
  SMOKE_PARTICLE_COUNT: 90,
  /** Opacity of a single puff at full density (0 to 1). */
  SMOKE_OPACITY: 0.68,

  // ---- Visibility (gameplay) ----
  /**
   * How quickly smoke swallows sight: through a metre of full-density smoke
   * this share of the light is lost (as an exponential: exp(-k * metres)).
   */
  SMOKE_EXTINCTION: 1.15,
  /** Looking through smoke that lets less than this share of the view through is "blind". */
  SMOKE_SIGHT_THRESHOLD: 0.2,
  /** Share of the radius (from the centre) that is at full density; it thins out beyond. */
  SMOKE_CORE_SHARE: 0.62,
} as const;
