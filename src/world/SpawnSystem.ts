import type { SpawnPoint } from "./ArenaLayout";
import { ARENA_LAYOUT } from "./UpperFloorMap";
import type { ArenaCollision } from "./ArenaCollision";

/**
 * How far apart players should start, in metres. A soft target: with many
 * players and few points it is relaxed, never an error.
 */
export const MIN_SPAWN_DISTANCE = 10;

/** A spawn needs this much open floor around it (clear of any solid), in metres. */
export const SPAWN_CLEARANCE = 1.5;

/** ...and this much between it and the outer wall. */
export const SPAWN_WALL_CLEARANCE = 1.5;

/** A spawn this close to a living player is never used. */
export const SPAWN_OCCUPIED_RADIUS = 3;

export type Rng = () => number;

export interface AssignOptions {
  points?: readonly SpawnPoint[];
  rng?: Rng;
  minDistance?: number;
  /** The previous round's assignment (player id -> spawn id), to avoid repeating it. */
  previous?: Readonly<Record<string, string>>;
  /** Positions of players who are already in the arena (mid-round spawns). */
  occupied?: ReadonlyArray<{ x: number; z: number }>;
}

/** Fisher-Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));

    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function distance(a: SpawnPoint, b: SpawnPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function nearestDistance(
  point: SpawnPoint,
  others: readonly SpawnPoint[],
): number {
  let nearest = Number.POSITIVE_INFINITY;

  for (const other of others) {
    nearest = Math.min(nearest, distance(point, other));
  }

  return nearest;
}

/**
 * One random assignment. The point list is shuffled first, so who gets which
 * point never depends on the player's id or order. Each player then takes the
 * first shuffled point that is far enough from the points already handed out;
 * if none is, the one that is furthest from them.
 */
function assignOnce(
  playerIds: readonly string[],
  points: readonly SpawnPoint[],
  rng: Rng,
  minDistance: number,
): Record<string, SpawnPoint> {
  const remaining = shuffle(points, rng);
  const chosen: SpawnPoint[] = [];
  const result: Record<string, SpawnPoint> = {};

  for (const playerId of playerIds) {
    let pickIndex = remaining.findIndex(
      (candidate) => nearestDistance(candidate, chosen) >= minDistance,
    );

    if (pickIndex === -1) {
      pickIndex = 0;

      for (let i = 1; i < remaining.length; i++) {
        if (
          nearestDistance(remaining[i], chosen) >
          nearestDistance(remaining[pickIndex], chosen)
        ) {
          pickIndex = i;
        }
      }
    }

    const [pick] = remaining.splice(pickIndex, 1);

    chosen.push(pick);
    result[playerId] = pick;
  }

  return result;
}

function sameAssignment(
  a: Record<string, SpawnPoint>,
  previous: Readonly<Record<string, string>>,
): boolean {
  const ids = Object.keys(a);

  return (
    ids.length === Object.keys(previous).length &&
    ids.every((id) => previous[id] === a[id].id)
  );
}

/**
 * Gives every player one unique spawn point, chosen at random from the arena's
 * predefined valid points (never random coordinates). Free-for-all: there are no
 * teams, and nothing about a player decides where they start.
 *
 * Throws only if there are more players than spawn points.
 */
export function assignSpawns(
  playerIds: readonly string[],
  options: AssignOptions = {},
): Record<string, SpawnPoint> {
  const rng = options.rng ?? Math.random;
  const minDistance = options.minDistance ?? MIN_SPAWN_DISTANCE;
  const occupied = options.occupied ?? [];

  const points = (options.points ?? ARENA_LAYOUT.spawnPoints).filter(
    (point) =>
      !occupied.some(
        (other) =>
          Math.hypot(point.x - other.x, point.z - other.z) <
          SPAWN_OCCUPIED_RADIUS,
      ),
  );

  if (playerIds.length > points.length) {
    throw new Error(
      `Not enough spawn points: ${playerIds.length} players, ${points.length} points`,
    );
  }

  let result = assignOnce(playerIds, points, rng, minDistance);

  // Don't hand out the exact same assignment two rounds in a row (if there is a choice).
  for (
    let attempt = 0;
    attempt < 10 &&
    options.previous &&
    sameAssignment(result, options.previous);
    attempt++
  ) {
    result = assignOnce(playerIds, points, rng, minDistance);
  }

  return result;
}

/** Why a spawn point is unsafe (an empty list means it is fine). */
export function validateSpawnPoint(
  point: SpawnPoint,
  collision: ArenaCollision,
): string[] {
  const problems: string[] = [];

  if (collision.wallClearanceAt(point.x, point.z) < SPAWN_WALL_CLEARANCE) {
    problems.push("too close to (or outside) the outer wall");
  }

  if (collision.clearanceAt(point.x, point.z) < SPAWN_CLEARANCE) {
    problems.push(
      "inside or too close to an obstacle, platform, ramp or stairs",
    );
  }

  if (collision.groundHeight(point.x, point.z, point.y) !== point.y) {
    problems.push("floor height does not match the spawn height");
  }

  return problems;
}
