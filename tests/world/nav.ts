import { ArenaCollision, PLAYER_RADIUS } from "../../src/world/ArenaCollision";
import { ARENA_HALF_X, ARENA_HALF_Z } from "../../src/world/ArenaLayout";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";

/**
 * Walkable-space analysis for the arena: a graph of where a player can stand
 * and move, built from the real collision rules. It exists so layout principles
 * (no dead ends, broken outer ring, several routes, ...) can be measured rather
 * than judged by eye. Not used by the game.
 */

export const CELL = 0.5;
export const COLS = Math.round((ARENA_HALF_X * 2) / CELL);
export const ROWS = Math.round((ARENA_HALF_Z * 2) / CELL);

/** The highest the feet get during a jump: what a "hop" can clear. */
const JUMP_RISE = 0.85;
/** Extra cost (metres of walking) of jumping over something. */
const HOP_COST = 3;

export const world = new ArenaCollision();

const blockedCache = new Map<number, boolean>();
const groundCache = new Map<number, number>();

const heightKey = (feet: number): number => Math.round(feet / 0.05) + 200;
const cacheKey = (x: number, z: number, feet: number): number =>
  (Math.round((z + ARENA_HALF_Z) / CELL) * COLS +
    Math.round((x + ARENA_HALF_X) / CELL)) *
    1000 +
  heightKey(feet);

/** Same as world.isBlocked at a cell centre, remembered. */
function blockedAt(x: number, z: number, feet: number): boolean {
  const key = cacheKey(x, z, feet);
  let value = blockedCache.get(key);

  if (value === undefined) {
    value = world.isBlocked(x, z, feet, PLAYER_RADIUS);
    blockedCache.set(key, value);
  }

  return value;
}

function groundAt(x: number, z: number, feet: number): number {
  const key = cacheKey(x, z, feet);
  let value = groundCache.get(key);

  if (value === undefined) {
    value = world.groundHeight(x, z, feet);
    groundCache.set(key, value);
  }

  return value;
}

export interface Node {
  i: number;
  j: number;
  /** Feet height, in 5 cm units. */
  h: number;
}

export const cellX = (i: number): number => -ARENA_HALF_X + (i + 0.5) * CELL;
export const cellZ = (j: number): number => -ARENA_HALF_Z + (j + 0.5) * CELL;
export const cellI = (x: number): number =>
  Math.min(COLS - 1, Math.max(0, Math.floor((x + ARENA_HALF_X) / CELL)));
export const cellJ = (z: number): number =>
  Math.min(ROWS - 1, Math.max(0, Math.floor((z + ARENA_HALF_Z) / CELL)));

const key = (n: Node): number => (n.h * ROWS + n.j) * COLS + n.i;

const DIRS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export interface NavOptions {
  /** Ladders carry a walker between their foot and their top (default on). */
  ladders?: boolean;
  /** Allow jumping over low walls and up onto low ledges. */
  hop?: boolean;
  /** Cells that may not be entered. */
  forbid?: (x: number, z: number) => boolean;
}

