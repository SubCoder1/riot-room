import * as THREE from "three";

/**
 * Ground and air movement in the style of CS:GO (the Source engine's
 * "accelerate" and "friction"). Speeds are in metres per second; the CS:GO
 * values are in game units (about 2.54 cm each) and are converted here, so the
 * numbers can be compared with the original directly.
 *
 * What it gives: no instant starts and stops (a player takes about a fifth of
 * a second to reach full speed and a little longer to stop), quick
 * counter-strafing (pressing the opposite key brakes hard), and in the air the
 * momentum of the jump carries on. A moving target is therefore predictable:
 * it cannot change direction on a dime.
 */
const UNIT = 0.0254;

export const SOURCE_MOVEMENT = {
  /**
   * sv_accelerate: ground acceleration. CS:GO uses 5.5; this is a little
   * snappier (about a tenth of a second to full speed) so it never feels slow.
   */
  GROUND_ACCELERATE: 9,
  /** sv_friction: ground friction (CS:GO uses 5.2). */
  FRICTION: 6.5,
  /** sv_stopspeed: below this speed friction brakes at a constant rate. */
  STOP_SPEED: 80 * UNIT,
  /**
   * How fast (m/s per second) airborne velocity can be steered by the keys.
   * Between CS:GO's almost-none (a 0.76 m/s budget) and the old 30: a jump is
   * committed, but can still be bent and slowed.
   */
  AIR_CONTROL: 10,
  /** CS:GO rifle run speed (about 215 u/s). */
  RIFLE_SPEED: 215 * UNIT,
  /** The normal run speed: a little above a rifle's. */
  RUN_SPEED: 6,
  /** Shift: faster than any CS:GO weapon, so sprinting is clearly quick. */
  SPRINT_SPEED: 8,
  /**
   * Side-stepping alone (A / D with no W / S) is this share of the forward
   * speed, with or without Shift: strafing is slower than running.
   */
  STRAFE_FACTOR: 0.75,
} as const;

/** Slows the horizontal velocity the way ground friction does (call on the ground, before accelerating). */
export function applyFriction(velocity: THREE.Vector3, dt: number): void {
  const speed = Math.hypot(velocity.x, velocity.z);

  if (speed < 1e-4) {
    velocity.x = 0;
    velocity.z = 0;

    return;
  }

  const control = Math.max(speed, SOURCE_MOVEMENT.STOP_SPEED);
  const drop = control * SOURCE_MOVEMENT.FRICTION * dt;
  const scale = Math.max(speed - drop, 0) / speed;

  velocity.x *= scale;
  velocity.z *= scale;
}

/**
 * Speeds the player up toward `wishSpeed` along the unit vector `wishDir`. It
 * only adds what is missing along that direction, so it never pushes past the
 * top speed, and pressing the opposite way brakes (counter-strafing).
 */
export function accelerate(
  velocity: THREE.Vector3,
  wishDir: THREE.Vector3,
  wishSpeed: number,
  acceleration: number,
  dt: number,
): void {
  const current = velocity.x * wishDir.x + velocity.z * wishDir.z;
  const missing = wishSpeed - current;

  if (missing <= 0) {
    return;
  }

  const gain = Math.min(acceleration * wishSpeed * dt, missing);

  velocity.x += wishDir.x * gain;
  velocity.z += wishDir.z * gain;
}

/**
 * Steering in the air: the velocity moves toward the wished velocity by at most
 * `maxChange` (m/s) per call. With no keys held nothing calls this, so a jump
 * keeps its momentum; with keys held the player can curve and brake the jump.
 */
export function steerInAir(
  velocity: THREE.Vector3,
  wantX: number,
  wantZ: number,
  maxChange: number,
): void {
  const dx = wantX - velocity.x;
  const dz = wantZ - velocity.z;
  const gap = Math.hypot(dx, dz);
  const scale = gap > maxChange ? maxChange / gap : 1;

  velocity.x += dx * scale;
  velocity.z += dz * scale;
}
