import * as THREE from "three";

import type { PileElement, PileKind } from "./ArenaLayout";

/**
 * Builds the pieces of a pile of building material, deterministically from its
 * id (the same every run), and the collision boxes that outline them. Pure
 * data: the map puts the boxes in its collision and the arena builder draws the
 * pieces, so what you see is what stops you.
 *
 * Every pile is small (about 2 x 1.5 m and under a metre high) and a little
 * uneven, so it reads as work in progress, not as a prop to hide behind.
 */

export interface PileBox {
  /** Relative to the pile's centre. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Height above the surface the pile stands on. */
  top: number;
}

export interface PileShape {
  elements: PileElement[];
  /** The collision boxes: they enclose every piece, and nothing else. */
  boxes: PileBox[];
  /** Outer size, metres. */
  width: number;
  depth: number;
  height: number;
  /** How far the pieces were moved to centre them (used while building). */
  shiftX?: number;
  shiftZ?: number;
}

function hashId(id: string): number {
  let hash = 2166136261;

  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  }

  return hash >>> 0;
}

function rng(seed: number): () => number {
  let a = seed;

  return () => {
    a = (a + 0x6d2b79f5) | 0;

    let t = Math.imul(a ^ (a >>> 15), 1 | a);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A colour from `palette`, shaded by up to `spread` of itself. */
function shade(
  palette: readonly number[],
  random: () => number,
  spread = 0.12,
): number {
  const base = new THREE.Color(palette[Math.floor(random() * palette.length)]);
  const k = 1 + (random() - 0.5) * 2 * spread;

  base.multiplyScalar(k);

  return base.getHex();
}

const BAG_COLORS = [0x948d7a, 0x85837a, 0x9e957d, 0x7a786f, 0x8f866b];
const BRICK_COLORS = [0x5e3029, 0x6b392d, 0x532a25, 0x723f30, 0x5a3328];
const CHUNK_COLORS = [0x5a5c60, 0x6a6c6f, 0x4a4c50, 0x75767a, 0x585550];
/** Steel pipe: bare, rusted, dark and a muted green-grey. */
const PIPE_COLORS = [0x757e89, 0x8a5c42, 0x56616d, 0x7a8672, 0x69727c];
const WOOD_COLORS = [0x6e5538, 0x5d4730, 0x7a6244, 0x4f3d2a, 0x66503a];

const box = (
  e: Pick<PileElement, "x" | "y" | "z" | "sx" | "sy" | "sz"> &
    Partial<Pick<PileElement, "rx" | "ry" | "rz">>,
): { min: THREE.Vector3; max: THREE.Vector3 } => {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(e.x, e.y, e.z),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(e.rx ?? 0, e.ry ?? 0, e.rz ?? 0),
    ),
    new THREE.Vector3(1, 1, 1),
  );
  const bounds = new THREE.Box3();
  const corner = new THREE.Vector3();

  for (const sx of [-0.5, 0.5]) {
    for (const sy of [-0.5, 0.5]) {
      for (const sz of [-0.5, 0.5]) {
        corner.set(sx * e.sx, sy * e.sy, sz * e.sz).applyMatrix4(matrix);
        bounds.expandByPoint(corner);
      }
    }
  }

  return { min: bounds.min, max: bounds.max };
};

/** One box round all the pieces. */
function outline(elements: PileElement[]): PileShape {
  const total = new THREE.Box3();

  total.makeEmpty();

  for (const e of elements) {
    const b = box(e);

    total.expandByPoint(b.min);
    total.expandByPoint(b.max);
  }

  // Centre the pile on its middle, on the ground.
  const cx = (total.min.x + total.max.x) / 2;
  const cz = (total.min.z + total.max.z) / 2;

  for (const e of elements) {
    e.x -= cx;
    e.z -= cz;
  }

  const width = total.max.x - total.min.x;
  const depth = total.max.z - total.min.z;
  const height = total.max.y;

  return {
    elements,
    boxes: [
      {
        minX: -width / 2,
        maxX: width / 2,
        minZ: -depth / 2,
        maxZ: depth / 2,
        top: height,
      },
    ],
    width,
    depth,
    height,
    shiftX: cx,
    shiftZ: cz,
  };
}

/**
 * Cement bags laid in crossed layers, 3 to 5 high, the top layers missing a
 * bag or two so the stack is a little uneven. Each bag is a bulging pillow.
 */
