/**
 * The Armory's two mechanisms, as plain logic (no drawing, no input, no
 * combat): the chain-operated roll-up shutter over the east passage and the
 * one-way steel hatch in the south passage. The game feeds them input
 * each frame; the views and the collision follow their state.
 *
 * The shutter's chain is on the walkway side; the hatch is operated from
 * inside the Armory (x -31.7 to -20.5, z 5.3 to 12, floor 4) and only once.
 */

/** Every tunable number of the two mechanisms, in one place. */
export const ARMORY = {
  /** The first floor, and the shutter's curtain plane (the middle of the steel frame in the east wall's opening). */
  FLOOR: 4,
  SHUTTER_X: -20.44,
  /** How thick the curtain's collision is (x). */
  SHUTTER_THICKNESS: 0.16,
  /** The doorway the curtain closes (z), and its height. */
  SHUTTER_Z0: 7.0,
  SHUTTER_Z1: 9.0,
  SHUTTER_HEIGHT: 2.6,

  // ------------------------------------------------------------ the chain
  /** Seconds to haul the shutter from shut to fully up, hand over hand. */
  OPEN_SECONDS: 5.5,
  /** Each haul: a pull, then a pause while the hands change over. */
  HAUL_PULL: 0.7,
  HAUL_PAUSE: 0.25,
  /** Pulls are uneven: the speed wanders by this fraction along the lift. */
  HAUL_UNEVENNESS: 0.22,
  /** From taking the chain to the shutter starting to move (the slack). */
  ENGAGE_LAG: 0.12,
  /** From letting go to the shutter starting to fall. */
  RELEASE_DELAY: 0.35,
  /** Falling: gravity (m/s^2) and the most it reaches (m/s). */
  FALL_ACCEL: 2.2,
  FALL_MAX_SPEED: 2.6,
  /** Where the curtain catches in its guides on the way down (lift, m). */
  FALL_CATCHES: [1.7, 0.9],
  /** A catch slows the fall to this fraction of its speed. */
  FALL_CATCH_FACTOR: 0.4,
  /** How far the chain moves along its loop for each metre of lift. */
  CHAIN_METRES_PER_LIFT: 1.6,

  // -------------------------------------------------------------- crushing
  /** Bodies this close to the curtain's line (x, z) can be caught beneath it. */
  CRUSH_BODY_RADIUS: 0.25,
  CRUSH_EDGE_INSET: 0.05,

  // ----------------------------------------------------------- the chain wheel
  /** Where the hand chain hangs: the outer face of the east wall, on the walkway. */
  CHAIN_X: -20.12,
  CHAIN_Z: 9.45,
  CHAIN_TOP_Y: 3.12,
  CHAIN_BOTTOM_Y: 1.3,
  /** The wheel's radius (m). */
  CHAIN_WHEEL_RADIUS: 0.17,
  /** The leaf has swung clear of the passage from this angle on (rad). */
  DOOR_PASSABLE_ANGLE: 0.9,
  /** And stands against the jamb from this one. */
  DOOR_STANDING_ANGLE: 1.4,
  /** The camera yaw that faces the wall at the chain, from the walkway. */
  CHAIN_YAW: Math.PI / 2,
  /** How near the wheel and the chain a hand reaches (m, along the floor). */
  CHAIN_REACH: 1.0,

  // ------------------------------------------------------------- the hatch
  /**
   * The south passage (x -27 to -25, 2.6 m high, in the wall z 12 to 12.3) is
   * lined with a steel frame, and the hatch hangs in it: its hinge is the west
   * jamb's inner face, its leaf a little smaller than the lined opening.
   */
  DOOR_HINGE_X: -26.93,
  DOOR_Z: 12.15,
  /** The leaf: 1.82 wide and 2.48 high in an opening lined down to 1.86 x 2.53. */
  DOOR_WIDTH: 1.82,
  DOOR_HEIGHT: 2.48,
  DOOR_THICKNESS: 0.1,
  /** The layout's opening, which the closed hatch fills for collision. */
  DOOR_OPENING_MIN_X: -27,
  DOOR_OPENING_MAX_X: -25,
  DOOR_OPENING_HEIGHT: 2.6,
  /** It swings out into the Hall, a little past square so it stands clear of the way. */
  DOOR_OPEN_ANGLE: 1.66,
  /** The latch draws back, a heavy pause, then the swing (seconds). */
  LATCH_SECONDS: 0.7,
  LATCH_PAUSE: 0.3,
  SWING_SECONDS: 2.3,
  /** How near the release lever (m) and how close to the view line (rad). */
  DOOR_REACH: 2.3,
  HANDLE_AIM: 0.85,
};

