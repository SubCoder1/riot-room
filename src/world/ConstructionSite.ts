import type { FramePart } from "./ArenaLayout";
import { Pieces, rng } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import { pallet } from "./StorageRoom";

/**
 * The unfinished building's construction story, told in three zones that
 * stand where the work would have been done. Everything is placed against the
 * existing structure and lanes: the existing solids, ledges and doors do not
 * move, and every new solid either touches what is beside it or leaves a lane.
 *
 *   MATERIAL STORAGE (the loading dock): palletised bricks and concrete
 *     blocks, a stack of cement sacks, a rack of reinforcement bars with their
 *     tie wire, a stack of formwork timber, the leftovers: a wheelbarrow,
 *     buckets, a shovel and offcuts.
 *   ACTIVE WORK (the west terrace): tubular scaffolding against the barracks
 *     wall, a leaning work ladder, a mortar board on trestles with a bucket and
 *     trowel, a stake with caution tape, loose bricks by the
 *     half-built nook wall.
 *   RAW STRUCTURE: reinforcement bars sprouting from the tops of the hall's
 *     columns and from the ends of the unfinished rooftop walls.
 *
 * The service zone (generator, distribution board, reel and fuel) is in
 * PowerGrid, on the east deck.
 */

const BRICKS = [0x6a3a30, 0x5a3329, 0x71402f, 0x4f3029, 0x5e3a33];
const BRICK_JOINT = 0x2a1d18;
const BLOCK = 0x6e737b;
const BLOCK_DARK = 0x5b6068;
const SACK = [0x8e8c84, 0x7a786f, 0x86847a];
const TIMBER = 0x7a5c3c;
const TIMBER_B = 0x6a5035;
const TIMBER_DARK = 0x4e3a28;
const TIMBER_NEW = 0x9a7c52;
const REBAR = 0x3a322d;
const REBAR_LIGHT = 0x6b5646;
const STEEL = 0x4f5f74;
const STEEL_BARE = 0x8791a0;
const BLACK = 0x14161a;
const BUCKET_GREY = 0x6a727e;
const BUCKET_ORANGE = 0x9a5a2a;
const BUCKET_BLUE = 0x3c5a78;
const TAPE_RED = 0x9a2f27;
const TAPE_WHITE = 0xc9c6b4;
const MORTAR = 0x77706a;
const SCAFFOLD = 0x7a8088;

/** A pack of bricks on a pallet: courses, bands and a torn wrap, one half used. */
function brickPack(
  p: Pieces,
  random: () => number,
  cx: number,
  cz: number,
  w: number,
  d: number,
  height: number,
  ry: number,
): void {
  const tone = BRICKS[Math.floor(random() * BRICKS.length)];

  pallet(p, cx, cz, w, d, ry);
  p.box(cx, 0.125, cz, w - 0.04, height, d - 0.04, tone, ry);

  // Courses: dark joints every 0.075 m on the two long faces, and a lighter
  // tone on alternate courses so the pack reads as laid bricks.
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (a: number, b: number): [number, number] => [
    cx + a * c + b * s,
    cz - a * s + b * c,
  ];

  for (let y = 0.2; y < height + 0.1; y += 0.075) {
    for (const side of [-1, 1]) {
      const [fx, fz] = at(0, side * (d / 2 - 0.018));
      const [gx, gz] = at(side * (w / 2 - 0.018), 0);

      p.box(fx, y, fz, w - 0.05, 0.012, 0.008, BRICK_JOINT, ry);
      p.box(gx, y, gz, 0.008, 0.012, d - 0.05, BRICK_JOINT, ry);
    }
  }

  // Two steel bands and the torn corner of the wrap.
  for (const t of [-0.22, 0.22]) {
    const [bx, bz] = at(t, 0);

    p.box(bx, 0.125, bz, 0.02, height + 0.01, d - 0.02, STEEL_BARE, ry);
  }

  p.box(cx, 0.125 + height, cz, w - 0.06, 0.012, d - 0.06, 0x8a9298, ry);
}

/** A stack of concrete blocks on a pallet, laid in alternate layers. */
function blockStack(
  p: Pieces,
  cx: number,
  cz: number,
  w: number,
  d: number,
  layers: number,
): void {
  pallet(p, cx, cz, w, d, 0);

  for (let k = 0; k < layers; k++) {
    const y = 0.125 + k * 0.2;
    const flip = k % 2 === 0;

    p.box(cx, y, cz, w - 0.06, 0.2, d - 0.06, flip ? BLOCK : BLOCK_DARK);

    // Block faces: seams every 0.4 m on the long faces, the other way on the next layer.
    const along = flip ? 0.4 : 0.5;

    for (let t = -w / 2 + along; t < w / 2 - 0.1; t += along) {
      p.box(cx + t, y + 0.02, cz - d / 2 + 0.032, 0.012, 0.16, 0.008, 0x34383e);
      p.box(cx + t, y + 0.02, cz + d / 2 - 0.032, 0.012, 0.16, 0.008, 0x34383e);
    }

    p.box(
      cx - w / 2 + 0.032,
      y + 0.02,
      cz + (flip ? 0.0 : 0.2),
      0.008,
      0.16,
      0.012,
      0x34383e,
    );
  }

  // A strap round the stack.
  p.box(cx, 0.125, cz, w - 0.02, layers * 0.2, 0.02, STEEL_BARE);
}