function neighbours(
  node: Node,
  options: NavOptions,
): Array<{ node: Node; cost: number }> {
  const feet = node.h * 0.05;
  const result: Array<{ node: Node; cost: number }> = [];

  if (options.ladders !== false) {
    for (const ladder of ARENA_LAYOUT.ladders) {
      if (
        node.i === cellI(ladder.approach.x) &&
        node.j === cellJ(ladder.approach.z) &&
        node.h === Math.round(ladder.bottomY / 0.05)
      ) {
        result.push({
          node: {
            i: cellI(ladder.exit.x),
            j: cellJ(ladder.exit.z),
            h: Math.round(ladder.topY / 0.05),
          },
          cost: 6,
        });
      }

      if (
        node.i === cellI(ladder.exit.x) &&
        node.j === cellJ(ladder.exit.z) &&
        node.h === Math.round(ladder.topY / 0.05)
      ) {
        result.push({
          node: {
            i: cellI(ladder.approach.x),
            j: cellJ(ladder.approach.z),
            h: Math.round(ladder.bottomY / 0.05),
          },
          cost: 6,
        });
      }
    }
  }

  for (const [di, dj] of DIRS) {
    const i = node.i + di;
    const j = node.j + dj;

    if (i < 0 || j < 0 || i >= COLS || j >= ROWS) {
      continue;
    }

    const x = cellX(i);
    const z = cellZ(j);

    if (options.forbid?.(x, z)) {
      continue;
    }

    const step = di !== 0 && dj !== 0 ? Math.SQRT2 * CELL : CELL;
    let cost = step;

    // A real player's feet rise the moment they cross a step edge, so judge
    // the destination from the height they would be standing at there.
    let reference = Math.max(feet, groundAt(x, z, feet));

    if (blockedAt(x, z, reference)) {
      if (!options.hop || blockedAt(x, z, feet + JUMP_RISE)) {
        continue;
      }

      reference = feet + JUMP_RISE;
      cost += HOP_COST;
    }

    // No squeezing diagonally between two blocked sides.
    if (
      di !== 0 &&
      dj !== 0 &&
      (blockedAt(cellX(node.i + di), cellZ(node.j), feet) ||
        blockedAt(cellX(node.i), cellZ(node.j + dj), feet))
    ) {
      continue;
    }

    const ground = groundAt(x, z, reference);

    result.push({
      node: { i, j, h: Math.round(ground / 0.05) },
      cost,
    });
  }

  return result;
}

/** A small binary heap keyed by cost. */
class Heap {
  private readonly items: Array<{ cost: number; node: Node }> = [];

  public get size(): number {
    return this.items.length;
  }

  public push(cost: number, node: Node): void {
    this.items.push({ cost, node });

    let at = this.items.length - 1;

    while (at > 0) {
      const parent = (at - 1) >> 1;

      if (this.items[parent].cost <= this.items[at].cost) break;

      [this.items[parent], this.items[at]] = [
        this.items[at],
        this.items[parent],
      ];
      at = parent;
    }
  }

  public pop(): { cost: number; node: Node } {
    const top = this.items[0];
    const last = this.items.pop()!;

    if (this.items.length) {
      this.items[0] = last;

      let at = 0;

      for (;;) {
        const l = at * 2 + 1;
        const r = l + 1;
        let best = at;

        if (l < this.items.length && this.items[l].cost < this.items[best].cost)
          best = l;
        if (r < this.items.length && this.items[r].cost < this.items[best].cost)
          best = r;
        if (best === at) break;

        [this.items[best], this.items[at]] = [this.items[at], this.items[best]];
        at = best;
      }
    }

    return top;
  }
}

export interface Field {
  distance: Map<number, number>;
  previous: Map<number, Node>;
}

/** Walking distance from a start to every reachable place (Dijkstra). */
const fieldCache = new Map<string, Field>();

export function walkField(
  startX: number,
  startZ: number,
  startFeet = 0,
  options: NavOptions = {},
): Field {
  // Maps without a custom restriction are reused: many tests ask for the same one.
  const cacheKey = options.forbid
    ? null
    : `${startX},${startZ},${startFeet},${options.hop ? 1 : 0},${options.ladders === false ? 0 : 1}`;
  const cached = cacheKey ? fieldCache.get(cacheKey) : undefined;

  if (cached) {
    return cached;
  }

  const start: Node = {
    i: cellI(startX),
    j: cellJ(startZ),
    h: Math.round(startFeet / 0.05),
  };
  const distance = new Map<number, number>([[key(start), 0]]);
  const previous = new Map<number, Node>();
  const heap = new Heap();

  heap.push(0, start);

  while (heap.size) {
    const { cost, node } = heap.pop();

    if (cost > (distance.get(key(node)) ?? Infinity)) continue;

    for (const next of neighbours(node, options)) {
      const total = cost + next.cost;
      const k = key(next.node);

      if (total < (distance.get(k) ?? Infinity)) {
        distance.set(k, total);
        previous.set(k, node);
        heap.push(total, next.node);
      }
    }
  }

  const field = { distance, previous };

  if (cacheKey) {
    fieldCache.set(cacheKey, field);
  }

  return field;
}