function cement(random: () => number, low = false): PileShape {
  const length = 0.8;
  const width = 0.5;
  const thick = 0.2;
  // A low stack (cover you kneel behind) is one to three bags high.
  const layers = low
    ? 1 + Math.floor(random() * 3)
    : 3 + Math.floor(random() * 3);
  const elements: PileElement[] = [];

  for (let layer = 0; layer < layers; layer++) {
    const lengthwise = layer % 2 === 0;
    // Even layers: 2 bags along x by 3 along z. Odd: 3 along x by 2 along z.
    const nx = lengthwise ? 2 : 3;
    const nz = lengthwise ? 3 : 2;
    const sx = lengthwise ? length : width;
    const sz = lengthwise ? width : length;
    let kept = 0;

    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        // The top layers lose a bag now and then (never the whole layer).
        const spare = layer >= 2 && random() < 0.3 && kept + 1 < nx * nz;

        if (spare) {
          continue;
        }

        kept++;
        elements.push({
          shape: "bag",
          x: (i - (nx - 1) / 2) * sx + (random() - 0.5) * 0.04,
          y: thick / 2 + layer * thick * 0.94,
          z: (j - (nz - 1) / 2) * sz + (random() - 0.5) * 0.04,
          sx: sx * 0.97,
          sy: thick * (0.9 + random() * 0.2),
          sz: sz * 0.97,
          rx: 0,
          ry: (random() - 0.5) * 0.1,
          rz: 0,
          color: shade(BAG_COLORS, random),
        });
      }
    }
  }

  return outline(elements);
}

/**
 * A compact heap of loose bricks (courses getting shorter toward the top) with
 * a few lying scattered round its foot.
 */
function bricks(random: () => number): PileShape {
  const length = 0.42;
  const height = 0.15;
  const width = 0.2;
  const elements: PileElement[] = [];
  const courses = [
    { count: 4, rows: 3 },
    { count: 3, rows: 3 },
    { count: 3, rows: 2 },
    { count: 2, rows: 2 },
  ];

  courses.forEach((course, index) => {
    for (let i = 0; i < course.count; i++) {
      for (let j = 0; j < course.rows; j++) {
        if (index >= 2 && random() < 0.2) {
          continue;
        }

        elements.push({
          shape: "brick",
          x:
            (i - (course.count - 1) / 2) * length * 1.02 +
            (random() - 0.5) * 0.05,
          y: height / 2 + index * height,
          z:
            (j - (course.rows - 1) / 2) * width * 1.05 +
            (random() - 0.5) * 0.04,
          sx: length,
          sy: height,
          sz: width,
          rx: 0,
          ry: (random() - 0.5) * 0.18,
          rz: 0,
          color: shade(BRICK_COLORS, random, 0.15),
        });
      }
    }
  });

  // Strays: lying flat, or on edge, on the floor round the heap.
  const strays = 5 + Math.floor(random() * 3);

  for (let k = 0; k < strays; k++) {
    const angle = random() * Math.PI * 2;
    const reach = 0.75 + random() * 0.3;
    const edge = random() < 0.25;

    elements.push({
      shape: "brick",
      x: Math.cos(angle) * reach * 1.15,
      y: edge ? length / 2 - 0.1 : height / 2,
      z: Math.sin(angle) * reach * 0.75,
      sx: length,
      sy: height,
      sz: width,
      rx: edge ? Math.PI / 2 : 0,
      ry: random() * Math.PI,
      rz: 0,
      color: shade(BRICK_COLORS, random, 0.15),
    });
  }

  return outline(elements);
}

/**
 * Broken concrete you can walk across: a scatter of low mounds of flat chunks
 * with grit between them, never higher than 0.3 m (under a step, so a body
 * simply walks over it, bumping up and down a little). Every mound has its own
 * collision box exactly as high as its chunks; the grit is under 0.1 m and
 * has none. The layout is different for every pile: how many mounds, where,
 * how big, how the chunks lie, and which way the whole scatter runs.
 */