/** Formwork timber: bearers and layers of new and used boards, stickers between, one pile askew. */
function timberStack(
  p: Pieces,
  random: () => number,
  x0: number,
  z0: number,
  len: number,
  depth: number,
  layers: number,
): void {
  for (const t of [0.15, len / 2, len - 0.15]) {
    p.box(x0 + t, 0, z0 + depth / 2, 0.1, 0.08, depth - 0.1, TIMBER_DARK);
  }

  for (let k = 0; k < layers; k++) {
    const y = 0.08 + k * 0.085;

    for (let j = 0; j < 7; j++) {
      const stagger = (random() - 0.5) * 0.14;
      const tone = [TIMBER, TIMBER_B, TIMBER_NEW, TIMBER_DARK][
        Math.floor(random() * 4)
      ];

      p.box(
        x0 + len / 2 + stagger,
        y,
        z0 + 0.12 + j * ((depth - 0.24) / 6),
        len - 0.04 - Math.abs(stagger) * 2,
        0.075,
        0.2,
        tone,
        (random() - 0.5) * 0.02,
      );
    }

    // Stickers (short cross pieces) between layers.
    if (k < layers - 1) {
      for (const t of [0.3, len - 0.3]) {
        p.box(
          x0 + t,
          y + 0.075,
          z0 + depth / 2,
          0.05,
          0.01,
          depth - 0.2,
          TIMBER_DARK,
        );
      }
    }
  }
}

/** A rack of reinforcement bars in tied bundles, with a few loose lengths. */
function rebarRack(
  p: Pieces,
  random: () => number,
  x0: number,
  z0: number,
  width: number,
  length: number,
): void {
  // Three timber sleepers across the rack carry everything.
  for (const t of [0.2, length / 2, length - 0.2]) {
    p.box(x0 + width / 2, 0, z0 + t, width - 0.04, 0.12, 0.12, TIMBER_DARK);
  }

  // Three bundles of bars, each a round bundle with its tie wire and bar ends.
  for (let b = 0; b < 3; b++) {
    const x = x0 + 0.22 + b * 0.4;
    const tone = b === 1 ? REBAR_LIGHT : REBAR;

    p.bar(
      x,
      0.12 + 0.11,
      z0 + length / 2,
      length - 0.1,
      0.22,
      tone,
      Math.PI / 2,
    );

    // The ribbed bars: a few lighter lengths over the bundle, cut ends at the ends.
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + b;

      p.bar(
        x + Math.cos(a) * 0.1,
        0.23 + Math.sin(a) * 0.1,
        z0 + length / 2 + (random() - 0.5) * 0.06,
        length - 0.04,
        0.016,
        REBAR_LIGHT,
        Math.PI / 2,
      );
    }

    for (const t of [0.5, length / 2, length - 0.5]) {
      p.box(x, 0.12, z0 + t, 0.235, 0.22, 0.012, STEEL_BARE);
    }

    // The sawn ends, bright steel in a rusty bundle.
    for (const t of [0.04, length - 0.04]) {
      p.bar(x, 0.23, z0 + t, 0.02, 0.2, 0x9a9488, Math.PI / 2);
    }
  }

  // Three loose lengths on top, one fallen against the rack.
  for (let k = 0; k < 3; k++) {
    p.bar(
      x0 + 0.3 + k * 0.32,
      0.5,
      z0 + length / 2,
      length - 0.3,
      0.018,
      REBAR,
      Math.PI / 2,
    );
  }

  p.bar(
    x0 + width + 0.1,
    0.06,
    z0 + length / 2 + 0.2,
    length - 0.8,
    0.018,
    REBAR,
    Math.PI / 2 + 0.06,
  );
}

/** A bucket: tapered pail, a handle, a worn rim and a tide-mark of dried cement. */
function bucket(
  p: Pieces,
  x: number,
  z: number,
  color: number,
  bottom = 0,
): void {
  p.post(x, bottom, z, 0.3, 0.26, color);
  p.post(x, bottom + 0.3, z, 0.02, 0.28, 0x2a2e34);
  p.post(x, bottom + 0.18, z, 0.04, 0.27, 0x8a8a84);
  p.bar(x, bottom + 0.36, z, 0.3, 0.012, STEEL_BARE);
}