export type ShutterState =
  "closed" | "opening" | "held" | "released" | "falling";

/** What the shutter tells whoever listens (audio, feedback). */
export interface ShutterEvents {
  /** The chain takes the strain and the shutter starts to lift. */
  onStrain?: () => void;
  /** The shutter starts to fall. */
  onFallStart?: () => void;
  /** The curtain catches in its guides on the way down (a rattle). */
  onCatch?: () => void;
  /** The curtain has landed, at this speed (m/s). */
  onClosed?: (impactSpeed: number) => void;
}

const STEP = 1 / 120;

/**
 * A heavy counterbalanced shutter that only the chain lifts. While the chain is
 * hauled it rises in uneven pulls; let go and, after a short delay, it falls,
 * several times faster than it rose. There is no brake: it never hangs in the air.
 */
export class ChainShutter {
  public static readonly MAX_LIFT = ARMORY.SHUTTER_HEIGHT;

  public state: ShutterState = "closed";
  /** How far the curtain's bottom edge is above the floor (0 shut, MAX_LIFT up). */
  public lift = 0;
  /** Signed speed of the edge (m/s, up positive). */
  public velocity = 0;
  /** Counts each fall, so something that happens once per fall knows which. */
  public descent = 0;
  public events: ShutterEvents = {};

  private haulClock = 0;
  private lag = 0;
  private releaseTimer = 0;
  private catches = 0;
  private leftover = 0;

  /** The speed of a pull, so the whole climb takes OPEN_SECONDS on average. */
  private static readonly PULL_SPEED =
    ARMORY.SHUTTER_HEIGHT /
    (ARMORY.OPEN_SECONDS *
      (ARMORY.HAUL_PULL / (ARMORY.HAUL_PULL + ARMORY.HAUL_PAUSE)));

  /** How far the chain runs in one pull: the hands' stroke in the pulling pose. */
  public static readonly STROKE =
    ChainShutter.PULL_SPEED * ARMORY.HAUL_PULL * ARMORY.CHAIN_METRES_PER_LIFT;

  /** 0 to 1: how far up the shutter is. */
  public get openness(): number {
    return this.lift / ChainShutter.MAX_LIFT;
  }

  /** The curtain's bottom edge in the world. */
  public get edgeY(): number {
    return ARMORY.FLOOR + this.lift;
  }

  public get isFalling(): boolean {
    return this.state === "falling";
  }

  /** How far the chain has been drawn: tied to the lift, never run alone. */
  public get chainTravel(): number {
    return this.lift * ARMORY.CHAIN_METRES_PER_LIFT;
  }

  /** Back to shut, for a new round. */
  public reset(): void {
    this.state = "closed";
    this.lift = 0;
    this.velocity = 0;
    this.haulClock = 0;
    this.lag = 0;
    this.releaseTimer = 0;
    this.catches = 0;
    this.leftover = 0;
  }

  /**
   * Advances by `dt`. `hauling` is whether the chain is being pulled right now.
   * Time is cut into fixed small steps, so any frame rate gives the same motion.
   */
  public update(dt: number, hauling: boolean): void {
    this.leftover += Math.min(dt, 0.1);

    while (this.leftover >= STEP) {
      this.leftover -= STEP;
      this.step(STEP, hauling);
    }
  }

  private step(dt: number, hauling: boolean): void {
    if (hauling) {
      if (this.state !== "opening" && this.state !== "held") {
        this.state = this.lift >= ChainShutter.MAX_LIFT ? "held" : "opening";
        this.lag = ARMORY.ENGAGE_LAG;
        this.velocity = 0;
        this.releaseTimer = 0;

        if (this.state === "opening") {
          this.events.onStrain?.();
        }
      }

      this.haul(dt);

      return;
    }

    // The chain is let go: it stops at once, then (after the delay) falls.
    if (this.state === "opening" || this.state === "held") {
      this.state = "released";
      this.releaseTimer = ARMORY.RELEASE_DELAY;
      this.velocity = 0;
    }

    if (this.state === "released") {
      this.releaseTimer -= dt;

      if (this.releaseTimer <= 0) {
        this.state = "falling";
        this.descent++;
        this.catches = 0;
        this.velocity = 0;
        this.events.onFallStart?.();
      }

      return;
    }

    if (this.state === "falling") {
      this.fall(dt);
    }
  }

