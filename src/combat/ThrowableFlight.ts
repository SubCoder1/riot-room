import * as THREE from "three";

import { GRENADE_CONFIG } from "./GrenadeConfig";
import { MOLOTOV_CONFIG } from "./MolotovConfig";
import { SMOKE_CONFIG } from "./SmokeConfig";
import { THROW_CONFIG } from "./ThrowConfig";

/** What a throwable's flight is made of: every throwable shares one model. */
export interface FlightProfile {
  speed: number;
  gravity: number;
  gravityStart: number;
  gravityRamp: number;
  maxRange: number;
  radius: number;
}

export const GRENADE_PROFILE: FlightProfile = {
  speed: GRENADE_CONFIG.GRENADE_THROW_SPEED,
  gravity: GRENADE_CONFIG.GRENADE_GRAVITY,
  gravityStart: GRENADE_CONFIG.GRENADE_GRAVITY_START,
  gravityRamp: GRENADE_CONFIG.GRENADE_GRAVITY_RAMP,
  maxRange: GRENADE_CONFIG.GRENADE_MAX_RANGE,
  radius: GRENADE_CONFIG.GRENADE_RADIUS,
};

export const SMOKE_PROFILE: FlightProfile = {
  speed: SMOKE_CONFIG.SMOKE_THROW_SPEED,
  gravity: SMOKE_CONFIG.SMOKE_GRAVITY,
  gravityStart: SMOKE_CONFIG.SMOKE_GRAVITY_START,
  gravityRamp: SMOKE_CONFIG.SMOKE_GRAVITY_RAMP,
  maxRange: SMOKE_CONFIG.SMOKE_MAX_RANGE,
  radius: SMOKE_CONFIG.SMOKE_RADIUS,
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
export interface ThrowWorld {
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

export interface ThrowBody {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  /** Path length so far, metres (gravity depends on it). */
  travelled: number;
  /** Which flight model this body follows (the throwable by default). */
  profile?: FlightProfile;
}

/** Sets a throwable flying from `origin` along the unit vector `direction`. */
export function launchThrowable(
  body: ThrowBody,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  profile: FlightProfile = GRENADE_PROFILE,
): void {
  body.position.copy(origin);
  body.travelled = 0;
  body.profile = profile;
  body.velocity.copy(direction).multiplyScalar(profile.speed);
}

/**
 * One fixed step of flight. This is the ONLY place the throwable's motion is
 * defined: the aim preview and the thrown item both call it.
 */
export function stepThrowable(body: ThrowBody, dt: number): void {
  // Flies straight at first; gravity builds up steadily after the profile's gravity start metres.
  const profile = body.profile ?? GRENADE_PROFILE;
  const set = (body.travelled - profile.gravityStart) / profile.gravityRamp;
  const ease = Math.min(Math.max(set, 0), 1);

  // Semi-implicit Euler: gravity first, then move.
  body.velocity.y -= profile.gravity * ease * dt;
  body.position.addScaledVector(body.velocity, dt);
  body.travelled += body.velocity.length() * dt;
}

export interface ThrowImpact {
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
export function impactInStep(
  before: THREE.Vector3,
  body: ThrowBody,
  world: ThrowWorld,
  out: ThrowImpact,
): boolean {
  from.copy(before);

  let fraction = world.clearFraction(from, body.position);

  const floorY = FLOOR + (body.profile ?? GRENADE_PROFILE).radius;

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

export interface ThrowPath {
  /** Sampled points, `count` of them used. */
  points: THREE.Vector3[];
  count: number;
  /** True when the path ended on scenery or the floor (not just at max range). */
  hitSomething: boolean;
}

export function createThrowPath(capacity: number): ThrowPath {
  return {
    points: Array.from({ length: capacity }, () => new THREE.Vector3()),
    count: 0,
    hitSomething: false,
  };
}

const traceBody: ThrowBody = {
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  travelled: 0,
};
const traceBefore = new THREE.Vector3();
const traceImpact: ThrowImpact = { point: new THREE.Vector3(), fraction: 0 };

/**
 * Follows the flight a thrown item would take, with the same step as the real
 * throw, until it meets scenery, the floor or its maximum range. One point per
 * `sampleEvery` steps goes into `path`, ending at the impact point.
 */
export function traceThrowPath(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  world: ThrowWorld,
  path: ThrowPath,
  sampleEvery = 3,
  profile: FlightProfile = GRENADE_PROFILE,
): void {
  launchThrowable(traceBody, origin, direction, profile);

  path.count = 0;
  path.hitSomething = false;
  path.points[path.count++].copy(origin);

  let step = 0;

  while (
    traceBody.travelled < profile.maxRange &&
    path.count < path.points.length
  ) {
    traceBefore.copy(traceBody.position);
    stepThrowable(traceBody, THROW_CONFIG.THROW_STEP);
    step++;

    if (impactInStep(traceBefore, traceBody, world, traceImpact)) {
      path.points[path.count++].copy(traceImpact.point);
      path.hitSomething = true;

      return;
    }

    if (step % sampleEvery === 0) {
      path.points[path.count++].copy(traceBody.position);
    }
  }
}

/** The tall outer wall round the map: an inner box nothing thrown may leave. */
export interface ThrowBounds {
  /** Half the width and half the depth of the inside of the wall, metres. */
  halfX: number;
  halfZ: number;
  /** How high the wall is: above it the way out is open sky. */
  height: number;
}

/**
 * Fraction (0 to 1) of the line A to B that is inside the perimeter wall: 1
 * when the whole line stays in (or leaves above the wall's top), otherwise how
 * far it gets before it would go through the wall. The collision field has
 * solids for rooms and cover but not for the outer wall, so anything flying
 * (a grenade, a smoke canister) checks this as well.
 */
export function perimeterClearFraction(
  from: THREE.Vector3,
  to: THREE.Vector3,
  bounds: ThrowBounds,
): number {
  const limits: Array<[number, number, number]> = [
    [from.x, to.x, bounds.halfX],
    [from.z, to.z, bounds.halfZ],
  ];
  let fraction = 1;

  for (const [a, b, half] of limits) {
    const limit = half - 0.02;

    if (Math.abs(b) <= limit) {
      continue;
    }

    // The side it ends on: 1 or -1. Already past it at the start: stuck.
    const side = Math.sign(b);
    const start = a * side;
    const end = b * side;
    const t = start >= limit ? 0 : (limit - start) / (end - start);
    const y = from.y + (to.y - from.y) * t;

    if (y < bounds.height) {
      fraction = Math.min(fraction, Math.max(t, 0));
    }
  }

  return fraction;
}