/** A wheelbarrow: a steel tray, a wheel, two legs and two wooden handles. */
function wheelbarrow(
  p: Pieces,
  x: number,
  z: number,
  ry: number,
  load: boolean,
): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (a: number, b: number): [number, number] => [
    x + a * c + b * s,
    z - a * s + b * c,
  ];
  const [tx, tz] = at(0, 0);

  // The tray: a body and a rolled rim, sloping to the wheel (the +a end).
  p.box(tx, 0.32, tz, 0.78, 0.22, 0.58, 0x3c5a78, ry);
  p.box(tx, 0.52, tz, 0.82, 0.03, 0.62, 0x2a3d54, ry);

  if (load) {
    p.box(tx, 0.52, tz, 0.6, 0.08, 0.4, MORTAR, ry);
  }

  const [wx, wz] = at(0.5, 0);

  p.bar(wx, 0.19, wz, 0.07, 0.38, BLACK, ry + Math.PI / 2);
  p.bar(wx, 0.19, wz, 0.1, 0.1, STEEL_BARE, ry + Math.PI / 2);

  for (const side of [-1, 1]) {
    const [hx, hz] = at(-0.55, side * 0.26);
    const [lx, lz] = at(-0.15, side * 0.26);

    p.bar(hx - (hx - tx) * 0.0, 0.52, hz, 0.8, 0.045, TIMBER_B, ry);
    p.box(lx, 0, lz, 0.04, 0.34, 0.04, STEEL, ry);
  }
}

/** A tubular scaffold bay frame: returns the solid parts for shots. */
function scaffold(
  p: Pieces,
  x0: number,
  x1: number,
  zWall: number,
  depth: number,
  top: number,
): FramePart[] {
  const parts: FramePart[] = [];
  const z0 = zWall;
  const z1 = zWall + depth;
  const bays = Math.round((x1 - x0) / 1.8);
  const bay = (x1 - x0) / bays;
  const part = (
    ax: number,
    bx: number,
    az: number,
    bz: number,
    ay: number,
    by: number,
  ): void => {
    parts.push({
      minX: Math.min(ax, bx) - 0.03,
      maxX: Math.max(ax, bx) + 0.03,
      minZ: Math.min(az, bz) - 0.03,
      maxZ: Math.max(az, bz) + 0.03,
      minY: ay,
      maxY: by,
    });
  };

  // Standards (the uprights) on two rows, sole boards under the feet.
  for (let i = 0; i <= bays; i++) {
    const x = x0 + i * bay;

    for (const z of [z0 + 0.05, z1 - 0.05]) {
      p.post(x, 0.02, z, top - 0.02, 0.05, SCAFFOLD);
      p.box(x, 0, z, 0.3, 0.02, 0.3, TIMBER_DARK);
      p.box(x, 0.02, z, 0.12, 0.012, 0.12, STEEL_BARE);
      part(x, x, z, z, 0, top);
    }
  }

  // Ledgers along each row and transoms across, at base, mid and deck height.
  for (const y of [0.3, 1.3, 2.3]) {
    for (const z of [z0 + 0.05, z1 - 0.05]) {
      p.bar((x0 + x1) / 2, y, z, x1 - x0, 0.048, SCAFFOLD);
      part(x0, x1, z, z, y - 0.03, y + 0.03);
    }

    for (let i = 0; i <= bays; i++) {
      const x = x0 + i * bay;

      p.bar(
        x,
        y - 0.05,
        (z0 + z1) / 2,
        depth - 0.1,
        0.048,
        SCAFFOLD,
        Math.PI / 2,
      );
      p.box(x, y - 0.06, z0 + 0.05, 0.075, 0.075, 0.075, STEEL_BARE);
      p.box(x, y - 0.06, z1 - 0.05, 0.075, 0.075, 0.075, STEEL_BARE);
    }
  }

  // The working deck: scaffold boards across the transoms, with a toe board and guard rails on the open face.
  for (let b = 0; b < 3; b++) {
    p.box(
      (x0 + x1) / 2,
      2.3,
      z0 + 0.12 + b * 0.22,
      x1 - x0 + 0.04,
      0.04,
      0.2,
      b === 1 ? TIMBER : TIMBER_B,
    );
  }

  part(x0, x1, z0, z1, 2.3, 2.34);
  p.box((x0 + x1) / 2, 2.34, z1 - 0.02, x1 - x0, 0.15, 0.03, TIMBER_DARK);

  for (const y of [2.8, 3.3]) {
    p.bar((x0 + x1) / 2, y, z1 - 0.05, x1 - x0, 0.04, SCAFFOLD);
  }

  for (let i = 0; i <= bays; i++) {
    p.post(x0 + i * bay, 2.34, z1 - 0.05, 1.0, 0.045, SCAFFOLD);
  }

  // Cross braces on the open face, from foot to deck.
  for (let i = 0; i < bays; i++) {
    const a = x0 + i * bay;
    const b = a + bay;
    const length = Math.hypot(bay, 2.0);
    const tilt = Math.atan2(2.0, bay);

    p.bar((a + b) / 2, 1.3, z1 - 0.07, length, 0.04, SCAFFOLD, 0, tilt);
    p.bar((a + b) / 2, 1.3, z1 - 0.07, length, 0.04, SCAFFOLD, 0, -tilt);
  }

  // A few items on the deck: a bucket of mortar, a stack of bricks and a spirit level.
  bucket(p, x0 + 0.5, z0 + 0.4, BUCKET_GREY, 2.34);
  p.box(x0 + 1.4, 2.34, z0 + 0.3, 0.4, 0.18, 0.2, BRICKS[0]);
  p.box(x0 + 1.4, 2.52, z0 + 0.3, 0.36, 0.08, 0.18, BRICKS[2], 0.1);
  p.box(x0 + 2.4, 2.34, z0 + 0.45, 0.6, 0.03, 0.04, BUCKET_ORANGE, 0.2);
  part(x0, x1, z0, z1, 2.8, 2.84);

  return parts;
}