function rubble(random: () => number): PileShape {
  const elements: PileElement[] = [];
  const boxes: PileBox[] = [];
  const width = 1.5 + random() * 1.1;
  const depth = 1.0 + random() * 0.8;
  const mounds = 3 + Math.floor(random() * 3);
  const spots: Array<{ x: number; z: number; r: number }> = [];

  for (let m = 0; m < mounds; m++) {
    // Place each mound away from the ones already down (a few tries).
    let best = { x: 0, z: 0, r: 0.3 };

    for (let attempt = 0; attempt < 6; attempt++) {
      const r = 0.26 + random() * 0.24;
      const x = (random() - 0.5) * (width - r * 1.2);
      const z = (random() - 0.5) * (depth - r * 1.2);
      const clear = spots.every(
        (o) => Math.hypot(o.x - x, o.z - z) > (o.r + r) * 0.9,
      );

      best = { x, z, r };

      if (clear) {
        break;
      }
    }

    spots.push(best);

    const height = 0.12 + random() * 0.18;
    const half = best.r * 0.8;

    boxes.push({
      minX: best.x - half,
      maxX: best.x + half,
      minZ: best.z - half,
      maxZ: best.z + half,
      top: height,
    });

    // Flat chunks lying in the mound: all inside its box and under its top.
    const chunks = 3 + Math.floor(random() * 4);

    for (let c = 0; c < chunks; c++) {
      const size = half * (0.9 + random() * 0.9);
      const sy = Math.min(height * (0.55 + random() * 0.45), size * 0.7);
      const reach = Math.max(half - size * 0.5, 0);

      const piece: PileElement = {
        shape: "chunk",
        x: best.x + (random() - 0.5) * reach * 1.6,
        y: sy / 2 + (c > 2 ? Math.min(height - sy, sy * 0.3) : 0),
        z: best.z + (random() - 0.5) * reach * 1.6,
        sx: size,
        sy,
        sz: size * (0.7 + random() * 0.5),
        rx: (random() - 0.5) * 0.18,
        ry: random() * Math.PI,
        rz: (random() - 0.5) * 0.18,
        color: shade(CHUNK_COLORS, random, 0.1),
      };

      // However it lies, a chunk stays inside its mound's box and under its
      // top: shrink it until it does (a few passes at most).
      for (let pass = 0; pass < 10; pass++) {
        const bounds = box(piece);

        if (
          bounds.min.x >= best.x - half - 0.01 &&
          bounds.max.x <= best.x + half + 0.01 &&
          bounds.min.z >= best.z - half - 0.01 &&
          bounds.max.z <= best.z + half + 0.01 &&
          bounds.max.y <= height + 0.005
        ) {
          break;
        }

        piece.sx *= 0.9;
        piece.sz *= 0.9;
        piece.sy *= 0.93;
        piece.y = piece.sy / 2;
      }

      elements.push(piece);
    }
  }

  // Grit and small shards over the floor between the mounds: very low, and
  // with no collision of their own.
  const grit = 6 + Math.floor(random() * 8);

  for (let g = 0; g < grit; g++) {
    const size = 0.07 + random() * 0.08;

    elements.push({
      shape: "chunk",
      x: (random() - 0.5) * (width + 0.3),
      y: size * 0.25,
      z: (random() - 0.5) * (depth + 0.3),
      sx: size,
      sy: size * 0.5,
      sz: size * (0.7 + random() * 0.6),
      rx: 0,
      ry: random() * Math.PI,
      rz: 0,
      color: shade(CHUNK_COLORS, random, 0.12),
    });
  }

  // Turn the whole scatter a random quarter turn so two piles never read as
  // the same shape.
  const turn = random() < 0.5;
  const placed = turn
    ? elements.map((e) => ({ ...e, x: e.z, z: e.x, sx: e.sz, sz: e.sx }))
    : elements;
  const turnedBoxes = turn
    ? boxes.map((b) => ({
        minX: b.minZ,
        maxX: b.maxZ,
        minZ: b.minX,
        maxZ: b.maxX,
        top: b.top,
      }))
    : boxes;
  const all = new THREE.Box3();

  all.makeEmpty();

  for (const e of placed) {
    const bounds = box(e);

    all.expandByPoint(bounds.min);
    all.expandByPoint(bounds.max);
  }

  return {
    elements: placed,
    boxes: turnedBoxes,
    width: all.max.x - all.min.x,
    depth: all.max.z - all.min.z,
    height: Math.max(...boxes.map((x) => x.top)),
  };
}

/**
 * A short stack of rough boards (layers laid crossways), a few offcuts on top
 * and two boards leaning against one long side.
 */