  private haul(dt: number): void {
    if (this.state === "held") {
      this.velocity = 0;

      return;
    }

    if (this.lag > 0) {
      this.lag -= dt;
      this.velocity = 0;

      return;
    }

    this.haulClock += dt;

    const cycle = ARMORY.HAUL_PULL + ARMORY.HAUL_PAUSE;
    const pulling = this.haulClock % cycle < ARMORY.HAUL_PULL;
    // An uneven pull: stronger and weaker along the lift, as a worn drum is.
    const uneven =
      1 +
      ARMORY.HAUL_UNEVENNESS *
        Math.sin(this.lift * 9.1) *
        Math.cos(this.lift * 3.7 + 1);

    this.velocity = pulling ? ChainShutter.PULL_SPEED * uneven : 0;
    this.lift += this.velocity * dt;

    if (this.lift >= ChainShutter.MAX_LIFT) {
      this.lift = ChainShutter.MAX_LIFT;
      this.velocity = 0;
      this.state = "held";
    }
  }

  private fall(dt: number): void {
    this.velocity = Math.max(
      this.velocity - ARMORY.FALL_ACCEL * dt,
      -ARMORY.FALL_MAX_SPEED,
    );

    const before = this.lift;

    this.lift += this.velocity * dt;

    // Catching in the guides: a lurch that slows it, then it runs on.
    const next = ARMORY.FALL_CATCHES[this.catches];

    if (next !== undefined && before > next && this.lift <= next) {
      this.catches++;
      this.velocity *= ARMORY.FALL_CATCH_FACTOR;
      this.events.onCatch?.();
    }

    if (this.lift <= 0) {
      const impact = -this.velocity;

      this.lift = 0;
      this.velocity = 0;
      this.state = "closed";
      this.events.onClosed?.(impact);
    }
  }
}

/**
 * Is a body caught under the falling shutter? It must be on the shutter's line
 * (within the doorway, in the thickness of the curtain, on its floor) and the
 * bottom edge must have come down to its head: a body the edge has not reached
 * is untouched, and so is one standing safely clear to either side.
 */
export function caughtUnderShutter(
  feet: { x: number; y: number; z: number },
  headY: number,
  edgeY: number,
): boolean {
  const half = ARMORY.SHUTTER_THICKNESS / 2 + ARMORY.CRUSH_BODY_RADIUS;

  return (
    Math.abs(feet.x - ARMORY.SHUTTER_X) <= half &&
    feet.z >= ARMORY.SHUTTER_Z0 + ARMORY.CRUSH_EDGE_INSET &&
    feet.z <= ARMORY.SHUTTER_Z1 - ARMORY.CRUSH_EDGE_INSET &&
    Math.abs(feet.y - ARMORY.FLOOR) < 0.6 &&
    edgeY <= headY
  );
}

// ================================================================ the hatch

export type DoorSide = "inside" | "outside";

export type HatchResult =
  "opening" | "refused-outside" | "refused-blocked" | "refused-busy";

export type HatchPhase =
  "closed" | "unlatching" | "waiting" | "swinging" | "open";

/** What the hatch tells whoever listens (audio, feedback). */
export interface HatchEvents {
  /** The latch bar starts to draw back. */
  onUnlatch?: () => void;
  /** The leaf starts to swing. */
  onSwingStart?: () => void;
  /** The heavy leaf groans on its hinges (twice, part-way through). */
  onCreak?: () => void;
  /** The leaf has come to rest, wide open. */
  onSettle?: () => void;
}

/** 0 to 1 over the swing: slow to get its weight moving, slow to come to rest. */
function heavy(u: number): number {
  return u * u * u * (u * (u * 6 - 15) + 10);
}

/**
 * A heavy steel hatch that opens from the Armory side only, and only once: a
 * pull on the release lever draws the latch bar, there is a pause, the leaf
 * swings out into the Hall on its west hinge and stays there for good. There is
 * no way to shut it, no timer and no reset when you leave. From the Hall side
 * there is nothing to operate: it is locked.
 */