/** A work ladder leaning on a wall facing +z: two rails and rungs, tilted off the wall. */
function leanLadder(
  p: Pieces,
  x: number,
  zWall: number,
  height: number,
  lean: number,
): void {
  const tilt = Math.atan2(lean, height);
  const length = Math.hypot(lean, height);

  for (const dx of [-0.2, 0.2]) {
    p.box(
      x + dx,
      0,
      zWall + lean / 2,
      0.04,
      length,
      0.07,
      TIMBER_NEW,
      0,
      0,
      -tilt,
    );
  }

  for (let k = 0; k < 9; k++) {
    const y = 0.3 + k * ((height - 0.5) / 8);
    const z = zWall + lean - (y / height) * lean;

    p.box(x, y, z, 0.4, 0.035, 0.05, TIMBER, 0);
  }
}

/** Reinforcement bars sprouting from the top of a column or the end of a wall. */
function rebarStubs(
  p: Pieces,
  random: () => number,
  cx: number,
  cz: number,
  y: number,
  w: number,
  d: number,
  height: number,
): void {
  const xs =
    w > 0.5 ? [-w / 2 + 0.1, 0, w / 2 - 0.1] : [-w / 2 + 0.06, w / 2 - 0.06];
  const zs =
    d > 0.5 ? [-d / 2 + 0.1, 0, d / 2 - 0.1] : [-d / 2 + 0.06, d / 2 - 0.06];

  for (const dx of xs) {
    for (const dz of zs) {
      if (dx === 0 && dz === 0) continue;

      const h = height * (0.75 + random() * 0.4);
      const lean = (random() - 0.5) * 0.14;

      p.bar(
        cx + dx,
        y + h / 2,
        cz + dz,
        h,
        0.022,
        random() < 0.3 ? REBAR_LIGHT : REBAR,
        0,
        Math.PI / 2 + lean,
        (random() - 0.5) * 0.1,
      );
    }
  }

  // Two ties: square wire loops round the bars, rusted.
  for (const t of [0.35, 0.65]) {
    const yy = y + height * t;

    for (const side of [-1, 1]) {
      p.box(cx, yy, cz + side * (d / 2 - 0.06), w - 0.1, 0.012, 0.012, REBAR);
    }

    for (const side of [-1, 1]) {
      p.box(cx + side * (w / 2 - 0.06), yy, cz, 0.012, 0.012, d - 0.1, REBAR);
    }
  }
}

/** Hides the drawn box of a solid (and its slices) but keeps it solid: a detailed prop is drawn over it. */
function hideDrawn(map: MapBuilder, id: string): void {
  for (const w of map.build().walls) {
    if (w.id === id || w.id.startsWith(`${id}~`)) {
      w.hidden = true;
    }
  }
}

/** A pallet of cement sacks under a blue tarp, strapped, one corner of the tarp torn back. */
function tarpedCement(p: Pieces, cx: number, cz: number): void {
  pallet(p, cx, cz, 1.0, 1.2, 0);

  for (let k = 0; k < 7; k++) {
    const y = 0.125 + k * 0.125;
    const flip = k % 2 === 1;

    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 3; j++) {
        const sx = flip ? 0.46 : 0.5;
        const sz = flip ? 0.36 : 0.4;

        p.box(
          cx - 0.25 + i * 0.5 + (flip ? 0.02 : 0),
          y,
          cz - 0.4 + j * 0.4,
          sx,
          0.118,
          sz,
          SACK[(i + j + k) % SACK.length],
          (k % 3) * 0.02,
        );
      }
    }
  }

  // The tarp: a sheet over the top and down two sides, creased, with a rope and a torn corner.
  p.box(cx, 1.0, cz, 1.04, 0.03, 1.24, 0x2f4a68);
  p.box(cx - 0.52, 0.5, cz, 0.03, 0.52, 1.24, 0x2f4a68, 0, 0.08);
  p.box(cx + 0.52, 0.55, cz + 0.1, 0.03, 0.42, 1.0, 0x2a4260, 0, -0.1);
  p.box(cx, 1.03, cz - 0.2, 1.0, 0.012, 0.03, 0x24384f);
  p.box(cx, 1.03, cz + 0.25, 1.0, 0.012, 0.03, 0x24384f);
  p.cable(cx - 0.52, 0.6, cz + 0.05, 1.3, 0.012, 0xc9c6b4, Math.PI / 2);
  p.box(cx - 0.3, 0.46, cz + 0.62, 0.3, 0.2, 0.02, SACK[1], 0.3);
}