function wood(random: () => number): PileShape {
  const elements: PileElement[] = [];
  const thick = 0.07;
  const boardWidth = 0.22;
  const layers = 4 + Math.floor(random() * 3);

  for (let layer = 0; layer < layers; layer++) {
    const along = layer % 2 === 0;
    const count = along ? 5 : 8;
    const long = along ? 1.9 : 1.1;

    for (let i = 0; i < count; i++) {
      const span = boardWidth * 1.04;
      const off = (i - (count - 1) / 2) * span;
      const slack = (random() - 0.5) * 0.1;

      elements.push({
        shape: "plank",
        x: along ? slack * 2 : off,
        y: thick / 2 + 0.05 + layer * thick,
        z: along ? off : slack,
        sx: along ? long * (0.9 + random() * 0.1) : boardWidth,
        sy: thick * (0.9 + random() * 0.2),
        sz: along ? boardWidth : long * (0.9 + random() * 0.1),
        rx: 0,
        ry: (random() - 0.5) * 0.05,
        rz: 0,
        color: shade(WOOD_COLORS, random, 0.1),
      });
    }
  }

  // Offcuts on top.
  const top = 0.05 + layers * thick;

  for (let i = 0; i < 3; i++) {
    elements.push({
      shape: "plank",
      x: (random() - 0.5) * 1.1,
      y: top + thick / 2,
      z: (random() - 0.5) * 0.6,
      sx: 0.35 + random() * 0.4,
      sy: thick * 1.2,
      sz: boardWidth,
      rx: 0,
      ry: random() * Math.PI,
      rz: 0,
      color: shade(WOOD_COLORS, random, 0.12),
    });
  }

  // Leaning boards against the +z side: tilted about x.
  for (let i = 0; i < 2; i++) {
    const tilt = 0.32 + random() * 0.14;
    const long = 1.0 + random() * 0.3;
    const z = 0.9 * boardWidth * 4 * 0.5 + 0.15 + Math.sin(tilt) * long * 0.5;

    elements.push({
      shape: "plank",
      x: (i - 0.5) * 0.7 + (random() - 0.5) * 0.2,
      y: Math.cos(tilt) * long * 0.5 + 0.02,
      z,
      sx: boardWidth,
      sy: thick,
      sz: long,
      rx: -tilt,
      ry: 0,
      rz: 0,
      color: shade(WOOD_COLORS, random, 0.1),
    });
  }

  return outline(elements);
}

/**
 * A low brick barricade: running-bond courses with a stepped, broken end and a
 * few missing bricks near one end of the top. The collision follows the real
 * profile (boxes of different heights), so what is missing is not in the way.
 */
