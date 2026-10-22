import * as THREE from "three";

import {
  allSolids,
  type LightDefinition,
  type RoomDefinition,
  type Solid,
} from "./ArenaLayout";
import { openAt } from "./Debris";
import { Pieces, rng } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import { poleOf } from "./MessyWiring";
import { nightLights } from "./NightLights";
import { CHARCOAL, GUNMETAL, STEEL_BARE } from "./RoomKit";

/**
 * The supply to the lamps. Every room has one cable from its ceiling lamps:
 * a cord from the lamp up to the ceiling, along the ceiling to the nearest
 * wall (clear of any door), then clamped to the wall's face down to the floor.
 * Each floodlight on the first floor has its own cable from the foot of its
 * pole. From there every cable runs over the open floor, through the doors and
 * along the walkways, to the lighting feed in the power room, so none ends in
 * the middle of nowhere. The routes are found over the open first floor, and
 * the cables are drawn only, flat on the floor and tight to the walls.
 */

const F = 4;
const CELL = 0.5;
const X0 = -32;
const Z0 = -24;
const COLS = 128;
const ROWS = 96;
/** Where every cable ends: just inside the power room, by its south door. */
const FEED: [number, number] = [1.2, -18.6];
/** One plain black supply cable. */
const CABLE = 0x24272c;
const WALL_GAP = 0.18;

type XZ = [number, number];
type Vec = [number, number, number];

function isRoomLamp(l: LightDefinition): boolean {
  return (
    l.y > F + 1 &&
    l.y < F + 4.3 &&
    (l.id.startsWith("light-room-") || l.id.startsWith("indicator-"))
  );
}

function isFirstFloorFloodlight(l: LightDefinition): boolean {
  return l.id.startsWith("light-support-");
}

/** The underside of the lowest solid over (x, z) above `y`: the ceiling. */
function ceilingOver(solids: Solid[], x: number, z: number, y: number): number {
  let lowest = F + 3.8;
  let found = false;

  for (const s of solids) {
    const bottom = s.kind === "ramp" ? 0 : (s.bottom ?? 0);
    const inside =
      s.kind === "cylinder"
        ? Math.hypot(x - s.x, z - s.z) <= s.radius
        : x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ;

    if (inside && bottom > y + 0.1 && (!found || bottom < lowest)) {
      lowest = bottom;
      found = true;
    }
  }

  return Math.max(lowest - 0.05, y + 0.1);
}