/** A steel site tool vault with its lid ajar, a brick pack behind it: the cover on the north overlook. */
function toolVault(p: Pieces, cx: number, cz: number): void {
  // The vault: 1.2 m long, 0.8 m deep, 1.0 m high to the lid, on short legs.
  p.box(cx, 0.1, cz, 1.2, 0.84, 0.8, 0x3f5a4a);
  p.box(cx, 0.0, cz, 1.12, 0.1, 0.72, 0x2a2e34);
  p.box(cx, 0.1, cz + 0.405, 1.1, 0.7, 0.014, 0x364f42);

  for (const dx of [-0.45, 0, 0.45]) {
    p.box(cx + dx, 0.1, cz + 0.41, 0.04, 0.84, 0.02, 0x2a2e34);
  }

  // The lid, hinged at the back and propped open a hand's width.
  p.box(cx, 0.94, cz - 0.1, 1.24, 0.05, 0.8, 0x364f42, 0, 0, -0.12);
  p.box(cx, 0.86, cz - 0.36, 1.1, 0.04, 0.05, 0x2a2e34);
  // A hasp and a padlock, a stencilled plate, carry handles, tools in the gap.
  p.box(cx + 0.45, 0.62, cz + 0.42, 0.1, 0.18, 0.03, STEEL_BARE);
  p.box(cx + 0.45, 0.5, cz + 0.45, 0.06, 0.1, 0.04, 0x7a6a2e);
  p.box(cx - 0.2, 0.55, cz + 0.42, 0.36, 0.2, 0.01, 0x9a8836);
  p.box(cx - 0.2, 0.6, cz + 0.426, 0.26, 0.04, 0.006, BLACK);

  for (const dx of [-0.6, 0.6]) {
    p.box(cx + dx, 0.5, cz, 0.04, 0.05, 0.3, STEEL_BARE);
  }

  p.box(cx - 0.2, 0.9, cz + 0.2, 0.5, 0.06, 0.06, TIMBER, 0.2);
  p.box(cx + 0.2, 0.88, cz + 0.15, 0.3, 0.05, 0.12, STEEL_BARE, -0.3);

  // The back and the ends: corner bands, rivets, a worn plate, a dent.
  for (const dx of [-0.58, 0.58]) {
    p.box(cx + dx, 0.1, cz, 0.05, 0.86, 0.82, 0x2a2e34);
  }

  p.box(cx, 0.1, cz - 0.41, 1.14, 0.06, 0.014, 0x2a2e34);
  p.box(cx, 0.84, cz - 0.41, 1.14, 0.06, 0.014, 0x2a2e34);

  for (let k = 0; k < 9; k++) {
    p.chunk(cx - 0.5 + k * 0.125, 0.76, cz - 0.42, 0.03, STEEL_BARE);
  }

  p.box(cx + 0.3, 0.35, cz - 0.415, 0.3, 0.16, 0.008, 0x9a9486);
  p.box(cx - 0.25, 0.4, cz - 0.416, 0.2, 0.3, 0.006, 0x2c4a3a, 0, 0.1);

  // Behind it: a brick pack with a few missing, and the dust of it.
  p.box(cx, 0.0, cz + 0.58, 1.16, 0.08, 0.34, TIMBER_DARK);
  p.box(cx, 0.08, cz + 0.58, 1.12, 0.45, 0.32, BRICKS[0]);

  for (let y = 0.15; y < 0.52; y += 0.075) {
    p.box(cx, y, cz + 0.745, 1.12, 0.012, 0.008, BRICK_JOINT);
  }

  p.box(cx - 0.25, 0.53, cz + 0.58, 0.5, 0.07, 0.3, BRICKS[2]);
  p.box(cx + 0.55, 0.0, cz + 0.85, 0.22, 0.07, 0.11, BRICKS[3], 0.5);
}

/** Roof duct work: a galvanised rectangular duct with flanges, seams, dents and rust. */
function sheetDuct(
  p: Pieces,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  h: number,
): void {
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const len = x1 - x0;

  p.box(cx, 0.06, cz, len, h - 0.06, z1 - z0, 0x7e8794);
  p.box(cx, h - 0.03, cz, len, 0.04, z1 - z0 + 0.02, 0x9aa2ae);

  // Supports it stands on, flanges every 1.4 m and a standing seam along the side.
  for (let t = 0.4; t < len; t += 1.4) {
    p.box(x0 + t, 0, cz, 0.16, 0.06, z1 - z0 + 0.1, 0x353b46);
    p.box(x0 + t + 0.2, 0.06, cz, 0.04, h - 0.04, z1 - z0 + 0.06, 0x5f6772);
  }

  p.box(cx, 0.06 + (h - 0.06) * 0.5, z0 - 0.006, len, 0.014, 0.012, 0x5f6772);
  p.box(cx, 0.06 + (h - 0.06) * 0.5, z1 + 0.006, len, 0.014, 0.012, 0x5f6772);
  // Rust streaks where water runs off and a patched tear.
  p.box(x0 + len * 0.3, 0.06, z1 + 0.008, 0.2, h - 0.1, 0.006, 0x6a4a38);
  p.box(x0 + len * 0.7, 0.1, z0 - 0.008, 0.3, 0.18, 0.006, 0x6a4a38);
  p.box(x0 + len * 0.55, 0.12, z1 + 0.01, 0.3, 0.14, 0.006, 0x4f5f74, 0, 0.1);
}

/**
 * The tan graybox cover on the balconies and the duct and pipe boxes on the
 * roofs become what they would be on a site: a cable drum, a cement mixer, a
 * stack of blocks being used up, galvanised duct and lagged pipe. Their
 * collision is unchanged (their old boxes are only hidden).
 */