function barricade(random: () => number): PileShape {
  const length = 0.5;
  const height = 0.18;
  const thick = 0.4;
  const courses = 6;
  const bricksPerCourse = 6;
  const elements: PileElement[] = [];
  // Which bricks of the top courses are gone (the broken end is at the +x end).
  const gone = new Set<string>();

  for (let course = courses - 1; course >= courses - 3; course--) {
    const lost = courses - course; // 1 brick on the top course... 3 on the third
    const reach = lost * 1.2 + random() * 0.6;

    for (let i = 0; i < bricksPerCourse + 1; i++) {
      if (i >= bricksPerCourse - reach) {
        gone.add(`${course}:${i}`);
      }
    }
  }

  const wallLeft0 = -(bricksPerCourse * length) / 2;

  for (let course = 0; course < courses; course++) {
    // Running bond: every other course starts and ends with a half brick.
    const even = course % 2 === 0;
    const count = even ? bricksPerCourse : bricksPerCourse + 1;

    for (let i = 0; i < count; i++) {
      if (gone.has(`${course}:${i}`)) {
        continue;
      }

      const half = !even && (i === 0 || i === count - 1);
      const size = half ? length / 2 : length;
      let x: number;

      if (even) {
        x = wallLeft0 + (i + 0.5) * length;
      } else if (i === 0) {
        x = wallLeft0 + length / 4;
      } else if (i === count - 1) {
        x = -wallLeft0 - length / 4;
      } else {
        x = wallLeft0 + i * length;
      }

      elements.push({
        shape: "brick",
        x: x + (random() - 0.5) * 0.02,
        y: height / 2 + course * height,
        z: (random() - 0.5) * 0.03,
        sx: size * 0.98,
        sy: height * 0.98,
        sz: thick,
        rx: 0,
        ry: (random() - 0.5) * 0.04,
        rz: 0,
        color: shade(BRICK_COLORS, random, 0.14),
      });
    }
  }

  // A few fallen bricks at the broken end's foot.
  for (let k = 0; k < 4; k++) {
    elements.push({
      shape: "brick",
      x: (bricksPerCourse * length) / 2 - 0.3 + random() * 0.5,
      y: height / 2,
      z: (random() < 0.5 ? -1 : 1) * (thick / 2 + 0.2 + random() * 0.15),
      sx: length,
      sy: height,
      sz: 0.2,
      rx: 0,
      ry: random() * Math.PI,
      rz: 0,
      color: shade(BRICK_COLORS, random, 0.14),
    });
  }

  // The collision follows the heights of the wall column by column (a column
  // is half a brick wide), so a broken end is lower and open to step round.
  // Worked out before the pile is re-centred: the wall is centred on x = 0.
  const columns = bricksPerCourse * 2;
  const wallLeft = -(bricksPerCourse * length) / 2;
  const colWidth = length / 2;
  const tops: number[] = [];

  for (let c = 0; c < columns; c++) {
    const lo = wallLeft + c * colWidth + 1e-3;
    const hi = lo + colWidth - 2e-3;
    let top = 0;

    for (const e of elements) {
      // Fallen bricks outside the wall's thickness are drawn, not wall.
      if (Math.abs(e.z) > thick / 2 + 0.02) {
        continue;
      }

      const b = box(e);

      if (b.max.x > lo && b.min.x < hi) {
        top = Math.max(top, b.max.y);
      }
    }

    tops.push(top);
  }

  const shape = outline(elements);
  // outline() moved the pieces so their bounds are centred: move the boxes too.
  const shiftX = shape.shiftX ?? 0;
  const shiftZ = shape.shiftZ ?? 0;
  const boxes: PileBox[] = [];

  // Merge neighbouring columns of the same height into one box.
  for (let c = 0; c < columns;) {
    let end = c;

    while (end + 1 < columns && Math.abs(tops[end + 1] - tops[c]) < 1e-3) {
      end++;
    }

    if (tops[c] > 0) {
      boxes.push({
        minX: wallLeft + c * colWidth - shiftX,
        maxX: wallLeft + (end + 1) * colWidth - shiftX,
        minZ: -thick / 2 - shiftZ,
        maxZ: thick / 2 - shiftZ,
        top: tops[c],
      });
    }

    c = end + 1;
  }

  return { ...shape, boxes: boxes.length > 0 ? boxes : shape.boxes };
}

export type BarrierStyle = "pipes" | "brick";

/**
 * A barrier of `length` x `thick` x `height` metres, along x, centred, with
 * its foot on the ground: a stack of pipes (`pipes`) or running-bond bricks
 * with gaps and a ragged top (`brick`). The boxes are the collision to use:
 * `pipes` is one block; `brick` is a column per half brick, merged where the
 * heights match, so a missing top course is lower there and is not a wall.
 */
