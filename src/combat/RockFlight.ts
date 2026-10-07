import * as THREE from "three";

import { MOLOTOV_CONFIG } from "./MolotovConfig";
import { ROCK_CONFIG } from "./RockConfig";

/** What a throwable's flight is made of: the rock and the Molotov share one model. */
export interface FlightProfile {
  speed: number;
  gravity: number;
  gravityStart: number;
  gravityRamp: number;
  maxRange: number;
  radius: number;
}

export const ROCK_PROFILE: FlightProfile = {
  speed: ROCK_CONFIG.ROCK_THROW_SPEED,
  gravity: ROCK_CONFIG.ROCK_GRAVITY,
  gravityStart: ROCK_CONFIG.ROCK_GRAVITY_START,
  gravityRamp: ROCK_CONFIG.ROCK_GRAVITY_RAMP,
  maxRange: ROCK_CONFIG.ROCK_MAX_RANGE,
  radius: ROCK_CONFIG.ROCK_RADIUS,
};

export const MOLOTOV_PROFILE: FlightProfile = {
  speed: MOLOTOV_CONFIG.MOLOTOV_THROW_SPEED,
  gravity: MOLOTOV_CONFIG.MOLOTOV_GRAVITY,
  gravityStart: MOLOTOV_CONFIG.MOLOTOV_GRAVITY_START,
  gravityRamp: MOLOTOV_CONFIG.MOLOTOV_GRAVITY_RAMP,
  maxRange: MOLOTOV_CONFIG.MOLOTOV_MAX_RANGE,
  radius: MOLOTOV_CONFIG.MOLOTOV_RADIUS,
};

/** What the flight needs to know about the level. */
export interface RockWorld {
  /**
   * Fraction (0 to 1) of the line A to B that is free of scenery: 1 when clear,
   * otherwise how far it gets before the first solid.
   */
  clearFraction(from: THREE.Vector3, to: THREE.Vector3): number;
  /**
   * Height of the surface a thing at (x, z), currently at height `fromY`,
   * would come to rest on (the floor, a platform, a ramp). Used to put a fire
   * on a real surface; without it the floor (0) is assumed.
   */
  surfaceY?(x: number, z: number, fromY: number): number;
}

export interface RockBody {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  /** Path length so far, metres (gravity depends on it). */
  travelled: number;
  /** Which flight model this body follows (the rock by default). */
  profile?: FlightProfile;
}

/** Sets a rock flying from `origin` along the unit vector `direction`. */
export function launchRock(
  body: RockBody,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  profile: FlightProfile = ROCK_PROFILE,
): void {
  body.position.copy(origin);
  body.travelled = 0;
  body.profile = profile;
  body.velocity.copy(direction).multiplyScalar(profile.speed);
}

/**
 * One fixed step of flight. This is the ONLY place the rock's motion is
 * defined: the aim preview and the thrown rock both call it.
 */
export function stepRock(body: RockBody, dt: number): void {
  // Flies straight at first; gravity builds up steadily after ROCK_GRAVITY_START metres.
  const profile = body.profile ?? ROCK_PROFILE;
  const set = (body.travelled - profile.gravityStart) / profile.gravityRamp;
  const ease = Math.min(Math.max(set, 0), 1);

  // Semi-implicit Euler: gravity first, then move.
  body.velocity.y -= profile.gravity * ease * dt;
  body.position.addScaledVector(body.velocity, dt);
  body.travelled += body.velocity.length() * dt;
}

export interface RockImpact {
  /** Where the step ended: on scenery, or on the floor. */
  point: THREE.Vector3;
  /** Fraction of the step travelled before the impact. */
  fraction: number;
}

const FLOOR = 0;
const from = new THREE.Vector3();

/**
 * Checks one step (from `before` to `body.position`) against scenery and the
 * floor. Null when the way was clear.
 */
export function rockImpactInStep(
  before: THREE.Vector3,
  body: RockBody,
  world: RockWorld,
  out: RockImpact,
): boolean {
  from.copy(before);

  let fraction = world.clearFraction(from, body.position);

  const floorY = FLOOR + (body.profile ?? ROCK_PROFILE).radius;

  if (body.position.y <= floorY) {
    const drop = before.y - body.position.y;
    const toFloor = drop > 1e-6 ? (before.y - floorY) / drop : 0;

    fraction = Math.min(fraction, THREE.MathUtils.clamp(toFloor, 0, 1));
  }

  if (fraction >= 1) {
    return false;
  }

  out.fraction = fraction;
  out.point.lerpVectors(before, body.position, fraction);

  return true;
}

export interface RockPath {
  /** Sampled points, `count` of them used. */
  points: THREE.Vector3[];
  count: number;
  /** True when the path ended on scenery or the floor (not just at max range). */
  hitSomething: boolean;
}

export function createRockPath(capacity: number): RockPath {
  return {
    points: Array.from({ length: capacity }, () => new THREE.Vector3()),
    count: 0,
    hitSomething: false,
  };
}

const traceBody: RockBody = {
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  travelled: 0,
};
const traceBefore = new THREE.Vector3();
const traceImpact: RockImpact = { point: new THREE.Vector3(), fraction: 0 };

/**
 * Follows the flight a thrown rock would take, with the same step as the real
 * rock, until it meets scenery, the floor or its maximum range. One point per
 * `sampleEvery` steps goes into `path`, ending at the impact point.
 */
export function traceRockPath(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  world: RockWorld,
  path: RockPath,
  sampleEvery = 3,
  profile: FlightProfile = ROCK_PROFILE,
): void {
  launchRock(traceBody, origin, direction, profile);

  path.count = 0;
  path.hitSomething = false;
  path.points[path.count++].copy(origin);

  let step = 0;

  while (
    traceBody.travelled < profile.maxRange &&
    path.count < path.points.length
  ) {
    traceBefore.copy(traceBody.position);
    stepRock(traceBody, ROCK_CONFIG.ROCK_STEP);
    step++;

    if (rockImpactInStep(traceBefore, traceBody, world, traceImpact)) {
      path.points[path.count++].copy(traceImpact.point);
      path.hitSomething = true;

      return;
    }

    if (step % sampleEvery === 0) {
      path.points[path.count++].copy(traceBody.position);
    }
  }
}