function restyleSiteProps(map: MapBuilder, floorY: number): void {
  const F = floorY;

  // The north overlook's cover: a tarped pallet of cement and a tool vault with bricks.
  hideDrawn(map, "cover-overlook-a");
  {
    const p = new Pieces();

    tarpedCement(p, -4.0, -9.7);
    map.createFitting("site-cement-pallet", F, p.elements, []);
  }

  hideDrawn(map, "cover-overlook-b");
  {
    const p = new Pieces();

    toolVault(p, 1.2, -10.0);
    map.createFitting("site-tool-vault", F, p.elements, []);
  }

  // The east corner balcony's cover: a stack of blocks half used.
  hideDrawn(map, "cover-corner-balcony");
  {
    const p = new Pieces();

    pallet(p, 13.5, 10.85, 1.2, 1.1, 0);

    for (let k = 0; k < 4; k++) {
      const full = k < 2;

      p.box(
        full ? 13.5 : 13.7,
        0.125 + k * 0.2,
        10.85,
        full ? 1.14 : 0.74,
        0.2,
        1.04,
        k % 2 ? BLOCK_DARK : BLOCK,
      );
    }

    p.box(13.1, 0.125 + 2 * 0.2, 10.85, 0.34, 0.2, 1.04, BLOCK);
    p.box(13.1, 0.125 + 3 * 0.2, 10.85, 0.34, 0.2, 0.5, BLOCK_DARK, 0.3);
    p.box(13.5, 0.125, 11.37, 1.14, 0.8, 0.012, 0x34383e);
    p.box(13.45, 0.125 + 0.82, 10.8, 0.3, 0.2, 0.4, BLOCK_DARK, 0.5);
    map.createFitting("site-blocks-balcony", F, p.elements, []);
  }

  // Roof ducts and the lagged pipe.
  for (const [id, x0, x1, z0, z1, base, h] of [
    ["duct-archive", -13.0, -2.0, -19.0, -18.4, 8.1, 0.4],
    ["duct-workshop", 7.0, 17.0, 17.8, 18.4, 10.8, 0.4],
  ] as const) {
    hideDrawn(map, id);

    const p = new Pieces();

    sheetDuct(p, x0, x1, z0, z1, h);
    map.createFitting(`site-${id}`, base, p.elements, []);
  }

  hideDrawn(map, "pipe-barracks");
  {
    const p = new Pieces();

    // A lagged pipe: a cylinder in grey insulation, banded, on cradles.
    p.bar(-26.5, 0.15, -9.0, 9.0, 0.3, 0x6a727e);

    for (let t = -30.6; t < -22.4; t += 0.9) {
      p.bar(t, 0.15, -9.0, 0.05, 0.32, 0x4f5f74);
    }

    for (const t of [-30.2, -27.0, -23.8]) {
      p.box(t, 0, -9.0, 0.12, 0.05, 0.34, 0x353b46);
    }

    map.createFitting("site-pipe-barracks", 8.1, p.elements, []);
  }
}

