import { allSolids, type PileElement } from "./ArenaLayout";
import { groundPieces } from "./DebrisGround";
import { rng } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import { meshExtent } from "./PileMeshes";
import { ventBlocks, ventBlocksNear } from "./Vents";

/**
 * Physical damage on the main ground floor (y 0): the concrete faces of the
 * wings round the courtyard, the north-west spawn yard's walls and the slab
 * edges of the balconies that stand on posts. Same approach as the Ruins
 * chamber: real pieces, no crack decals or shader grime.
 *
 *  - A wall spall is a break in the wall's skin: stepped, turned slabs of
 *    paler core concrete proud of the face, fractured lumps round its rim,
 *    bars that start inside the wall (hidden) and come out through the break,
 *    bent or snapped, and the heap that fell from it, lying on the floor.
 *  - A slab edge is a broken lip on a balcony's underside: lumps hanging from
 *    it, bars out of the underside and the chunks that fell to the floor.
 *
 * Nothing is damaged on every wall: most faces stay whole. The courtyard's
 * middle is untouched; every piece of rubble is at a wall's foot.
 *
 * The ground floor has no concrete pillars (its supports are steel posts, and
 * the Hall's four concrete columns are on the upper floor), so none is here.
 */

type V3 = [number, number, number];

/** Where the pieces look out: the face's normal. */
type Face = "W" | "E" | "N" | "S";

const CONCRETE = [0x3d3f43, 0x45474b, 0x4b4d51, 0x36383c, 0x505256, 0x4a4845];
const FRACTURE = [0x62646a, 0x6c6e72, 0x585a60];
const REBAR = 0x5e3320;
const REBAR_BARE = 0x7a4a2a;

/** What was damaged, for the tests and the report. */
export interface WallSpall {
  face: Face;
  /** The wall face's coordinate (x for W/E, z for N/S). */
  plane: number;
  /** Where along the face (z for W/E, x for N/S). */
  u: number;
  /** Height of the break's centre, its width and height. */
  y: number;
  w: number;
  h: number;
}

export interface SlabEdge {
  face: "N" | "S";
  plane: number;
  u: number;
  /** The slab's underside. */
  under: number;
}

export const WALL_SPALLS: readonly (WallSpall & { id: string })[] = [
  // North wing's face (z -12), looking south.
  {
    id: "north-face-a",
    face: "N",
    plane: -12,
    u: -14.5,
    y: 1.3,
    w: 1.1,
    h: 1.3,
  },
  { id: "north-face-b", face: "N", plane: -12, u: 2.5, y: 1.0, w: 0.8, h: 1.0 },
  // West wing's face (x -18), looking east.
  { id: "west-face-a", face: "W", plane: -18, u: -6.5, y: 1.5, w: 1.2, h: 1.4 },
  { id: "west-face-b", face: "W", plane: -18, u: 6.5, y: 1.1, w: 0.7, h: 0.9 },
  // South wing's face (z 12), looking north.
  { id: "south-face-a", face: "S", plane: 12, u: -12, y: 1.4, w: 1.0, h: 1.2 },
  { id: "south-face-b", face: "S", plane: 12, u: 9.0, y: 1.0, w: 0.9, h: 1.0 },
  // The north-west spawn yard's west wall (inside face), looking east.
  { id: "spawn-west", face: "W", plane: -31.7, u: -19, y: 1.4, w: 0.9, h: 1.2 },
];

export const SLAB_EDGES: readonly (SlabEdge & { id: string })[] = [
  // The north balcony's front edge (x -7..5, underside 3.5), between two posts.
  { id: "balcony-north", face: "N", plane: -7.5, u: -4.9, under: 3.5 },
  // The east balcony's front edge (x 11..18, underside 3.5).
  { id: "balcony-east", face: "S", plane: 7.8, u: 14.2, under: 3.5 },
];

/** A further heap or two at the foot of the wings, away from the walls' damage. */
export const FREE_HEAPS: readonly {
  id: string;
  x: number;
  z: number;
  away: [number, number];
}[] = [
  { id: "corner-nw", x: -17.7, z: -11.7, away: [0.7, 0.7] },
  { id: "corner-sw", x: -17.7, z: 11.7, away: [0.7, -0.7] },
  { id: "spawn-corner", x: -31.4, z: -23.4, away: [0.7, 0.7] },
];