export function buildBarrierShape(
  style: BarrierStyle,
  id: string,
  length: number,
  thick: number,
  height: number,
): PileShape {
  const random = rng(hashId(`barrier-${style}:${id}`));
  const elements: PileElement[] = [];
  const half = length / 2;

  if (style === "pipes") {
    // A stack of pipes the way it would really lie: pipes along x packed
    // hexagonally, two wide, each course sitting in the grooves of the one
    // below (so the stack cannot roll), the odd pipe missing from the top
    // course, and a pair of upright pipes at each end holding it in.
    const lane = thick / 2.5;
    const rise = Math.sqrt(3) / 2;
    const courses = Math.max(3, Math.ceil((height / lane - 1) / rise + 1));
    const diameter = height / (1 + rise * (courses - 1));
    const span = diameter * 2.5;
    const inner = half - diameter * 1.05;

    for (let c = 0; c < courses; c++) {
      for (let col = 0; col < 2; col++) {
        // Alternate courses are shifted half a pipe sideways: the groove.
        const z =
          (col - 0.5) * diameter + (c % 2 === 0 ? -1 : 1) * diameter * 0.25;
        // Each lane is cut from a different start so joints never line up.
        let x = -inner - random() * 0.4;

        while (x < inner) {
          const len = 0.8 + random() * 0.9;
          const a = Math.max(x, -inner);
          const b = Math.min(x + len, inner);
          const gap = 0.03 + random() * 0.07;
          // Only the top course loses pipes (nothing is left floating).
          const missing = c === courses - 1 && random() < 0.18;

          if (!missing && b - a > 0.2) {
            const d = diameter * (0.97 + random() * 0.03);

            elements.push({
              shape: "pipe",
              x: (a + b) / 2,
              y: d / 2 + c * diameter * rise,
              z,
              sx: b - a,
              sy: d,
              sz: d,
              rx: 0,
              ry: (random() - 0.5) * 0.02,
              rz: 0,
              color: shade(PIPE_COLORS, random, 0.14),
            });
          }

          x += len + gap;
        }
      }
    }

    // Two upright pipes at each end, one at each side of the stack.
    for (const side of [-1, 1]) {
      for (const face of [-1, 1]) {
        elements.push({
          shape: "pipe",
          x: side * (half - diameter / 2),
          y: height / 2,
          z: face * (span / 2 - diameter / 2),
          sx: height,
          sy: diameter * 0.95,
          sz: diameter * 0.95,
          rx: 0,
          ry: 0,
          rz: Math.PI / 2,
          color: shade(PIPE_COLORS, random, 0.1),
        });
      }
    }

    return {
      elements,
      boxes: [
        {
          minX: -half,
          maxX: half,
          minZ: -thick / 2,
          maxZ: thick / 2,
          top: height,
        },
      ],
      width: length,
      depth: thick,
      height,
    };
  }

  // Brick: courses of 0.15 m, bricks 0.4 m long, the top two courses ragged.
  const brickH = 0.15;
  const brickL = 0.4;
  const courses = Math.max(2, Math.round(height / brickH));
  const columns = Math.ceil(length / (brickL / 2));
  const colW = length / columns;
  // How many top courses are missing at each half-brick column (0 to 2).
  const lost: number[] = [];
  let level = 0;

  for (let c = 0; c < columns; c++) {
    if (random() < 0.3) {
      level = Math.floor(random() * 3);
    }

    lost.push(level);
  }

  for (let course = 0; course < courses; course++) {
    const shift = course % 2 === 0 ? 0 : brickL / 2;

    for (let x = -half - shift; x < half; x += brickL) {
      const a = Math.max(x, -half);
      const b = Math.min(x + brickL, half);

      if (b - a < 0.1) {
        continue;
      }

      // The columns this brick covers: all of its top courses must still stand.
      const first = Math.floor((a + half) / colW + 1e-6);
      const last = Math.ceil((b + half) / colW - 1e-6) - 1;
      let gone = false;

      for (let c = first; c <= last; c++) {
        if (course >= courses - lost[c]) {
          gone = true;
        }
      }

      // A few gaps lower down too: a brick out, so you can see through.
      if (gone || (course < courses - 2 && course > 0 && random() < 0.07)) {
        continue;
      }

      elements.push({
        shape: "brick",
        x: (a + b) / 2 + (random() - 0.5) * 0.02,
        y: brickH / 2 + course * brickH,
        z: (random() - 0.5) * 0.02,
        sx: b - a - 0.012,
        sy: brickH * 0.97,
        sz: thick * 0.98,
        rx: 0,
        ry: (random() - 0.5) * 0.03,
        rz: 0,
        color: shade(BRICK_COLORS, random, 0.14),
      });
    }
  }

  // Collision: a column's height is its highest standing course; merge equals.
  const tops = lost.map((l) => (courses - l) * brickH);
  const boxes: PileBox[] = [];

  for (let c = 0; c < columns;) {
    let end = c;

    while (end + 1 < columns && Math.abs(tops[end + 1] - tops[c]) < 1e-6) {
      end++;
    }

    boxes.push({
      minX: -half + c * colW,
      maxX: -half + (end + 1) * colW,
      minZ: -thick / 2,
      maxZ: thick / 2,
      top: tops[c],
    });

    c = end + 1;
  }

  return {
    elements,
    boxes,
    width: length,
    depth: thick,
    height: Math.max(...tops),
  };
}