/** Walking distance to a point at one exact floor height (Infinity if it cannot be reached). */
export function distanceAtHeight(
  field: Field,
  x: number,
  z: number,
  feet: number,
): number {
  return (
    field.distance.get(
      key({ i: cellI(x), j: cellJ(z), h: Math.round(feet / 0.05) }),
    ) ?? Infinity
  );
}

/** Shortest walking distance to a point (the lowest over every height there). */
export function distanceTo(field: Field, x: number, z: number): number {
  const i = cellI(x);
  const j = cellJ(z);
  let best = Infinity;

  for (let h = -1; h <= 300; h++) {
    best = Math.min(best, field.distance.get(key({ i, j, h })) ?? Infinity);
  }

  return best;
}

export function pathTo(
  field: Field,
  x: number,
  z: number,
): Array<{ x: number; z: number; feet: number }> {
  const i = cellI(x);
  const j = cellJ(z);
  let at: Node | null = null;
  let best = Infinity;

  for (let h = 0; h <= 300; h++) {
    const d = field.distance.get(key({ i, j, h })) ?? Infinity;

    if (d < best) {
      best = d;
      at = { i, j, h };
    }
  }

  const path: Array<{ x: number; z: number; feet: number }> = [];

  while (at) {
    path.push({ x: cellX(at.i), z: cellZ(at.j), feet: at.h * 0.05 });
    at = field.previous.get(key(at)) ?? null;
  }

  return path.reverse();
}

/** Open floor cells (feet on the main floor) where a player can stand. */
export function floorCells(): Array<{ x: number; z: number }> {
  const cells: Array<{ x: number; z: number }> = [];

  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      if (!world.isBlocked(cellX(i), cellZ(j), 0, PLAYER_RADIUS)) {
        cells.push({ x: cellX(i), z: cellZ(j) });
      }
    }
  }

  return cells;
}

/** Clear line between two standing positions (eye height over chest height). */
export function canSee(
  ax: number,
  az: number,
  aFeet: number,
  bx: number,
  bz: number,
  bFeet: number,
): boolean {
  return !world.segmentBlocked(ax, aFeet + 1.6, az, bx, bFeet + 1.3, bz);
}

export const SPAWNS = ARENA_LAYOUT.spawnPoints;

/**
 * Every place a player can actually stand and reach on foot (or by a hop),
 * starting from the first spawn: floor, platform tops, ramps and steps, but not
 * the tops of blocks and columns that nobody can climb onto.
 */
export function pathLength(
  path: ReadonlyArray<{ x: number; z: number }>,
): number {
  let length = 0;

  for (let k = 1; k < path.length; k++) {
    length += Math.hypot(path[k].x - path[k - 1].x, path[k].z - path[k - 1].z);
  }

  return length;
}

export function reachableStands(
  step = 1,
): Array<{ x: number; z: number; feet: number }> {
  const field = walkField(SPAWNS[0].x, SPAWNS[0].z, 0, { hop: true });
  const stands: Array<{ x: number; z: number; feet: number }> = [];

  for (const k of field.distance.keys()) {
    const h = Math.floor(k / (COLS * ROWS));
    const j = Math.floor((k % (COLS * ROWS)) / COLS);
    const i = k % COLS;

    if (i % step === 0 && j % step === 0) {
      stands.push({ x: cellX(i), z: cellZ(j), feet: h * 0.05 });
    }
  }

  return stands;
}