export function furnishGroundDamage(map: MapBuilder): void {
  const layout = map.build();
  const solids = allSolids(layout).filter(
    (s) => s.kind === "ramp" || (s.bottom ?? 0) < 0.6,
  );
  const grates = ventBlocks(layout.vents);
  const random = rng(6112);
  const pick = <A>(list: readonly A[]): A =>
    list[Math.floor(random() * list.length)];
  const dress: PileElement[] = [];
  const debris: PileElement[] = [];
  const debrisBoxes: Array<{
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    top: number;
    exact: true;
  }> = [];

  const put = (
    list: PileElement[],
    shape: PileElement["shape"],
    x: number,
    y: number,
    z: number,
    size: V3,
    turn: V3,
    color: number,
  ): PileElement => {
    const e: PileElement = {
      shape,
      x,
      y,
      z,
      sx: size[0],
      sy: size[1],
      sz: size[2],
      rx: turn[0],
      ry: turn[1],
      rz: turn[2],
      color,
    };

    list.push(e);

    return e;
  };

  /** A bar from one point to another. */
  const between = (
    list: PileElement[],
    a: V3,
    b: V3,
    thick: number,
    color: number,
  ): void => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const length = Math.hypot(dx, dy, dz);

    put(
      list,
      "plank",
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
      (a[2] + b[2]) / 2,
      [length, thick, thick],
      [0, Math.atan2(-dz, dx), Math.asin(dy / length)],
      color,
    );
  };

  const polyline = (
    list: PileElement[],
    from: V3,
    steps: V3[],
    thick: number,
    color: number,
  ): void => {
    let p = from;

    for (const step of steps) {
      const q: V3 = [p[0] + step[0], p[1] + step[1], p[2] + step[2]];

      between(list, p, q, thick, color);
      p = q;
    }
  };

  /** Whether (x, z) is floor with nothing solid on it and no vent grate near. */
  const free = (x: number, z: number, margin = 0.05): boolean => {
    if (ventBlocksNear(grates, x, z, 0.3).length > 0) return false;

    return !solids.some(
      (s) =>
        s.kind === "box" &&
        x > s.minX - margin &&
        x < s.maxX + margin &&
        z > s.minZ - margin &&
        z < s.maxZ + margin &&
        s.height > 0.05,
    );
  };

  /** A piece laid on the floor by its own lowest point, a hair sunk in. */
  const layOn = (
    shape: PileElement["shape"],
    x: number,
    z: number,
    size: V3,
    turn: V3,
    color: number,
  ): PileElement | null => {
    if (!free(x, z)) return null;

    const e = put(debris, shape, x, 0, z, size, turn, color);
    const extent = meshExtent(e);

    e.y = -(extent ? extent.low : size[1] / 2) - 0.012;

    return e;
  };

  /** A bar lying on the floor, resting on its whole length. */
  const lieBar = (x: number, z: number, length: number, yaw: number): void => {
    const half = length / 2;
    const dx = Math.cos(yaw) * half;
    const dz = -Math.sin(yaw) * half;

    if (!free(x + dx, z + dz) || !free(x - dx, z - dz) || !free(x, z)) return;

    put(
      debris,
      "plank",
      x,
      0.014,
      z,
      [length, 0.028, 0.028],
      [0, yaw, 0],
      random() < 0.5 ? REBAR : REBAR_BARE,
    );
  };

  /**
   * What fell: one big chunk (with a low box the size of what is drawn), some
   * broken pieces, a flat shard or two, and a bar. `at` is the wall's foot,
   * `away` the unit vector out of the wall.
   */
  const heap = (
    atX: number,
    atZ: number,
    away: [number, number],
    spread: number,
    bigChunk: boolean,
  ): void => {
    const perp: [number, number] = [-away[1], away[0]];
    const place = (out: number, side: number): [number, number] => [
      atX + away[0] * out + perp[0] * side,
      atZ + away[1] * out + perp[1] * side,
    ];

    if (bigChunk) {
      const size = 0.3 + random() * 0.1;
      const [x, z] = place(
        0.38 + random() * 0.1,
        (random() - 0.5) * spread * 0.4,
      );
      const yaw = random() * Math.PI * 2;
      const e = layOn(
        "rock",
        x,
        z,
        [size * 1.35, size * 0.62, size],
        [random() * 0.15, yaw, random() * 0.15],
        pick(CONCRETE),
      );

      if (e) {
        const extent = meshExtent(e);
        const reach =
          ((Math.abs(Math.cos(yaw)) * e.sx + Math.abs(Math.sin(yaw)) * e.sz) /
            2) *
          0.8;
        const reachZ =
          ((Math.abs(Math.sin(yaw)) * e.sx + Math.abs(Math.cos(yaw)) * e.sz) /
            2) *
          0.8;

        debrisBoxes.push({
          minX: e.x - reach,
          maxX: e.x + reach,
          minZ: e.z - reachZ,
          maxZ: e.z + reachZ,
          top: Math.min(e.y + (extent ? extent.high : e.sy / 2), 0.3) * 0.9,
          exact: true,
        });
      }
    }

    for (let k = 0; k < 6; k++) {
      const size = 0.08 + random() * 0.14;
      const [x, z] = place(
        0.15 + random() * spread,
        (random() - 0.5) * spread * 1.6,
      );

      layOn(
        "rock",
        x,
        z,
        [size * 1.3, size * 0.8, size],
        [random() * 0.5, random() * Math.PI * 2, random() * 0.5],
        pick(k < 2 ? CONCRETE : FRACTURE),
      );
    }

    for (let k = 0; k < 2; k++) {
      const [x, z] = place(
        0.25 + random() * spread,
        (random() - 0.5) * spread * 1.4,
      );

      layOn(
        "slab",
        x,
        z,
        [0.22 + random() * 0.14, 0.05, 0.16 + random() * 0.1],
        [0, random() * Math.PI * 2, 0],
        pick(FRACTURE),
      );
    }

    const [bx, bz] = place(0.55 + random() * 0.4, (random() - 0.5) * spread);

    lieBar(bx, bz, 0.5 + random() * 0.5, random() * Math.PI);
  };

  // --------------------------------------------------------------- wall spalls
  const spall = (s: WallSpall): void => {
    const { face, plane, u, y, w, h } = s;
    const sign = face === "W" || face === "N" ? 1 : -1;
    const along = face === "W" || face === "E";
    /** A point `off` out of the wall, `du` along it, at height `v`. */
    const at = (off: number, v: number, du = 0): V3 =>
      along ? [plane + sign * off, v, u + du] : [u + du, v, plane + sign * off];

    // The break: four turned slabs of core concrete, each smaller than the
    // last and a little further out (their backs sunk into the wall), so the
    // outline is stepped and irregular and the edges are real.
    const layers: Array<
      [number, number, number, number, number, number, number]
    > = [
      // du, dv, width, height, off, turn, colour
      [0, 0, w, h, 0.02, (random() - 0.5) * 0.12, FRACTURE[2]],
      [
        w * 0.08,
        -h * 0.07,
        w * 0.78,
        h * 0.72,
        0.035,
        (random() - 0.5) * 0.3,
        FRACTURE[0],
      ],
      [
        -w * 0.1,
        h * 0.12,
        w * 0.55,
        h * 0.5,
        0.05,
        (random() - 0.5) * 0.4,
        FRACTURE[1],
      ],
      [
        w * 0.12,
        h * 0.16,
        w * 0.3,
        h * 0.28,
        0.065,
        (random() - 0.5) * 0.5,
        FRACTURE[0],
      ],
    ];

    for (const [du, dv, sw, sh, off, turn, color] of layers) {
      const [cx, cy, cz] = at(off, y + dv, du);

      // A chipped slab stood up on the wall: its thin axis out of the face, its
      // outline irregular, turned a little in the plane of the wall.
      put(
        dress,
        "slab",
        cx,
        cy,
        cz,
        along ? [sh, 0.07, sw] : [sw, 0.07, sh],
        along ? [turn, 0, Math.PI / 2] : [Math.PI / 2, turn, 0],
        color,
      );
    }

    // Fractured lumps round the rim, half sunk into the slabs and the wall.
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + random() * 0.4;
      const size = 0.1 + random() * 0.1;
      const [cx, cy, cz] = at(
        0.05 + size * 0.3,
        y + Math.sin(a) * h * 0.5,
        Math.cos(a) * w * 0.5,
      );

      put(
        dress,
        "rock",
        cx,
        cy,
        cz,
        [size * 1.2, size * 0.8, size],
        [random() * 0.4, random() * Math.PI * 2, random() * 0.4],
        pick(k % 3 === 0 ? CONCRETE : FRACTURE),
      );
    }

    // Reinforcement: three bars that start inside the wall, come out through
    // the break, and bend down or stop short (the last one snapped).
    for (let k = 0; k < 3; k++) {
      const du = (k - 1) * w * 0.28;
      const v = y + (k === 1 ? 0.12 : k === 0 ? -0.12 : 0.02);
      const out = k === 2 ? 0.16 : 0.3;
      const start = at(-0.14, v, du);
      const reach = (out + 0.14) * sign;
      const lean = (random() - 0.5) * 0.06;
      const steps: V3[] =
        k === 2
          ? [along ? [reach, 0, 0] : [0, 0, reach]]
          : [
              along ? [reach, 0.02, 0] : [0, 0.02, reach],
              along
                ? [sign * 0.06, -0.14 - random() * 0.1, lean]
                : [lean, -0.14 - random() * 0.1, sign * 0.06],
            ];

      polyline(dress, start, steps, 0.036, k % 2 ? REBAR : REBAR_BARE);
    }

    // The heap at the foot: directly below the break.
    const away: [number, number] = along ? [sign, 0] : [0, sign];
    const foot = at(0, 0, 0);

    heap(foot[0], foot[2], away, 0.5 + w * 0.4, h > 1.1);
  };

  // ---------------------------------------------------------------- slab edges
  const slabEdge = (e: SlabEdge): void => {
    const { face, plane, u, under } = e;
    const sign = face === "N" ? 1 : -1;

    // Broken lip: lumps hanging from the underside along the edge.
    for (let k = 0; k < 7; k++) {
      const size = 0.14 + random() * 0.12;

      put(
        dress,
        "rock",
        u + (k / 6 - 0.5) * 1.0,
        under - size * 0.3,
        plane + sign * (0.02 + random() * 0.2) - sign * size * 0.2,
        [size * 1.3, size * 0.9, size],
        [random() * 0.4, random() * Math.PI * 2, random() * 0.4],
        pick(FRACTURE),
      );
    }

    // Bars out of the underside: they start inside the slab, hang and bend;
    // the middle one is snapped short.
    for (const [i, du] of [-0.35, 0.05, 0.4].entries()) {
      const x = u + du;

      polyline(
        dress,
        [x, under + 0.22, plane - sign * 0.1],
        i === 1
          ? [[0, -0.6, sign * 0.03]]
          : [
              [0, -0.8, sign * 0.05],
              [(random() - 0.5) * 0.1, -0.3, sign * 0.3],
            ],
        0.04,
        i % 2 ? REBAR : REBAR_BARE,
      );
    }

    // What fell: on the floor under the edge.
    heap(u, plane, [0, sign], 0.7, true);
  };

  for (const s of WALL_SPALLS) spall(s);
  for (const e of SLAB_EDGES) slabEdge(e);

  for (const f of FREE_HEAPS) {
    heap(f.x, f.z, f.away, 0.5, false);
  }

  map.createFitting("fittings-ground-damage-dress", 0, dress, []);

  const pile = map.createFitting(
    "fittings-ground-damage-debris",
    0,
    debris,
    debrisBoxes.map((b) => ({ ...b, role: "floor" as const })),
  );

  // Every loose piece rests on what is really under it.
  groundPieces(pile.elements);
}