/**
 * A wall of cement bags used as cover: 3.2 m long, three bags high, laid in
 * running bond (every other course shifted half a bag), the top course broken
 * at one end so it steps down, and two loose bags at its foot. The collision
 * is one box per half-bag column at that column's real height, so the steps
 * are steps.
 */
function bagWall(random: () => number): PileShape {
  const length = 0.8;
  const thick = 0.5;
  const height = 0.2;
  const bags = 4;
  const courses = 3;
  const left = -(bags * length) / 2;
  const elements: PileElement[] = [];
  // Bags lost from the top course at the +x end (1 or 2), and the middle
  // course loses one at the very end now and then.
  const lostTop = 1 + Math.floor(random() * 2);

  for (let course = 0; course < courses; course++) {
    const even = course % 2 === 0;
    const count = even ? bags : bags + 1;

    for (let i = 0; i < count; i++) {
      const half = !even && (i === 0 || i === count - 1);
      const size = half ? length / 2 : length;
      let x: number;

      if (even) {
        x = left + (i + 0.5) * length;
      } else if (i === 0) {
        x = left + length / 4;
      } else if (i === count - 1) {
        x = -left - length / 4;
      } else {
        x = left + i * length;
      }

      // The broken end: the top course is missing its last bags.
      if (course === courses - 1 && x > -left - lostTop * length) {
        continue;
      }

      elements.push({
        shape: "bag",
        x: x + (random() - 0.5) * 0.04,
        y: height / 2 + course * height * 0.93,
        z: (random() - 0.5) * 0.05,
        sx: size * 0.97,
        sy: height * (0.92 + random() * 0.14),
        sz: thick * (0.94 + random() * 0.06),
        rx: 0,
        ry: (random() - 0.5) * 0.08,
        rz: (random() - 0.5) * 0.04,
        color: shade(BAG_COLORS, random),
      });
    }
  }

  // The collision follows the real heights, column by column (half a bag).
  const columns = bags * 2;
  const colWidth = length / 2;
  const tops: number[] = [];

  for (let c = 0; c < columns; c++) {
    const lo = left + c * colWidth + 1e-3;
    const hi = lo + colWidth - 2e-3;
    let top = 0;

    for (const e of elements) {
      const b = box(e);

      if (b.max.x > lo && b.min.x < hi) {
        top = Math.max(top, b.max.y);
      }
    }

    tops.push(top);
  }

  // Two bags fallen at the foot (outside the wall's thickness, low).
  for (let k = 0; k < 2; k++) {
    elements.push({
      shape: "bag",
      x: -left - 0.3 - random() * 0.5,
      y: height / 2,
      z: (k === 0 ? -1 : 1) * (thick / 2 + 0.3),
      sx: length * 0.95,
      sy: height,
      sz: thick * 0.9,
      rx: 0,
      ry: (random() - 0.5) * 1.2,
      rz: 0,
      color: shade(BAG_COLORS, random),
    });
  }

  const shape = outline(elements);
  const shiftX = shape.shiftX ?? 0;
  const shiftZ = shape.shiftZ ?? 0;
  const boxes: PileBox[] = [];

  for (let c = 0; c < columns;) {
    let end = c;

    while (end + 1 < columns && Math.abs(tops[end + 1] - tops[c]) < 1e-3) {
      end++;
    }

    if (tops[c] > 0) {
      boxes.push({
        minX: left + c * colWidth - shiftX,
        maxX: left + (end + 1) * colWidth - shiftX,
        minZ: -thick / 2 - shiftZ,
        maxZ: thick / 2 - shiftZ,
        top: tops[c],
      });
    }

    c = end + 1;
  }

  return { ...shape, boxes: boxes.length > 0 ? boxes : shape.boxes };
}

const BUILDERS: Record<PileKind, (random: () => number) => PileShape> = {
  cement,
  bagwall: bagWall,
  bags: (random) => cement(random, true),
  pipes: (random) => {
    // A standalone stack of pipes: 2.4 x 0.4 x 0.9 m.
    const shape = buildBarrierShape("pipes", `t${random()}`, 2.4, 0.4, 0.9);

    return shape;
  },
  bricks,
  rubble,
  wood,
  barricade,
};

/** The shape of the pile `id` of `kind`: the same every run. */
export function buildPile(kind: PileKind, id: string): PileShape {
  return BUILDERS[kind](rng(hashId(`${kind}:${id}`)));
}