export function furnishPowerFeeds(map: MapBuilder): void {
  const layout = map.build();
  const solids = allSolids(layout);
  const random = rng(3091);
  const walkable = new Int8Array(COLS * ROWS).fill(-1);
  const centre = (i: number, j: number): XZ => [
    X0 + (i + 0.5) * CELL,
    Z0 + (j + 0.5) * CELL,
  ];
  const free = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= COLS || j >= ROWS) {
      return false;
    }

    const k = j * COLS + i;

    if (walkable[k] < 0) {
      const [x, z] = centre(i, j);

      walkable[k] = openAt(solids, x, z, F, 0.3) ? 1 : 0;
    }

    return walkable[k] === 1;
  };
  const cellOf = (x: number, z: number): [number, number] => [
    Math.floor((x - X0) / CELL),
    Math.floor((z - Z0) / CELL),
  ];

  /** The nearest open cell to a point (searching outward). */
  const nearestFree = (x: number, z: number): [number, number] | null => {
    const [ci, cj] = cellOf(x, z);

    for (let r = 0; r < 14; r++) {
      for (let di = -r; di <= r; di++) {
        for (let dj = -r; dj <= r; dj++) {
          if (
            Math.max(Math.abs(di), Math.abs(dj)) === r &&
            free(ci + di, cj + dj)
          ) {
            return [ci + di, cj + dj];
          }
        }
      }
    }

    return null;
  };

  /** A* over the open floor, eight ways. */
  const route = (from: [number, number], to: [number, number]): XZ[] | null => {
    const key = (i: number, j: number): number => j * COLS + i;
    const best = new Map<number, number>([[key(...from), 0]]);
    const parent = new Map<number, number>();
    const open: Array<{ i: number; j: number; f: number }> = [
      { i: from[0], j: from[1], f: 0 },
    ];

    while (open.length > 0) {
      let m = 0;

      for (let n = 1; n < open.length; n++) {
        if (open[n].f < open[m].f) {
          m = n;
        }
      }

      const cur = open.splice(m, 1)[0];

      if (cur.i === to[0] && cur.j === to[1]) {
        const cells: XZ[] = [];
        let k: number | undefined = key(cur.i, cur.j);

        while (k !== undefined) {
          cells.push(centre(k % COLS, Math.floor(k / COLS)));
          k = parent.get(k);
        }

        return cells.reverse();
      }

      const g = best.get(key(cur.i, cur.j))!;

      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if ((di === 0 && dj === 0) || !free(cur.i + di, cur.j + dj)) {
            continue;
          }

          // No cutting a corner past a wall's end.
          if (
            di !== 0 &&
            dj !== 0 &&
            !(free(cur.i + di, cur.j) && free(cur.i, cur.j + dj))
          ) {
            continue;
          }

          const ni = cur.i + di;
          const nj = cur.j + dj;
          const cost = g + (di !== 0 && dj !== 0 ? 1.414 : 1);
          const nk = key(ni, nj);

          if (cost < (best.get(nk) ?? Infinity)) {
            best.set(nk, cost);
            parent.set(nk, key(cur.i, cur.j));
            open.push({
              i: ni,
              j: nj,
              f: cost + Math.hypot(ni - to[0], nj - to[1]),
            });
          }
        }
      }
    }

    return null;
  };

  /** Whether a straight line stays on open floor. */
  const clear = (a: XZ, b: XZ): boolean => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(length / 0.25));

    for (let s = 0; s <= steps; s++) {
      const x = a[0] + ((b[0] - a[0]) * s) / steps;
      const z = a[1] + ((b[1] - a[1]) * s) / steps;
      const [i, j] = cellOf(x, z);

      if (!free(i, j)) {
        return false;
      }
    }

    return true;
  };

  /** Pulls the route taut: as few straight legs as the floor allows. */
  const pull = (cells: XZ[]): XZ[] => {
    const out: XZ[] = [cells[0]];
    let at = 0;

    while (at < cells.length - 1) {
      let far = cells.length - 1;

      while (far > at + 1 && !clear(cells[at], cells[far])) {
        far--;
      }

      out.push(cells[far]);
      at = far;
    }

    return out;
  };

  const goal = nearestFree(FEED[0], FEED[1]);

  if (!goal) {
    return;
  }

  const p = new Pieces();
  const goalAt = centre(goal[0], goal[1]);

  // The lighting feed: a steel cabinet low on the floor where every cable ends.
  p.box(goalAt[0], 0, goalAt[1] - 0.25, 0.9, 0.5, 0.3, CHARCOAL);
  p.box(goalAt[0], 0.5, goalAt[1] - 0.25, 0.95, 0.03, 0.34, GUNMETAL);
  p.box(goalAt[0] - 0.2, 0.2, goalAt[1] - 0.09, 0.2, 0.16, 0.012, STEEL_BARE);

  const diameter = 0.026;

  /** A cable piece between two points in space (y above the first floor). */
  const wire = (a: Vec, b: Vec): void => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const length = Math.hypot(dx, dy, dz);

    if (length < 0.02) {
      return;
    }

    p.cable(
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
      (a[2] + b[2]) / 2,
      length * 1.05,
      diameter,
      CABLE,
      -Math.atan2(dz, dx),
      Math.atan2(dy, Math.hypot(dx, dz)),
    );
  };

  /** A small steel clamp holding a cable to a wall or a ceiling. */
  const clamp = (x: number, y: number, z: number): void => {
    p.box(x - 0.03, y - 0.03, z - 0.03, 0.06, 0.06, 0.06, GUNMETAL);
  };

  /** A cable slung along a ceiling, sagging a little between clamps. */
  const sag = (a: Vec, b: Vec): void => {
    const pieces = Math.max(
      2,
      Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.5),
    );
    let prev = a;

    for (let i = 1; i <= pieces; i++) {
      const t = i / pieces;
      const next: Vec = [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
      ];

      wire(prev, next);
      prev = next;
    }
  };

  let index = 0;

  /** From a point on the floor, a curved cable over the open floor to the feed. */
  const floorRun = (from: XZ): void => {
    const start = nearestFree(from[0], from[1]);

    if (!start) {
      return;
    }

    const cells = route(start, goal);

    if (!cells) {
      return;
    }

    const turns: XZ[] = [from, ...pull(cells)];
    const curve = new THREE.CatmullRomCurve3(
      turns.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      false,
      "centripetal",
    );
    const samples = Math.max(4, Math.ceil(curve.getLength() / 0.2));
    // Each cable lies a little to one side of the last, and drifts as it goes.
    const side = ((index++ % 5) - 2) * 0.06;
    const drift = random() * Math.PI * 2;
    const pts: XZ[] = [];

    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const at = curve.getPoint(t);
      const ahead = curve.getPoint(Math.min(t + 0.01, 1));
      const back = curve.getPoint(Math.max(t - 0.01, 0));
      const dx = ahead.x - back.x;
      const dz = ahead.z - back.z;
      const len = Math.hypot(dx, dz) || 1;
      // On the wall at the start and on the feed at the end, wandering between.
      const o =
        (side + 0.07 * Math.sin(t * 17 + drift)) *
        Math.min(Math.sin(Math.PI * t) * 3, 1);
      const x = at.x - (dz / len) * o;
      const z = at.z + (dx / len) * o;
      const [ci, cj] = cellOf(x, z);

      pts.push(free(ci, cj) ? [x, z] : [at.x, at.z]);
    }

    for (let i = 0; i < pts.length - 1; i++) {
      wire(
        [pts[i][0], diameter / 2, pts[i][1]],
        [pts[i + 1][0], diameter / 2, pts[i + 1][1]],
      );
    }
  };

  // ------------------------------------------------------------ the rooms
  const roomOf = (l: LightDefinition): RoomDefinition | undefined =>
    layout.rooms.find(
      (r) =>
        r.floorY === F &&
        l.x > r.minX &&
        l.x < r.maxX &&
        l.z > r.minZ &&
        l.z < r.maxZ,
    );
  const byRoom = new Map<string, LightDefinition[]>();

  for (const lamp of nightLights(layout).filter(isRoomLamp)) {
    const room = roomOf(lamp);

    if (room) {
      byRoom.set(room.id, [...(byRoom.get(room.id) ?? []), lamp]);
    }
  }

  for (const [roomId, lamps] of byRoom) {
    const room = layout.rooms.find((r) => r.id === roomId)!;
    const main = lamps[0];
    const ceiling = ceilingOver(solids, main.x, main.z, main.y);

    // The walls the cable can take, nearest first, keeping clear of doors.
    const walls: Array<{ at: XZ; dist: number }> = [];
    const doorNear = (side: "n" | "s" | "e" | "w", along: number): boolean =>
      room.doors.some(
        (d) => d.side === side && Math.abs(d.at - along) < d.width / 2 + 1,
      );

    if (!doorNear("w", main.z)) {
      walls.push({
        at: [room.minX + WALL_GAP, main.z],
        dist: main.x - room.minX,
      });
    }

    if (!doorNear("e", main.z)) {
      walls.push({
        at: [room.maxX - WALL_GAP, main.z],
        dist: room.maxX - main.x,
      });
    }

    if (!doorNear("n", main.x)) {
      walls.push({
        at: [main.x, room.minZ + WALL_GAP],
        dist: main.z - room.minZ,
      });
    }

    if (!doorNear("s", main.x)) {
      walls.push({
        at: [main.x, room.maxZ - WALL_GAP],
        dist: room.maxZ - main.z,
      });
    }

    walls.sort((a, b) => a.dist - b.dist);

    if (walls.length === 0) {
      continue;
    }

    const [wx, wz] = walls[0].at;

    // The lamp's cord up to the ceiling, then along the ceiling to the wall.
    wire([main.x, main.y - F, main.z], [main.x, ceiling - F, main.z]);
    sag([main.x, ceiling - F, main.z], [wx, ceiling - F, wz]);
    clamp(main.x, ceiling - F, main.z);

    // Any other lamp in the room hangs off the first one's run.
    for (const other of lamps.slice(1)) {
      const top = ceilingOver(solids, other.x, other.z, other.y);

      wire([other.x, other.y - F, other.z], [other.x, top - F, other.z]);
      sag([other.x, top - F, other.z], [main.x, ceiling - F, main.z]);
    }

    // Down the wall's face to the floor, clamped on the way.
    wire([wx, ceiling - F, wz], [wx, diameter / 2, wz]);

    for (let y = 0.6; y < ceiling - F - 0.2; y += 0.9) {
      clamp(wx, y, wz);
    }

    floorRun([wx, wz]);
  }

  // ---------------------------------------- the first-floor floodlights
  for (const lamp of nightLights(layout).filter(isFirstFloorFloodlight)) {
    const pole = poleOf(layout, lamp);

    // From the foot of its pole (where its own wiring starts) to the feed.
    floorRun([pole.x, pole.z]);
  }

  map.createFitting("power-feeds", F, p.elements, []);
}