export class OneWayHatch {
  /** 0 shut, DOOR_OPEN_ANGLE wide open. */
  public angle = 0;
  /** It swings out into the Hall (-1), away from the room. */
  public readonly dir: 1 | -1 = -1;
  /** The latch: 0 shot, 1 fully drawn. */
  public latch = 0;
  /** A short rattle of the leaf in its frame after a try from outside (seconds left). */
  public rattle = 0;
  public events: HatchEvents = {};

  public phase: HatchPhase = "closed";
  private time = 0;
  private creaks = 0;

  /** True from the first pull on: nothing can restart it. */
  public get started(): boolean {
    return this.phase !== "closed";
  }

  public get isOpen(): boolean {
    return this.phase === "open";
  }

  /**
   * The leaf holds the doorway only until it has swung clear of the way
   * through: from there on one can go out past it while it is still moving.
   */
  public get isSolid(): boolean {
    return this.angle < ARMORY.DOOR_PASSABLE_ANGLE;
  }

  /** The leaf is near enough to its rest that it stands against the jamb as a solid. */
  public get leafStands(): boolean {
    return this.angle >= ARMORY.DOOR_STANDING_ANGLE;
  }

  /** Whether the leaf is moving, or about to (so the game watches its sweep). */
  public get isMoving(): boolean {
    return this.phase === "waiting" || this.phase === "swinging";
  }

  /** For a new session only: the game does not call this between rounds. */
  public reset(): void {
    this.angle = 0;
    this.latch = 0;
    this.rattle = 0;
    this.phase = "closed";
    this.time = 0;
    this.creaks = 0;
  }

  /**
   * An E press at the release lever, from one side. `blocked` is whether
   * someone stands where the leaf would sweep.
   */
  public interact(side: DoorSide, blocked: boolean): HatchResult {
    // Nothing to operate from the Hall: it is locked from that side.
    if (side === "outside") {
      this.rattle = 0.45;

      return "refused-outside";
    }

    if (this.started) {
      return "refused-busy";
    }

    if (blocked) {
      return "refused-blocked";
    }

    this.phase = "unlatching";
    this.time = 0;
    this.events.onUnlatch?.();

    return "opening";
  }

  /** `hold` stops the leaf where it is (someone has stepped into its sweep). */
  public update(dt: number, hold = false): void {
    this.rattle = Math.max(0, this.rattle - dt);

    if (this.phase === "closed" || this.phase === "open") {
      return;
    }

    // The latch is not held up by a body in the sweep: only the swing is.
    if (hold && (this.phase === "waiting" || this.phase === "swinging")) {
      return;
    }

    this.time += dt;

    if (this.phase === "unlatching") {
      this.latch = Math.min(this.time / ARMORY.LATCH_SECONDS, 1);

      if (this.time >= ARMORY.LATCH_SECONDS) {
        this.phase = "waiting";
        this.time = 0;
      }

      return;
    }

    if (this.phase === "waiting") {
      if (this.time >= ARMORY.LATCH_PAUSE) {
        this.phase = "swinging";
        this.time = 0;
        this.events.onSwingStart?.();
      }

      return;
    }

    const u = Math.min(this.time / ARMORY.SWING_SECONDS, 1);

    this.angle = ARMORY.DOOR_OPEN_ANGLE * heavy(u);

    // It groans as it gathers weight, and again as it slows.
    if (this.creaks === 0 && u > 0.25) {
      this.creaks = 1;
      this.events.onCreak?.();
    } else if (this.creaks === 1 && u > 0.7) {
      this.creaks = 2;
      this.events.onCreak?.();
    }

    if (u >= 1) {
      this.angle = ARMORY.DOOR_OPEN_ANGLE;
      this.phase = "open";
      this.events.onSettle?.();
    }
  }
}

/**
 * Whether anyone stands where the door leaf sweeps when it swings toward `dir`
 * (+1 into the room, -1 out into the Hall): a half disc of the leaf's length on
 * that side, and the doorway itself. The hatch will not swing through a body.
 * `feet` are the positions of the characters to check.
 */