export function furnishConstructionSite(map: MapBuilder, floorY: number): void {
  const F = floorY;
  const random = rng(6271);

  // ====================================================== MATERIAL STORAGE
  // The loading dock (x 7 to 22, z -24 to -12).
  // (The cement sacks that stood in the dock's north-west corner are gone: the
  // Power Room's east wall now stands where they were.)

  {
    // Two packs of bricks, one half used, against the west face of the low ledge.
    const p = new Pieces();

    brickPack(p, random, 10.76, -21.2, 0.85, 1.25, 0.8, 0.0);
    brickPack(p, random, 11.58, -21.2, 0.85, 1.25, 0.55, 0.0);
    // Loose bricks fallen off the second pack, and a broken one.
    p.box(11.45, 0.125 + 0.55, -20.7, 0.22, 0.07, 0.11, BRICKS[3], 0.4);
    p.box(10.05, 0, -21.35, 0.22, 0.07, 0.11, BRICKS[1], 0.8);
    p.box(10.2, 0, -20.9, 0.11, 0.07, 0.11, BRICKS[4], 0.2);
    map.createFitting("site-bricks", F, p.elements, [
      { minX: 10.3, maxX: 12.0, minZ: -22.0, maxZ: -20.4, top: 1.0 },
    ]);
  }

  {
    // Concrete blocks, five layers, beside it.
    const p = new Pieces();

    blockStack(p, 11.15, -19.7, 1.7, 1.3, 5);
    // Broken blocks and a trowelled board of mortar at the foot.
    p.box(10.1, 0, -19.1, 0.4, 0.2, 0.2, BLOCK_DARK, 0.5);
    p.box(10.4, 0, -18.8, 0.2, 0.1, 0.2, BLOCK, 0.9);
    map.createFitting("site-blocks", F, p.elements, [
      { minX: 10.3, maxX: 12.0, minZ: -20.4, maxZ: -19.0, top: 1.15 },
    ]);
  }

  {
    // Formwork timber: a stack of boards touching the high ledge's north face.
    const p = new Pieces();

    timberStack(p, random, 15.0, -23.55, 2.4, 1.55, 6);
    // Two long boards leaning against the ledge, and offcuts on the floor.
    p.box(16.9, 0, -21.85, 0.2, 2.2, 0.04, TIMBER_NEW, 0, 0.0, 0.1);
    p.box(17.15, 0, -21.88, 0.2, 2.1, 0.04, TIMBER, 0, 0.0, 0.14);

    for (let k = 0; k < 5; k++) {
      p.box(
        14.4 + k * 0.25 + random() * 0.1,
        0,
        -22.4 + random() * 0.4,
        0.4 + random() * 0.3,
        0.04,
        0.12,
        TIMBER_B,
        random() * 3,
      );
    }

    map.createFitting("site-timber", F, p.elements, [
      { minX: 15.0, maxX: 17.4, minZ: -23.55, maxZ: -22.0, top: 0.65 },
    ]);
  }

  {
    // Reinforcement bars, orderly, on sleepers against the high ledge's east face.
    const p = new Pieces();

    rebarRack(p, random, 18.0, -22.0, 1.3, 3.0);
    map.createFitting("site-rebar", F, p.elements, [
      { minX: 18.0, maxX: 19.3, minZ: -22.0, maxZ: -19.0, top: 0.62 },
    ]);
  }

  {
    // What was left lying about: a barrow, pails, a shovel, offcuts, a stack of empty sacks.
    const p = new Pieces();

    wheelbarrow(p, 13.0, -18.3, 0.5, true);
    bucket(p, 13.9, -18.55, BUCKET_ORANGE);
    bucket(p, 14.25, -18.35, BUCKET_BLUE);
    bucket(p, 9.9, -18.4, BUCKET_GREY);
    p.bar(14.0, 0.28, -18.95, 1.2, 0.03, TIMBER_B, 0.5, 0.0, 0.0);
    p.box(14.55, 0.0, -19.4, 0.22, 0.02, 0.3, STEEL_BARE, 0.5);
    p.box(9.6, 0, -19.4, 0.5, 0.012, 0.35, 0xa8a69c, 0.3);
    p.chunk(12.7, 0, -18.7, 0.18, BLOCK_DARK, 3);
    p.chunk(11.5, 0, -18.85, 0.12, BRICKS[2], 4);
    map.createFitting("site-leftovers", F, p.elements, []);
  }

  // ========================================================== ACTIVE WORK
  // The west terrace (x -32 to -22, z -3 to 5).
  {
    const p = new Pieces();
    const frame = scaffold(p, -28.4, -24.8, -3.0, 0.7, 3.3);

    map.createFitting("site-scaffold", F, p.elements, [
      { minX: -28.4, maxX: -24.8, minZ: -3.0, maxZ: -2.3, top: 3.4, frame },
    ]);
  }

  {
    // A work ladder leaning on the barracks wall beside the scaffold, a
    // trestle with a mortar board, a bucket and trowel, a barrow, loose bricks.
    const p = new Pieces();

    leanLadder(p, -23.4, -3.0, 3.1, 1.0);

    for (const dx of [-0.45, 0.45]) {
      p.box(-26.8 + dx, 0, -0.2, 0.05, 0.7, 0.5, TIMBER_B);
    }

    p.box(-26.8, 0.7, -0.2, 1.1, 0.03, 0.6, TIMBER_NEW, 0.05);
    p.box(-26.8, 0.73, -0.2, 0.5, 0.05, 0.4, MORTAR, 0.1);
    p.box(-26.6, 0.78, -0.1, 0.2, 0.01, 0.1, STEEL_BARE, 0.5);
    bucket(p, -27.6, -0.4, BUCKET_BLUE);
    bucket(p, -26.2, 0.45, BUCKET_GREY);
    wheelbarrow(p, -25.4, 1.4, -0.4, false);

    for (let k = 0; k < 8; k++) {
      p.box(
        -26.4 + random() * 1.8,
        0,
        2.2 + random() * 1.0,
        0.22,
        0.07,
        0.11,
        BRICKS[k % BRICKS.length],
        random() * 3,
      );
    }

    // Mortar splashes on the floor, and a spirit level propped against the nook wall.
    p.box(-26.9, 0, 0.5, 0.5, 0.006, 0.4, MORTAR, 0.3);
    p.box(-27.0, 0.3, 3.9, 0.05, 0.9, 0.025, 0xb0a884, 0.0, 0.0, 0.0);

    // The stake and the caution tape across the open end of the scaffold bay.
    p.post(-24.55, 0, -0.9, 1.05, 0.04, TIMBER);

    for (let k = 0; k < 8; k++) {
      p.box(
        -24.55 - 0.05 * Math.sin(0.12) * k,
        0.95,
        -0.9 - k * 0.19,
        0.012,
        0.07,
        0.2,
        k % 2 ? TAPE_WHITE : TAPE_RED,
        0.1,
      );
    }

    // Solid for bodies as well as shots: the trestle, the two buckets, the
    // barrow, and the stake with its tape.
    map.createFitting("site-work-area", F, p.elements, [
      { minX: -27.4, maxX: -26.2, minZ: -0.5, maxZ: 0.1, top: 0.78 },
      { minX: -27.74, maxX: -27.46, minZ: -0.54, maxZ: -0.26, top: 0.36 },
      { minX: -26.34, maxX: -26.06, minZ: 0.31, maxZ: 0.59, top: 0.36 },
      { minX: -26.3, maxX: -24.7, minZ: 0.9, maxZ: 1.9, top: 0.55 },
      {
        minX: -24.8,
        maxX: -24.48,
        minZ: -2.4,
        maxZ: -0.85,
        top: 1.05,
        exact: true,
      },
    ]);
  }

  // ======================================================== RAW STRUCTURE
  {
    // Reinforcement left standing out of the four hall columns (their tops
    // are 7.2 m, the hall is open to the sky).
    const p = new Pieces();

    for (const [x, z] of [
      [-28, 16],
      [-23, 16],
      [-28, 20],
      [-23, 20],
    ]) {
      rebarStubs(p, random, x, z, 3.2, 0.8, 0.8, 1.0);
      // A little cement splash where the pour stopped.
      p.box(x, 3.2, z, 0.82, 0.01, 0.82, 0x6a6e73);
    }

    // The unfinished rooftop walls: bars out of the cut ends of each piece
    // (top 10.0 on the low roofs), a few on the Warehouse roof's parapet gaps.
    for (const [x, z, w, d] of [
      [-13.65, -16.15, 0.3, 0.3],
      [-8.95, -16.15, 0.3, 0.3],
      [-5.65, -16.15, 0.3, 0.3],
      [-1.35, -16.15, 0.3, 0.3],
      // (The ends of the unified room's west roof wall, moved with the Server room.)
      [22.15, -23.35, 0.3, 0.3],
      [22.15, -19.35, 0.3, 0.3],
      [22.15, 3.35, 0.3, 0.3],
      [22.15, 5.85, 0.3, 0.3],
      [22.15, 9.15, 0.3, 0.3],
      [22.15, 11.65, 0.3, 0.3],
      [-20.35, 5.35, 0.3, 0.3],
      [-20.35, 6.65, 0.3, 0.3],
      [-20.35, 9.75, 0.3, 0.3],
    ] as const) {
      rebarStubs(p, random, x, z, 6.0, w, d, 0.55);
    }

    map.createFitting("site-rebar-stubs", F, p.elements, []);
  }

  restyleSiteProps(map, F);

  // ========================================================= GROUND MARKS
  // Damp, dust and the tracks of the barrows, in the places they would form.
  // (All soft and few; none over a vent.)
  for (const [id, kind, x, z, y, w, d, rot, color, alpha] of [
    [
      "decal-site-dock-barrow-a",
      "wear",
      14.5,
      -16.2,
      F,
      7.0,
      0.14,
      0.04,
      0x1e2024,
      0.34,
    ],
    [
      "decal-site-dock-barrow-b",
      "wear",
      14.5,
      -15.85,
      F,
      7.0,
      0.14,
      0.05,
      0x1e2024,
      0.3,
    ],
    [
      "decal-site-dock-damp",
      "stain",
      12.4,
      -17.4,
      F,
      2.4,
      1.3,
      0.3,
      0x1a2230,
      0.42,
    ],
    [
      "decal-site-bricks-dust",
      "dust",
      11.2,
      -20.5,
      F,
      2.6,
      2.6,
      0.0,
      0x7a6a5a,
      0.3,
    ],
    [
      "decal-site-terrace-mortar",
      "stain",
      -26.6,
      0.1,
      F,
      1.6,
      1.2,
      0.3,
      0x77706a,
      0.4,
    ],
    [
      "decal-site-terrace-splash",
      "stain",
      -26.0,
      -1.6,
      F,
      2.6,
      1.0,
      0.1,
      0x9a9486,
      0.32,
    ],
    [
      "decal-site-terrace-damp",
      "stain",
      -29.8,
      -2.2,
      F,
      3.0,
      1.0,
      0.0,
      0x1a2230,
      0.36,
    ],
    [
      "decal-site-arena-puddle-a",
      "stain",
      -6.2,
      4.2,
      0,
      2.6,
      1.7,
      0.4,
      0x16202e,
      0.46,
    ],
    [
      "decal-site-arena-puddle-b",
      "stain",
      6.4,
      5.4,
      0,
      1.8,
      1.3,
      0.1,
      0x16202e,
      0.44,
    ],
    [
      "decal-site-arena-puddle-c",
      "stain",
      3.0,
      -4.6,
      0,
      1.4,
      1.0,
      0.7,
      0x16202e,
      0.4,
    ],
    [
      "decal-site-arena-tracks-a",
      "wear",
      -1.0,
      6.4,
      0,
      10.0,
      0.16,
      0.12,
      0x1a1c20,
      0.34,
    ],
    [
      "decal-site-arena-tracks-b",
      "wear",
      -1.0,
      6.9,
      0,
      10.0,
      0.16,
      0.1,
      0x1a1c20,
      0.3,
    ],
  ] as const) {
    map.addDecal({
      id,
      kind,
      x,
      z,
      y,
      width: w,
      depth: d,
      rotation: rot,
      color,
      alpha,
    });
  }
}