export function doorSweepBlocked(
  feet: ReadonlyArray<{ x: number; y: number; z: number }>,
  dir: 1 | -1,
): boolean {
  const reach = ARMORY.DOOR_WIDTH + 0.4;

  return feet.some((f) => {
    if (Math.abs(f.y - ARMORY.FLOOR) > 1) {
      return false;
    }

    const dx = f.x - ARMORY.DOOR_HINGE_X;
    // Along the swing: positive is the side it swings to (z grows toward the Hall).
    const along = (ARMORY.DOOR_Z - f.z) * dir;

    return along >= -0.35 && dx >= -0.45 && Math.hypot(dx, along) <= reach;
  });
}

// =============================================================== reaching them

export interface Reach {
  feet: { x: number; y: number; z: number };
  /** The eye, and the unit direction the player looks along. */
  eye: { x: number; y: number; z: number };
  dir: { x: number; y: number; z: number };
}

/** The angle (rad) between the look direction and the way to a point, and the distance to it. */
function aimAt(
  reach: Reach,
  x: number,
  y: number,
  z: number,
): { angle: number; distance: number } {
  const dx = x - reach.eye.x;
  const dy = y - reach.eye.y;
  const dz = z - reach.eye.z;
  const distance = Math.hypot(dx, dy, dz) || 1e-6;
  const cos =
    (dx * reach.dir.x + dy * reach.dir.y + dz * reach.dir.z) / distance;

  return { angle: Math.acos(Math.min(1, Math.max(-1, cos))), distance };
}

/**
 * Is the player close enough to the hand chain to haul it? On the walkway
 * outside, on the floor, near the wheel. Where they look does not matter: this
 * is what keeps a haul going once it has started.
 */
export function chainNear(reach: Reach): boolean {
  const { feet } = reach;

  return (
    Math.abs(feet.y - ARMORY.FLOOR) <= 0.6 &&
    feet.x >= ARMORY.CHAIN_X &&
    Math.hypot(feet.x - ARMORY.CHAIN_X, feet.z - ARMORY.CHAIN_Z) <=
      ARMORY.CHAIN_REACH
  );
}

/**
 * Is the hand chain within reach and being looked toward? That is what takes
 * hold of it: near the wheel, and facing it.
 */
export function chainInReach(reach: Reach): boolean {
  return (
    chainNear(reach) &&
    aimAt(reach, ARMORY.CHAIN_X, ARMORY.FLOOR + 2.2, ARMORY.CHAIN_Z).angle <=
      0.95
  );
}

/** Where the leaf's point `along` its width from the hinge is, at height y. */
export function doorPoint(
  door: Pick<OneWayHatch, "angle" | "dir">,
  along: number,
  y: number,
  face: number,
): { x: number; y: number; z: number } {
  const a = door.angle * door.dir;
  // The leaf lies along +x when shut; it turns toward -z (into the room) for dir +1.
  const x = along * Math.cos(a) + face * Math.sin(a);
  const z = -along * Math.sin(a) + face * Math.cos(a);

  return { x: ARMORY.DOOR_HINGE_X + x, y, z: ARMORY.DOOR_Z + z };
}

export interface DoorAim {
  side: DoorSide;
}

/** Where on the leaf (from the hinge, and up from the floor) the release lever is. */
export const LEVER = { along: 1.58, height: 0.75 };

/**
 * Is the hatch under the crosshair while it is still shut? From the Armory
 * side that is the release lever; from the Hall it is the plain steel (where
 * there is nothing to pull). Null once it has been opened: there is nothing
 * left to do.
 */
export function doorAim(
  reach: Reach,
  door: Pick<OneWayHatch, "angle" | "dir" | "started">,
): DoorAim | null {
  if (door.started || Math.abs(reach.feet.y - ARMORY.FLOOR) > 0.8) {
    return null;
  }

  const leafSide = reach.feet.z < ARMORY.DOOR_Z ? 1 : -1;
  const side: DoorSide = leafSide > 0 ? "inside" : "outside";
  // Each face of the leaf, 8 cm out from the steel.
  const face = leafSide > 0 ? -0.08 : 0.08;
  const lever = doorPoint(door, LEVER.along, ARMORY.FLOOR + LEVER.height, face);
  const l = aimAt(reach, lever.x, lever.y, lever.z);

  if (l.distance <= ARMORY.DOOR_REACH && l.angle <= ARMORY.HANDLE_AIM) {
    return { side };
  }

  return null;
}
