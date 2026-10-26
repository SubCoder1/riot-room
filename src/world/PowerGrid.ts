import { ROOF_HIGH } from "./ArenaLayout";
import { Pieces } from "./FittingPieces";
import { POWER_BULB } from "./JunkRoom";
import type { MapBuilder } from "./MapParts";
import { extinguisher, warningSign } from "./RoomKit";
import { drum } from "./StorageRoom";

/**
 * The map's exterior power and work lights: a temporary site installation.
 *
 *   - Four floodlight masts (steel masts braced to the walls, twin-head or
 *     single, two with a service platform) and three wall work lamps (a caged
 *     lamp on a bracket at the end of a conduit), each light a restrained
 *     amber or neutral white.
 *   - Every light has its own lead from a junction box at its foot, run
 *     straight along the foot of the wall, clipped every metre or so, with a
 *     rubber ramp wherever it crosses a doorway or a ladder's foot, to a
 *     distribution board (north walkway, outside the power room's south door)
 *     or straight to the generator.
 *   - The power room's petrol generator (Switch room, against the east wall)
 *     feeds the north walkway and the dock through two output sockets. A
 *     smaller one on the Storage room's roof feeds the south walkway: its
 *     cable crosses the roof and goes down the wall in a steel conduit. A
 *     third, a service area on the east deck, feeds its own work lamp.
 *   - Each fuelled generator has a filler cap (a fuel point in the layout).
 *
 * Drawn only, except the generators, masts and service platforms. Each head
 * has one spotlight aimed at the walkway; the two main supports cast shadows.
 */

const CHARCOAL = 0x353b46;
const GUNMETAL = 0x2c333d;
const BLACK = 0x14161a;
const STEEL_BARE = 0x8791a0;
const LENS = 0xd9e1e8;
const GAUGE = 0x9fb0a8;
/** Weathered dark steel for the masts, brackets and lamp housings. */
const MAST = 0x383e46;
const MAST_WORN = 0x464d56;
/** A fixture head's steel, lighter than the masts so it shows in the dark. */
const HEAD_BODY = 0x59626e;
const HEAD_RIM = 0x7a8592;
const GRIME = 0x2b3036;
const RUST = 0x5a4a3c;
/** Generator: dark weathered body, faded tank, a little faded orange. */
const BODY = 0x3b4148;
const BODY_DARK = 0x2a3036;
const TANK = 0x6b3d30;
const FADED_ORANGE = 0x9a6a2a;
const LABEL = 0xc9c6b4;
/** Faded safety yellow, for small markings only. */
const FADED_YELLOW = 0x9a8836;
const EXTINGUISHER = 0x70281f;
const CABINET = 0x383e46;
/** Insulated supply cable: muted weathered red, a little different along it. */
const CABLES = [0x68261f, 0x5b221c, 0x722b23, 0x4f1e19];
/**
 * The outdoor site wiring: black rubber trunk and extension leads, with one
 * faded orange extension. A tone of 10 or more picks from these, so the power
 * room's own red cables are left as they were.
 */
const SITE_CABLES = [0x23262b, 0x2a2d33, 0x1b1d21, 0x8a5a1e];

function cableColor(tone: number): number {
  return tone >= 10
    ? SITE_CABLES[(tone - 10) % SITE_CABLES.length]
    : CABLES[tone % CABLES.length];
}

type XZ = readonly [number, number];

// --------------------------------------------------------------- helpers
/** A small repeatable generator so the mess is the same every run. */
function lcg(seed: number): () => number {
  let a = seed >>> 0;

  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;

    return a / 4294967296;
  };
}

/** A cable segment lying on the floor between two plan points. */
function lay(
  p: Pieces,
  a: XZ,
  b: XZ,
  y: number,
  d: number,
  tone: number,
): void {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);

  if (length < 0.01) {
    return;
  }

  p.cable(
    (a[0] + b[0]) / 2,
    y,
    (a[1] + b[1]) / 2,
    length + d * 0.9,
    d,
    cableColor(tone),
    Math.atan2(-(b[1] - a[1]), b[0] - a[0]),
  );
}

/**
 * A cable on the floor through the given plan points as one smooth curve (a
 * Catmull-Rom spline cut into short straight pieces), lying on the floor: its
 * height is half its thickness, unless `y` is a real height (a roof, say).
 */
function run(p: Pieces, points: XZ[], d = 0.045, y = 0, tone = 0): void {
  const base = y > 0.3 ? y : d / 2 + 0.004;
  const pts: XZ[] = [points[0], ...points, points[points.length - 1]];
  const out: XZ[] = [points[0]];

  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    const span = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(span / 0.13));

    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const at = (a: number, b: number, c: number, e: number): number =>
        0.5 *
        (2 * b +
          (-a + c) * t +
          (2 * a - 5 * b + 4 * c - e) * t2 +
          (-a + 3 * b - 3 * c + e) * t3);

      out.push([
        at(p0[0], p1[0], p2[0], p3[0]),
        at(p0[1], p1[1], p2[1], p3[1]),
      ]);
    }
  }

  for (let i = 1; i < out.length; i++) {
    lay(p, out[i - 1], out[i], base, d, tone + Math.floor(i / 6));
  }
}

/**
 * A loop of spare cable gathered on the floor, still part of the run: it
 * starts on the run at (ax, az), winds one and a half uneven, slightly oval
 * turns on the side `dir` (an angle), and is tied. The end of the spiral
 * lies on top of the first turn.
 */
function coil(
  p: Pieces,
  ax: number,
  az: number,
  dir: number,
  r = 0.26,
  d = 0.042,
): void {
  const wob = lcg(Math.floor(ax * 31 + az * 17) + 7);
  const squash = 0.72 + wob() * 0.2;
  const cx = ax + Math.cos(dir) * r;
  const cz = az + Math.sin(dir) * r * squash;
  const pts: XZ[] = [];
  const steps = 18;

  for (let i = 0; i <= steps; i++) {
    // Start at the anchor (opposite the centre from `dir`) and wind round.
    const a = dir + Math.PI + (i / steps) * Math.PI * 3;
    const rad = r * (1.0 - 0.3 * (i / steps)) * (0.92 + wob() * 0.16);

    pts.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad * squash]);
  }

  // The start sits exactly on the run.
  pts[0] = [ax, az];

  for (let i = 1; i < pts.length; i++) {
    // The first turn lies on the floor, the rest on top of it.
    const y = i <= steps * 0.66 ? d / 2 + 0.004 : d * 1.5;

    lay(p, pts[i - 1], pts[i], y, d, i);
  }

  p.box(cx + r * 0.75, d * 0.2, cz, 0.04, d * 2.2, 0.06, GRIME);
}

/**
 * A cable's plug into a generator socket: from the floor run's end (0.22 m
 * out from the socket, along `out`, a unit step away from the generator) the
 * cable rises, bends and runs level straight into the socket's face, ending in
 * a dark plug body that touches it.
 */
function plug(
  p: Pieces,
  socket: { x: number; z: number },
  out: XZ,
  d: number,
  tone: number,
  baseY = 0,
): void {
  const y = baseY + 0.135;
  const ox = socket.x + out[0] * 0.22;
  const oz = socket.z + out[1] * 0.22;
  const fx = socket.x + out[0] * 0.04;
  const fz = socket.z + out[1] * 0.04;
  const color = cableColor(tone);

  // Up from the floor run, a rounded corner, then level into the socket.
  p.cableUp(ox, baseY + d / 2, oz, y - baseY - d / 2, d, color);
  p.chunk(ox, y - 0.03, oz, d * 1.2, color);
  p.cable(
    (ox + fx) / 2,
    y,
    (oz + fz) / 2,
    Math.hypot(fx - ox, fz - oz),
    d,
    color,
    Math.atan2(-(fz - oz), fx - ox),
  );

  // The plug body on its end, against the socket.
  const px = socket.x + out[0] * 0.075;
  const pz = socket.z + out[1] * 0.075;

  p.box(
    px,
    y - 0.045,
    pz,
    Math.abs(out[0]) * 0.07 + 0.09,
    0.09,
    Math.abs(out[1]) * 0.07 + 0.09,
    BLACK,
  );
}

/** A worn rubber cable protector across a run at (x, z), `ry` along the run. */
function ramp(p: Pieces, x: number, z: number, ry: number): void {
  p.box(x, 0, z, 0.62, 0.08, 0.34, BLACK, ry);
  p.box(x, 0.08, z, 0.42, 0.02, 0.22, GRIME, ry);
}

/**
 * Cable clips along a run that hugs a wall: a small steel strap over the cable
 * every `gap` metres, so it reads as fixed, not dropped.
 */
function clips(p: Pieces, points: XZ[], gap = 0.9, d = 0.045): void {
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ry = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);

    for (let t = gap / 2; t < length; t += gap) {
      const u = t / length;

      p.box(
        a[0] + (b[0] - a[0]) * u,
        0,
        a[1] + (b[1] - a[1]) * u,
        0.03,
        d + 0.012,
        d + 0.05,
        STEEL_BARE,
        ry,
      );
    }
  }
}

/** A cable reel standing on its edge: two flanges, a core, wound cable and a handle. */
function reel(p: Pieces, x: number, z: number, ry: number, tone: number): void {
  const color = cableColor(tone);
  const cx = Math.cos(ry);
  const sx = Math.sin(ry);
  const at = (a: number, b: number): XZ => [
    x + a * cx + b * sx,
    z - a * sx + b * cx,
  ];

  for (const side of [-1, 1]) {
    const [fx, fz] = at(0, side * 0.17);

    p.bar(fx, 0.27, fz, 0.03, 0.54, MAST_WORN, ry + Math.PI / 2, 0, 0);
  }

  p.bar(x, 0.27, z, 0.34, 0.2, color, ry + Math.PI / 2, 0, 0);
  p.bar(x, 0.27, z, 0.3, 0.44, color, ry + Math.PI / 2, 0, 0);
  p.bar(x, 0.27, z, 0.4, 0.07, STEEL_BARE, ry + Math.PI / 2, 0, 0);

  // A short tail off the reel, and a steel frame handle across the top.
  const [tx, tz] = at(0.3, 0.1);

  lay(p, [x + 0.0, z], [tx, tz], 0.03, 0.03, tone);
  p.box(x, 0.52, z, 0.04, 0.05, 0.4, MAST, ry + Math.PI / 2);
}

/**
 * A temporary distribution board on a short steel stand, its back to the wall
 * (the front looks +z): a louvred door with a hasp and a padlock, a hazard
 * plate, and three cables entering from below through glands.
 */
function distributionBoard(p: Pieces, x: number, z: number): void {
  for (const dx of [-0.32, 0.32]) {
    p.box(x + dx, 0, z, 0.05, 0.42, 0.05, MAST_WORN);
  }

  p.box(x, 0.18, z, 0.7, 0.04, 0.05, MAST_WORN);
  p.box(x, 0.4, z, 0.8, 0.9, 0.28, MAST);
  p.box(x, 0.43, z + 0.145, 0.7, 0.82, 0.02, BODY_DARK);
  p.box(x, 1.3, z, 0.86, 0.04, 0.34, GUNMETAL);

  for (let i = 0; i < 6; i++) {
    p.box(x - 0.16, 0.95 + i * 0.05, z + 0.158, 0.26, 0.012, 0.008, BLACK);
  }

  p.box(x + 0.22, 0.7, z + 0.158, 0.12, 0.2, 0.012, LABEL);
  p.box(x + 0.22, 0.8, z + 0.165, 0.08, 0.03, 0.006, FADED_YELLOW);
  p.box(x + 0.3, 0.83, z + 0.16, 0.04, 0.12, 0.03, STEEL_BARE);
  p.box(x + 0.3, 0.7, z + 0.17, 0.05, 0.07, 0.04, FADED_ORANGE);
  p.chunk(x - 0.3, 1.25, z + 0.16, 0.03, STEEL_BARE);
  p.chunk(x + 0.3, 1.25, z + 0.16, 0.03, STEEL_BARE);

  for (const dx of [-0.22, 0, 0.22]) {
    p.cableUp(
      x + dx,
      0,
      z + 0.04,
      0.42,
      0.04,
      SITE_CABLES[Math.abs(dx) < 0.1 ? 2 : 1],
    );
  }
}

/** A weathered jerrycan standing on the floor, turned by `ry`. */
function jerrycan(p: Pieces, x: number, z: number, ry: number): void {
  p.box(x, 0, z, 0.34, 0.46, 0.16, 0x7a3a2e, ry);
  p.box(x, 0.46, z, 0.34, 0.03, 0.16, BODY_DARK, ry);
  p.box(
    x - Math.cos(ry) * 0.1,
    0.49,
    z + Math.sin(ry) * 0.1,
    0.14,
    0.05,
    0.06,
    BODY_DARK,
    ry,
  );
  p.post(
    x + Math.cos(ry) * 0.1,
    0.49,
    z - Math.sin(ry) * 0.1,
    0.07,
    0.045,
    STEEL_BARE,
  );
  p.box(x, 0.22, z, 0.34, 0.012, 0.162, BODY_DARK, ry);
}

/** A junction box on the floor, patched and bolted. */
function junction(p: Pieces, x: number, z: number, big = false): void {
  const w = big ? 0.5 : 0.26;
  const d = big ? 0.34 : 0.2;
  const h = big ? 0.3 : 0.2;

  p.box(x, 0, z, w, h, d, CHARCOAL);
  p.box(x, h, z, w + 0.03, 0.025, d + 0.03, GUNMETAL);
  p.chunk(x - w * 0.35, h + 0.025, z, 0.035, STEEL_BARE);
  p.chunk(x + w * 0.35, h + 0.025, z, 0.035, STEEL_BARE);
  p.box(x + w * 0.2, h * 0.3, z + d / 2, 0.08, 0.06, 0.012, FADED_ORANGE);
}

// -------------------------------------------------------------- supports
interface Support {
  id: string;
  /** The point on the wall face the mast stands against. */
  x: number;
  z: number;
  /** The unit step from the wall out onto the walkway. */
  nx: number;
  nz: number;
  /** Mast height over the floor. */
  height: number;
  /** "twin": a crossbar with two heads; "single": one head on an arm. */
  kind: "twin" | "single";
  /** How far the heads are tilted down, in radians. */
  tilt: number;
  /** A protective cage over the lens. */
  cage: boolean;
  /** Which side the service platform is on (+1/-1), or 0. */
  platform: number;
  /** Casts a shadow. */
  shadow?: boolean;
  /** Aim the heads at this world point instead of straight out and down. */
  aim?: readonly [number, number, number];
  /** "wall": a work lamp on a bracket at the end of a conduit, not a mast. */
  style?: "mast" | "wall";
  /** The colour of its light (a restrained amber or neutral white). */
  color?: number;
  /** Its light's strength, if not the usual for its kind. */
  power?: number;
}

const SUPPORTS: Support[] = [
  {
    id: "support-north-1",
    x: -12.4,
    z: -16,
    nx: 0,
    nz: 1,
    height: 3.3,
    kind: "single",
    tilt: 0.55,
    cage: true,
    platform: 0,
    style: "wall",
    color: 0xffd9a0,
  },
  {
    id: "support-north-2",
    x: -3.5,
    z: -16,
    nx: 0,
    nz: 1,
    height: 5.1,
    kind: "twin",
    tilt: 0.36,
    cage: false,
    platform: -1,
    shadow: true,
    color: 0xffe3b8,
  },
  {
    id: "support-dock-1",
    x: 14.2,
    z: -24,
    nx: 0,
    nz: 1,
    height: 5.9,
    kind: "single",
    tilt: 0.44,
    cage: true,
    platform: 0,
    shadow: true,
    color: 0xffe3b8,
    // One head carries the dock now: a little stronger than either twin was.
    power: 90,
  },
  {
    id: "support-south-1",
    x: -4.3,
    z: 15,
    nx: 0,
    nz: -1,
    height: 3.3,
    kind: "single",
    tilt: 0.5,
    cage: true,
    platform: 0,
    style: "wall",
    color: 0xffd9a0,
  },
  {
    id: "support-south-2",
    x: 14.5,
    z: 15,
    nx: 0,
    nz: -1,
    height: 4.9,
    kind: "twin",
    tilt: 0.32,
    cage: true,
    platform: 1,
    color: 0xffe3b8,
  },
];

/** A world position from a support's frame: `u` out from the wall, `v` along it. */
function at(s: Support, u: number, v = 0): XZ {
  return [s.x + s.nx * u - s.nz * v, s.z + s.nz * u + s.nx * v];
}

/** A box in a support's frame, bottom on `bottom`, optionally tilted down. */
function box(
  p: Pieces,
  s: Support,
  u: number,
  v: number,
  bottom: number,
  su: number,
  sv: number,
  height: number,
  color: number,
  tilt = 0,
): void {
  const [x, z] = at(s, u, v);
  const wx = Math.abs(s.nx) * su + Math.abs(s.nz) * sv;
  const wz = Math.abs(s.nz) * su + Math.abs(s.nx) * sv;

  // Tilting turns the lens toward the walkway: about x for a wall on a z
  // line, about z for a wall on an x line.
  p.box(x, bottom, z, wx, height, wz, color, 0, s.nx * tilt, -s.nz * tilt);
}

/** The junction box position at a support's foot, beside the base plate. */
function foot(s: Support): XZ {
  return at(s, 0.18, s.platform > 0 ? -0.42 : 0.42);
}

/** Where a head's lens is: out from the wall, along the wall, and how high. */
interface Head {
  u: number;
  v: number;
  y: number;
}

function buildSupport(map: MapBuilder, F: number, s: Support): void {
  const p = new Pieces();
  const H = s.height;
  const top = H + 0.04;
  const wall = s.style === "wall";
  const [mx, mz] = at(s, wall ? 0.09 : 0.21);

  if (wall) {
    // A work lamp on the wall: a conduit up the wall from the foot box, a
    // wall plate and a short bracket, bolted at the wall and at the lamp.
    box(p, s, 0.05, 0, 0.04, 0.1, 0.1, H - 0.1, MAST_WORN);

    for (const y of [0.6, 1.5, 2.4]) {
      box(p, s, 0.07, 0, y, 0.14, 0.12, 0.05, GRIME);
    }

    box(p, s, 0.03, 0, H - 0.45, 0.04, 0.34, 0.56, MAST);

    for (const y of [H - 0.4, H - 0.0]) {
      const [bx, bz] = at(s, 0.055, 0.12);

      p.chunk(bx, y - 0.02, bz, 0.035, STEEL_BARE);
    }
  } else {
    // Base plate with four bolts, the box-section mast, a collar low down, a
    // patched weld, and plate brackets back to the wall.
    box(p, s, 0.21, 0, 0, 0.42, 0.42, 0.04, MAST_WORN);

    for (const du of [0.05, 0.37]) {
      for (const dv of [-0.15, 0.15]) {
        const [bx, bz] = at(s, du, dv);

        p.chunk(bx, 0.04, bz, 0.04, STEEL_BARE);
      }
    }

    box(p, s, 0.21, 0, 0.04, 0.17, 0.17, H, MAST);
    box(p, s, 0.21, 0, 0.55, 0.22, 0.22, 0.1, MAST_WORN);
    box(p, s, 0.21, 0, 1.9, 0.2, 0.2, 0.18, GRIME);
    box(p, s, 0.21, 0, 0.04, 0.19, 0.19, 0.12, RUST);

    for (const y of [1.5, H - 0.8]) {
      box(p, s, 0.08, 0, y, 0.16, 0.14, 0.22, MAST_WORN);
    }
  }

  // A head: heavy angular housing with a recessed lens, a protective rim, an
  // optional cage, a visor, a yoke and an adjustable arm (with a pivot bolt).
  const heads: Head[] = [];
  // Hidden solids for what hangs up there (heads, crossbar, arm): shots,
  // grenades and sight lines stop on them. They are high over any head.
  const hanging: Array<{
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    bottom: number;
    top: number;
  }> = [];
  const hang = (
    u: number,
    v: number,
    su: number,
    sv: number,
    bottom: number,
    topY: number,
  ): void => {
    const [x, z] = at(s, u, v);
    const wx = Math.abs(s.nx) * su + Math.abs(s.nz) * sv;
    const wz = Math.abs(s.nz) * su + Math.abs(s.nx) * sv;

    hanging.push({
      minX: x - wx / 2,
      maxX: x + wx / 2,
      minZ: z - wz / 2,
      maxZ: z + wz / 2,
      bottom,
      top: topY,
    });
  };
  const head = (v: number, u: number, y: number): void => {
    const t = s.tilt;
    // A part's centre relative to the head centre, turned with the head.
    const part = (
      du: number,
      dy: number,
      su: number,
      sv: number,
      sh: number,
      color: number,
    ): void => {
      const cu = u + du * Math.cos(t) - dy * Math.sin(t);
      const cy = y + du * Math.sin(t) + dy * Math.cos(t);

      box(p, s, cu, v, cy - sh / 2, su, sv, sh, color, t);
    };

    // (Weathered steel a shade lighter than the masts, so a head reads as a
    // fixture against the dark wall and not as a lens hanging in the air.)
    part(0, 0, 0.3, 0.48, 0.22, HEAD_BODY); // the housing
    part(0, 0, 0.34, 0.52, 0.06, GRIME); // its dirty mid band
    part(0, -0.13, 0.36, 0.52, 0.04, HEAD_RIM); // the front rim
    part(0, -0.115, 0.26, 0.4, 0.015, LENS); // the recessed lens
    part(-0.02, 0.14, 0.4, 0.54, 0.035, HEAD_BODY); // the visor
    part(0, 0, 0.1, 0.56, 0.3, HEAD_RIM); // the yoke's side plates

    if (s.cage) {
      for (let i = 0; i < 5; i++) {
        part(-0.1 + i * 0.05, -0.145, 0.012, 0.44, 0.012, BLACK);
      }
    }

    // Arm from the mast to the head, and a pivot bolt on the yoke.
    box(
      p,
      s,
      0.21 + (u - 0.21) / 2,
      v,
      y + 0.16,
      u - 0.21,
      0.07,
      0.08,
      HEAD_BODY,
    );

    const [bx, bz] = at(s, u, v + 0.3);

    p.chunk(bx, y + 0.12, bz, 0.04, STEEL_BARE);
    heads.push({ u: u + 0.15 * Math.sin(t), v, y: y - 0.15 });
    // The housing, its visor and yoke: one solid over the whole head.
    hang(u, v, 0.5, 0.58, y - 0.24, y + 0.2);
  };

  if (wall) {
    // One caged lamp on a short arm, level with the bracket.
    box(p, s, 0.3, 0, top - 0.5, 0.5, 0.08, 0.07, MAST);
    hang(0.4, 0, 0.5, 0.1, top - 0.5, top - 0.4);
    head(0, 0.62, top - 0.35);
  } else if (s.kind === "twin") {
    // Twin heads at different heights on a crossbar, as if re-aimed over time.
    box(p, s, 0.3, 0, top - 0.2, 0.14, 1.7, 0.1, MAST);
    box(p, s, 0.3, 0, top - 0.6, 0.06, 0.06, 0.4, MAST_WORN);
    hang(0.3, 0, 0.14, 1.7, top - 0.2, top - 0.1);
    head(-0.62, 0.62, top - 0.4);
    head(0.62, 0.55, top - 0.5);
  } else {
    box(p, s, 0.4, 0, top - 0.2, 0.46, 0.1, 0.1, MAST);
    box(p, s, 0.31, 0, top - 0.55, 0.06, 0.08, 0.36, MAST_WORN);
    hang(0.4, 0, 0.46, 0.1, top - 0.2, top - 0.1);
    head(0, 0.78, top - 0.4);
  }

  // The foot junction box: this support's own cable's end.
  const [jx, jz] = foot(s);

  junction(p, jx, jz);

  // The exposed vertical run from the junction box up the mast's front,
  // clamped, to the lamp, then off along the arm and a short droop into the
  // housing's back.
  const [vx, vz] = at(s, 0.31, 0);
  const rise = top - 0.7;

  const last = heads[heads.length - 1];

  if (wall) {
    // The feed goes up inside the conduit; only a short flexible droop from
    // the bracket into the lamp's back shows.
    const [hx, hz] = at(s, last.u - 0.15, last.v);

    p.cableUp(hx, top - 0.82, hz, 0.34, 0.036, SITE_CABLES[0]);
    lay(
      p,
      [jx, jz],
      at(s, 0.12, s.platform > 0 ? -0.42 : 0.42),
      0.1,
      0.036,
      10,
    );
  } else {
    lay(p, [jx, jz], [vx, vz], 0.24, 0.042, 1);
    p.cableUp(vx, 0.22, vz, rise - 0.2, 0.042, SITE_CABLES[0]);

    for (const y of [0.9, 2.0, 3.2]) {
      if (y < rise - 0.2) {
        p.box(vx, y, vz, 0.13, 0.05, 0.13, GRIME);
      }
    }

    const [hx, hz] = at(s, last.u - 0.15, last.v);

    lay(p, [vx, vz], [hx, hz], rise + 0.14, 0.042, 12);
    p.cableUp(hx, rise - 0.04, hz, 0.18, 0.042, SITE_CABLES[2]);
  }

  const half = wall ? 0.09 : 0.21;

  map.createFitting(s.id, F, p.elements, [
    { minX: mx - half, maxX: mx + half, minZ: mz - half, maxZ: mz + half, top },
    ...hanging,
  ]);

  // Each head's light: a cone aimed at the walkway in front of it, tight
  // enough for a focused pool, with the cold harsh white of old halogen.
  heads.forEach((h, index) => {
    const [lx, lz] = at(s, h.u, h.v);
    const [ax, tz0] = at(s, h.u + 1.1 + s.tilt * 3, h.v * 0.5);
    const tx = s.aim ? s.aim[0] : ax;
    const tz = s.aim ? s.aim[2] : tz0;

    map.addLight({
      id: `light-${s.id}${heads.length > 1 ? `-${index + 1}` : ""}`,
      x: lx,
      y: F + h.y,
      z: lz,
      color: s.color ?? 0xeaf0f7,
      intensity: s.power ?? (wall ? 45 : heads.length > 1 ? 60 : 75),
      distance: wall ? 12 : 15,
      target: { x: tx, y: s.aim ? s.aim[1] : F + 0.2, z: tz },
      angle: 0.72,
      castShadow: s.shadow === true && index === 0,
    });
  });
}

/** A service platform beside a mast: 1.2 x 0.9 m, 1.2 m up, grated top. */
function buildPlatform(map: MapBuilder, F: number, s: Support): void {
  const p = new Pieces();
  const v0 = s.platform > 0 ? 0.21 : -0.21 - 1.2;
  const centre = v0 + 0.6;
  const top = 1.2;

  // The deck: a frame, grating bars across it and a toe-plate along its edge.
  box(p, s, 0.45, centre, top - 0.06, 0.9, 1.2, 0.06, MAST);

  for (let i = 0; i < 6; i++) {
    box(p, s, 0.45, v0 + 0.1 + i * 0.2, top, 0.86, 0.05, 0.02, MAST_WORN);
  }

  box(p, s, 0.88, centre, top, 0.03, 1.2, 0.1, MAST_WORN);

  // Two legs at the outer corners, and a bracket back to the wall.
  for (const v of [v0 + 0.1, v0 + 1.1]) {
    box(p, s, 0.8, v, 0, 0.08, 0.08, top - 0.06, MAST);
    box(p, s, 0.1, v, top - 0.4, 0.2, 0.06, 0.06, MAST_WORN);
  }

  const [cx, cz] = at(s, 0.45, centre);
  const wx = Math.abs(s.nx) * 0.9 + Math.abs(s.nz) * 1.2;
  const wz = Math.abs(s.nz) * 0.9 + Math.abs(s.nx) * 1.2;

  map.createFitting(`${s.id}-platform`, F, p.elements, [
    {
      minX: cx - wx / 2,
      maxX: cx + wx / 2,
      minZ: cz - wz / 2,
      maxZ: cz + wz / 2,
      top,
    },
  ]);
}

/**
 * How far the east deck's service area (and the work lamp over it) moved north
 * with the wall it stands against: the Server room's south wall (z -5) is now
 * the unified spawn room's (z -10).
 */
export const DECK_SHIFT = -5;

/** The two generators that run a lighting circuit. */
const CIRCUIT_BODIES: ReadonlySet<string> = new Set([
  "fittings-generator",
  "fittings-generator-roof",
]);

// ------------------------------------------------------------- generator
interface GeneratorSpec {
  id: string;
  baseY: number;
  /** "z": front toward +z, back at `back`, length from `from` along x.
   *  "x": front toward -x, back at `back`, length from `from` along z. */
  facing: "z" | "x";
  back: number;
  from: number;
  length: number;
  depth: number;
}

interface GeneratorParts {
  /** The filler cap in world coordinates. */
  cap: { x: number; y: number; z: number };
  /** The output sockets, in world plan coordinates. */
  sockets: Array<{ x: number; z: number }>;
  /** In front of the control panel (world plan). */
  panel: { x: number; z: number };
  /** The red indicator lamp's place (world). */
  indicator: { x: number; y: number; z: number };
  /** The top of the muffler outlet (world): the smoke comes out here. */
  exhaust: { x: number; y: number; z: number };
}

/**
 * A compact petrol generator: tubular steel skid on rubber feet, an engine
 * and alternator in a dented guard, a faded fuel tank with a filler neck, a
 * cap and a fuel gauge, a recoil starter, a muffler with a heat shield, a
 * control panel with switches, lamps and a meter, cooling louvres, a hinged
 * access panel, output sockets and faded labels. One hidden collision box.
 */
function buildGenerator(map: MapBuilder, g: GeneratorSpec): GeneratorParts {
  const p = new Pieces();
  const { length: L, depth: D } = g;
  // Local (a along the length, b out from the back) to world.
  const wx = (a: number, b: number): number =>
    g.facing === "z" ? g.from + a : g.back - b;
  const wz = (a: number, b: number): number =>
    g.facing === "z" ? g.back + b : g.from + a;
  const bx = (
    a: number,
    b: number,
    y: number,
    sa: number,
    sb: number,
    sh: number,
    color: number,
  ): void => {
    p.box(
      wx(a, b),
      y,
      wz(a, b),
      g.facing === "z" ? sa : sb,
      sh,
      g.facing === "z" ? sb : sa,
      color,
    );
  };
  const pillar = (
    a: number,
    b: number,
    y: number,
    h: number,
    d: number,
    color: number,
  ): void => {
    p.post(wx(a, b), y, wz(a, b), h, d, color);
  };
  const along = (
    a: number,
    b: number,
    y: number,
    len: number,
    d: number,
    color: number,
  ): void => {
    p.bar(
      wx(a, b),
      y,
      wz(a, b),
      len,
      d,
      color,
      g.facing === "z" ? 0 : Math.PI / 2,
    );
  };
  const front = D;

  // Skid: two long rails, three cross bars, rubber feet.
  for (const b of [0.08, D - 0.08]) {
    bx(L / 2, b, 0.04, L, 0.06, 0.07, MAST);
  }

  for (const a of [0.1, L / 2, L - 0.1]) {
    bx(a, D / 2, 0.04, 0.06, D - 0.1, 0.06, MAST);
  }

  for (const a of [0.12, L - 0.12]) {
    for (const b of [0.1, D - 0.1]) {
      bx(a, b, 0, 0.1, 0.1, 0.05, BLACK);
    }
  }

  // Engine guard (left) and alternator (right), with a step between.
  const split = L * 0.6;

  bx(split / 2, D / 2, 0.11, split - 0.04, D - 0.16, 0.52, BODY);
  bx(split / 2, D / 2, 0.63, split - 0.08, D - 0.2, 0.05, BODY_DARK);
  bx(
    split + (L - split) / 2,
    D / 2,
    0.11,
    L - split - 0.04,
    D - 0.2,
    0.46,
    BODY_DARK,
  );

  // Louvres on the engine guard's front, and cooling slots on the alternator.
  for (let i = 0; i < 5; i++) {
    bx(
      split * 0.45,
      front - 0.06,
      0.2 + i * 0.07,
      split * 0.5,
      0.025,
      0.035,
      BLACK,
    );
  }

  for (let i = 0; i < 4; i++) {
    bx(
      split + (L - split) * 0.5,
      front - 0.08,
      0.16 + i * 0.06,
      (L - split) * 0.55,
      0.02,
      0.03,
      BLACK,
    );
  }

  // The hinged access panel on the engine guard's back, with bolts and a
  // faded orange warning plate.
  bx(split * 0.4, 0.08, 0.2, split * 0.45, 0.025, 0.3, GRIME);
  bx(split * 0.4, 0.075, 0.38, split * 0.2, 0.02, 0.06, FADED_ORANGE);

  for (const dy of [0.22, 0.42]) {
    for (const da of [-0.18, 0.18]) {
      p.chunk(
        wx(split * 0.4 + da, 0.07),
        dy,
        wz(split * 0.4 + da, 0.07),
        0.03,
        STEEL_BARE,
      );
    }
  }

  // The fuel tank on top of the engine: a faded saddle tank, straps, filler
  // neck, cap with a faded ring, and a small fuel gauge.
  const tankLen = split - 0.2;
  const tankA = split / 2;

  bx(tankA, D / 2, 0.68, tankLen, D - 0.28, 0.26, TANK);
  bx(tankA, D / 2, 0.94, tankLen - 0.1, D - 0.4, 0.04, TANK);

  for (const a of [tankA - tankLen * 0.3, tankA + tankLen * 0.3]) {
    bx(a, D / 2, 0.68, 0.05, D - 0.24, 0.3, GRIME);
  }

  const capA = tankA - tankLen * 0.28;
  const capB = D / 2;

  pillar(capA, capB, 0.98, 0.08, 0.1, MAST_WORN);
  pillar(capA, capB, 1.06, 0.045, 0.14, BLACK);
  pillar(capA, capB, 1.065, 0.012, 0.16, FADED_ORANGE);
  bx(tankA + tankLen * 0.2, front - 0.13, 0.76, 0.14, 0.015, 0.1, GAUGE);
  bx(tankA + tankLen * 0.2, front - 0.125, 0.75, 0.17, 0.01, 0.12, BLACK);

  // The muffler at the engine's back end with a heat shield, and its outlet.
  along(split * 0.55, 0.16, 0.78, 0.4, 0.13, GRIME);
  along(split * 0.55, 0.16, 0.78, 0.3, 0.17, MAST_WORN);
  pillar(split * 0.55 + 0.22, 0.16, 0.7, 0.2, 0.06, MAST);

  // Recoil starter on the engine's end with its handle.
  bx(0.02, D / 2, 0.3, 0.06, 0.2, 0.2, MAST_WORN);
  bx(-0.04, D / 2 + 0.05, 0.36, 0.05, 0.1, 0.03, BLACK);

  // Control panel on the alternator's front face: switches, lamps, meter.
  const panelA = split + (L - split) / 2;

  bx(panelA, front - 0.02, 0.22, (L - split) * 0.7, 0.035, 0.26, CHARCOAL);
  bx(panelA, front, 0.4, 0.14, 0.012, 0.06, GAUGE);
  p.chunk(
    wx(panelA - 0.1, front + 0.01),
    0.32,
    wz(panelA - 0.1, front + 0.01),
    0.03,
    0x4c7a50,
  );
  // The red indicator lamp of the two circuit generators is drawn by the game,
  // so it can glow (see `GeneratorView`); the service generator keeps its
  // plain lamp.
  if (!CIRCUIT_BODIES.has(g.id)) {
    p.chunk(
      wx(panelA, front + 0.01),
      0.32,
      wz(panelA, front + 0.01),
      0.03,
      0x86322a,
    );
  }

  for (const da of [-0.08, 0.02, 0.1]) {
    bx(panelA + da, front, 0.24, 0.035, 0.025, 0.05, STEEL_BARE);
  }

  // Output sockets: three, each a dark housing with a plug.
  const sockets: GeneratorParts["sockets"] = [];

  for (const da of [-0.12, 0, 0.12]) {
    bx(panelA + da, front + 0.02, 0.1, 0.07, 0.07, 0.07, BLACK);
    sockets.push({
      x: wx(panelA + da, front + 0.08),
      z: wz(panelA + da, front + 0.08),
    });
  }

  bx(panelA, front - 0.01, 0.06, (L - split) * 0.6, 0.012, 0.05, LABEL);

  // The collision box: the whole machine.
  const x0 = Math.min(wx(0, 0), wx(L, D));
  const x1 = Math.max(wx(0, 0), wx(L, D));
  const z0 = Math.min(wz(0, 0), wz(L, D));
  const z1 = Math.max(wz(0, 0), wz(L, D));

  const pile = map.createFitting(g.id, g.baseY, p.elements, [
    { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: 1.1 },
  ]);

  // The body is drawn on its own so the game can make it shake while it runs.
  pile.animated = true;

  return {
    cap: { x: wx(capA, capB), y: g.baseY + 1.1, z: wz(capA, capB) },
    sockets,
    panel: { x: wx(panelA, front + 0.6), z: wz(panelA, front + 0.6) },
    indicator: {
      x: wx(panelA, front + 0.012),
      y: g.baseY + 0.32,
      z: wz(panelA, front + 0.012),
    },
    exhaust: {
      x: wx(split * 0.55 + 0.22, 0.16),
      y: g.baseY + 0.92,
      z: wz(split * 0.55 + 0.22, 0.16),
    },
  };
}

// ----------------------------------------------------------------- main
export function furnishPowerGrid(map: MapBuilder, floorY: number): void {
  const F = floorY;
  const sup = (id: string): Support =>
    SUPPORTS.find((s) => s.id === id) as Support;

  // ---------------------------------------------------- power-room generator
  // Against the east wall (front facing west), x 5.8 to 6.7, z -23.7 to -22.0.
  const main = buildGenerator(map, {
    id: "fittings-generator",
    baseY: F,
    facing: "x",
    back: 6.7,
    from: -23.7,
    length: 1.7,
    depth: 0.9,
  });

  map.addGenerator({
    id: "generator-main",
    name: "Power room generator",
    x: main.cap.x,
    y: main.cap.y,
    z: main.cap.z,
    circuit: "interior",
    panel: main.panel,
    indicator: main.indicator,
    exhaust: main.exhaust,
    body: "fittings-generator",
  });

  {
    const p = new Pieces();

    // A breaker panel on the Archive's wall, west side of the room.
    p.box(-0.93, 1.2, -22.6, 0.14, 1.1, 0.8, MAST);
    p.box(-0.85, 1.28, -22.6, 0.02, 0.94, 0.66, CHARCOAL);

    for (let i = 0; i < 4; i++) {
      p.box(-0.84, 1.4 + i * 0.2, -22.85, 0.02, 0.1, 0.12, STEEL_BARE);
      p.box(-0.84, 1.4 + i * 0.2, -22.35, 0.02, 0.1, 0.12, STEEL_BARE);
    }

    p.box(-0.84, 1.1, -22.6, 0.012, 0.08, 0.5, LABEL);
    map.createFitting("fittings-breaker-panel", F, p.elements, []);
  }

  // The service point outside the power room's south door: a temporary
  // distribution board on the wall, a cable reel beside it, and the leads from
  // the floodlights and work lamps, each fixed along the wall's foot. One heavy
  // trunk goes from the board through the door to the generator's first socket.
  const DB: XZ = [4.5, -16.55];
  const [n1s, n2s] = [sup("support-north-1"), sup("support-north-2")];

  {
    const p = new Pieces();
    const s1 = main.sockets[0];
    const trunk: XZ[] = [
      [s1.x - 0.22, s1.z],
      [5.0, -22.6],
      [4.2, -21.2],
      [3.7, -19.6],
      [3.1, -18.2],
      [3.0, -17.2],
      [3.35, -16.72],
      [DB[0] - 0.14, DB[1] - 0.02],
    ];

    run(p, trunk, 0.065, 0, 0);
    // The plug lead: a short vertical piece from the floor run up into the
    // socket, so the cable visibly enters the generator.
    plug(p, s1, [-1, 0], 0.065, 0);
    ramp(p, 3.0, -17.15, Math.PI / 2);
    distributionBoard(p, DB[0], DB[1] - 0.29);

    // Each lead runs straight along the wall's foot, clipped, to the board.
    // The archive wall's lead: along the wall to the corner, round it to the
    // switchroom wall, across the door on a ramp.
    const lead2: XZ[] = [
      foot(n2s),
      [-1.6, -15.84],
      [-1.0, -16.2],
      [-0.55, -16.84],
      [2.4, -16.88],
      [3.0, -16.88],
      [3.7, -16.84],
      [4.2, -16.66],
      [DB[0] + 0.02, DB[1] - 0.04],
    ];

    run(p, lead2, 0.044, 0, 11);
    clips(p, lead2.slice(0, 5), 0.9, 0.044);
    ramp(p, 3.0, -16.88, Math.PI / 2);

    // The work lamp by the alcove (north-1) taps this mast's foot box.
    const lead1: XZ[] = [foot(n1s), [-8.4, -15.84], [-4.3, -15.84]];

    run(p, lead1, 0.036, 0, 12);
    clips(p, lead1, 0.9, 0.036);

    // A cable reel beside the mast, its lead taken to the board.
    reel(p, 6.55, -16.45, Math.PI / 2, 13);
    run(
      p,
      [
        [6.3, -16.4],
        [5.9, -16.34],
        [DB[0] + 0.3, DB[1] - 0.06],
      ],
      0.036,
      0,
      13,
    );

    // Fuel: two jerrycans and a drip tray on the floor by the wall.
    jerrycan(p, 6.2, -16.85, 0.1);
    jerrycan(p, 6.5, -16.88, -0.2);
    p.box(6.35, 0, -16.86, 0.7, 0.02, 0.28, GUNMETAL);

    // (The board is solid, its back flat to the wall: nobody walks through it.)
    map.createFitting("fittings-grid-north", F, p.elements, [
      {
        minX: DB[0] - 0.43,
        maxX: DB[0] + 0.43,
        minZ: DB[1] - 0.45,
        maxZ: DB[1] - 0.14,
        top: 1.34,
        exact: true,
      },
    ]);

    // The dock mast's lead goes straight to the generator's second socket,
    // along the north wall's foot, down the power room's east wall, through the
    // east door (z -21.5 to -19.5).
    const q = new Pieces();
    const s2 = main.sockets[1];
    const lead: XZ[] = [
      foot(sup("support-dock-1")),
      [10.0, -23.82],
      [7.7, -23.82],
      [7.28, -23.5],
      [7.22, -22.5],
      [7.22, -21.4],
      [7.0, -20.75],
      [6.85, -20.5],
      [6.3, -21.1],
      [5.85, -21.8],
      [s2.x - 0.22, s2.z],
    ];

    run(q, lead, 0.05, 0, 1);
    clips(q, lead.slice(0, 7), 0.9, 0.05);
    plug(q, s2, [-1, 0], 0.05, 1);
    ramp(q, 6.85, -20.5, 0);
    map.createFitting("fittings-grid-dock", F, q.elements, []);
  }

  // ----------------------------------------------- power room furnishing
  furnishPowerRoom(map, F, main);
  furnishPowerRoomWiring(map, F);
  furnishPowerRoomMoreWiring(map, F);
  furnishOpenSwitchgear(map, F);

  // ---------------------------------------------------- roof generator
  const roof = ROOF_HIGH;
  const rise = roof - F;
  const roofGen = buildGenerator(map, {
    id: "fittings-generator-roof",
    baseY: roof,
    facing: "z",
    back: 17.2,
    from: -4.2,
    length: 1.5,
    depth: 0.8,
  });

  map.addGenerator({
    id: "generator-roof",
    name: "Roof generator",
    x: roofGen.cap.x,
    y: roofGen.cap.y,
    z: roofGen.cap.z,
    circuit: "exterior",
    panel: roofGen.panel,
    indicator: roofGen.indicator,
    exhaust: roofGen.exhaust,
    body: "fittings-generator-roof",
  });

  {
    // The roof cable: from the generator's socket round to the roof's edge,
    // slack and a bend, then over into a steel conduit down the wall.
    const p = new Pieces();
    const x = -3.4;
    const sk = roofGen.sockets[0];

    run(
      p,
      [
        [sk.x, sk.z + 0.22],
        [-2.5, sk.z + 0.5],
        [-2.1, 17.7],
        [-2.2, 16.5],
        [-2.8, 15.7],
        [x, 15.25],
        [x, 14.96],
      ],
      0.058,
      rise + 0.033,
      1,
    );
    // The plug lead up into the generator's socket.
    plug(p, sk, [0, 1], 0.058, 1, rise);
    // The conduit stands on the junction box and runs up to the roof's edge.
    p.post(x, 0.3, 14.92, rise - 0.2, 0.12, MAST);

    for (const y of [1.0, 2.4, 3.8, 5.2]) {
      p.box(x, y, 14.94, 0.22, 0.06, 0.05, MAST_WORN);
    }

    // The conduit's foot: a junction box where the two south cables meet.
    junction(p, x, 14.78, true);

    // South 1: the work lamp's lead, a short run to the box.
    run(p, [foot(sup("support-south-1")), [x - 0.12, 14.8]], 0.036, 0, 12);

    // South 2: its lead along the wall's foot, clipped, with ramps at the door
    // (x 11.5) and the ladder's foot (x 8.5).
    const lead: XZ[] = [
      foot(sup("support-south-2")),
      [13.0, 14.8],
      [8.0, 14.8],
      [0.0, 14.8],
      [-2.4, 14.8],
      [x + 0.15, 14.8],
    ];

    run(p, lead, 0.046, 0, 10);
    clips(p, lead.slice(0, 5), 0.9, 0.046);
    ramp(p, 11.5, 14.8, Math.PI / 2);
    ramp(p, 8.5, 14.8, Math.PI / 2);

    map.createFitting("fittings-grid-south", F, p.elements, []);
  }

  // ------------------------------------------- floodlight supports
  for (const support of SUPPORTS) {
    buildSupport(map, F, support);

    if (support.platform !== 0) {
      buildPlatform(map, F, support);
    }
  }
}

/**
 * The power room's own equipment, around the generator: the main distribution
 * cabinet (it takes the place of the third switchgear cabinet, against the
 * north wall, 1.8 m from the generator's front corner), fed from the
 * generator's third socket by a short red cable into its gland plate, with a
 * conduit from its top across to the switchgear row; a fire extinguisher by
 * the south door, a faded hazard sign by the east door, a work lamp on the
 * north wall over the generator's controls and a caged pendant light.
 */
function furnishPowerRoom(
  map: MapBuilder,
  F: number,
  main: GeneratorParts,
): void {
  const p = new Pieces();
  const X0 = 2.8;
  const X1 = 4.0;
  const cx = (X0 + X1) / 2;
  const zBack = -23.7;
  const zf = -23.1;
  const zc = (zBack + zf) / 2;

  // ----------------------------------------------- main distribution panel
  p.box(cx, 0, zc, X1 - X0, 2.1, zf - zBack, CABINET);
  p.box(cx, 2.1, zc, X1 - X0 + 0.06, 0.06, zf - zBack + 0.06, GUNMETAL);
  p.box(cx, 0.02, zc, X1 - X0 + 0.04, 0.08, zf - zBack + 0.04, GUNMETAL);
  // The door seam, hinges and a heavy latch with a hasp.
  p.box(cx, 0.3, zf + 0.005, 0.012, 1.75, 0.01, BLACK);

  for (const y of [0.5, 1.1, 1.7]) {
    p.box(X0 + 0.04, y, zf + 0.01, 0.05, 0.14, 0.035, STEEL_BARE);
  }

  p.box(cx + 0.1, 0.9, zf + 0.02, 0.05, 0.3, 0.05, STEEL_BARE);
  p.box(cx + 0.1, 0.78, zf + 0.03, 0.08, 0.1, 0.04, GUNMETAL);

  // Three meters, in square bezels with a pale face and a needle.
  for (const [i, mx] of [3.05, 3.4, 3.75].entries()) {
    p.box(mx, 1.62, zf + 0.01, 0.22, 0.22, 0.04, BLACK);
    p.box(mx, 1.65, zf + 0.035, 0.16, 0.16, 0.012, GAUGE);
    p.box(mx, 1.68, zf + 0.045, 0.012, 0.09, 0.01, BLACK, 0, 0, 0.5 - i * 0.5);
  }

  // Two groups of breaker handles with label plates (each a plate with a few
  // dark marks standing in for lettering): GENERATOR, EXTERIOR LIGHTS and
  // AUXILIARY POWER.
  for (let i = 0; i < 6; i++) {
    const bx = 2.92 + i * 0.2;
    const up = i === 2 || i === 5;

    p.box(bx, 1.2, zf + 0.01, 0.13, 0.22, 0.04, CHARCOAL);
    p.box(bx, up ? 1.3 : 1.22, zf + 0.04, 0.04, 0.1, 0.05, STEEL_BARE);
  }

  for (const [i, lx] of [3.02, 3.42, 3.82].entries()) {
    p.box(lx, 1.02, zf + 0.012, 0.34, 0.07, 0.012, LABEL);

    for (let k = 0; k < 3 + (i % 2); k++) {
      p.box(
        lx - 0.12 + k * 0.08,
        1.035,
        zf + 0.02,
        0.05,
        0.02,
        0.006,
        GUNMETAL,
      );
    }
  }

  // Three small indicator lamps, dim.
  for (const [i, col] of [0x3f6a48, 0x8a6a2a, 0x7a2a22].entries()) {
    p.chunk(3.1 + i * 0.3, 0.86, zf + 0.04, 0.045, col);
  }

  // A faded warning label, a diamond on a square plate.
  p.box(X0 + 0.2, 1.88, zf + 0.012, 0.22, 0.18, 0.01, FADED_YELLOW);
  p.box(X0 + 0.2, 1.8, zf + 0.02, 0.1, 0.1, 0.008, BLACK, 0, 0, Math.PI / 4);

  // The gland plate along the bottom: three glands, the right-hand one with
  // the red feed cable plugged into it, the others capped.
  p.box(cx, 0.05, zf + 0.015, 1.0, 0.24, 0.03, GUNMETAL);

  for (const gx of [3.2, 3.4, 3.6]) {
    p.bar(gx, 0.135, zf + 0.08, 0.1, 0.075, CHARCOAL, Math.PI / 2);
    p.chunk(gx - 0.05, 0.19, zf + 0.04, 0.03, STEEL_BARE);
  }

  // The feed cable: the generator's third socket, across the floor in a
  // loose line, up into the right-hand gland.
  const s3 = main.sockets[2];

  run(
    p,
    [
      [s3.x - 0.22, s3.z],
      [5.2, -22.55],
      [4.65, -22.75],
      [4.1, -22.7],
      [3.75, -22.95],
      [3.6, zf + 0.12 + 0.22],
    ],
    0.055,
    0,
    2,
  );
  plug(p, { x: 3.6, z: zf + 0.12 }, [0, 1], 0.055, 2);
  plug(p, s3, [-1, 0], 0.055, 2);

  // A conduit from the cabinet's top up the wall and across to the switchgear
  // row, with clamps and a junction box at the far end.
  const cz = zBack + 0.1;

  p.post(3.4, 2.16, cz, 0.9, 0.06, GUNMETAL);
  p.bar((3.4 + 0.5) / 2, 3.06, cz, 3.4 - 0.5, 0.06, GUNMETAL);
  p.chunk(3.4, 3.03, cz, 0.08, STEEL_BARE);

  for (const x of [3.0, 2.2, 1.4]) {
    p.box(x, 2.99, cz, 0.05, 0.14, 0.04, MAST_WORN);
  }

  p.box(0.5, 2.9, cz, 0.22, 0.22, 0.14, CHARCOAL);
  p.box(0.5, 3.12, cz, 0.25, 0.025, 0.17, GUNMETAL);
  p.box(0.3, 2.98, cz + 0.07, 0.06, 0.05, 0.01, FADED_YELLOW);

  // ----------------------------------------- the entrance and the east door
  // A fire extinguisher by the south door, on a wall bracket and strap.
  const ex = 4.75;
  const ez = -17.4;

  p.box(ex, 0.8, ez + 0.02, 0.1, 0.4, 0.03, MAST_WORN);
  p.post(ex, 0.88, ez - 0.07, 0.42, 0.14, EXTINGUISHER);
  p.post(ex, 1.3, ez - 0.07, 0.08, 0.06, STEEL_BARE);
  p.box(ex, 1.1, ez - 0.07, 0.17, 0.045, 0.17, GUNMETAL);
  p.box(ex + 0.06, 1.32, ez - 0.07, 0.1, 0.03, 0.03, BLACK);

  // An electrical hazard sign by the east door: a faded diamond.
  p.box(6.66, 1.36, -18.75, 0.015, 0.28, 0.28, FADED_YELLOW, 0, 0, Math.PI / 4);
  p.box(6.65, 1.4, -18.75, 0.012, 0.1, 0.1, BLACK, 0, 0, Math.PI / 4);

  // ---------------------------------------------------------------- lights
  // A caged work lamp on the north wall over the generator's controls.
  p.box(5.2, 2.28, zBack + 0.08, 0.28, 0.1, 0.1, MAST_WORN);
  p.box(5.2, 2.0, zBack + 0.17, 0.2, 0.24, 0.16, GUNMETAL);

  for (let i = 0; i < 3; i++) {
    p.box(5.2 - 0.07 + i * 0.07, 2.0, zBack + 0.26, 0.012, 0.24, 0.012, BLACK);
  }

  // The bare hanging bulb in the middle of the room: its rose, flex and
  // socket hang from the wooden slab and are drawn with it (see
  // `CeilingSlabMesh`), and its glass with `createJunkBulbGlow`: they go when
  // the slab breaks.

  map.createFitting("fittings-main-panel", F, p.elements, [
    { minX: X0, maxX: X1, minZ: zBack, maxZ: zf, top: 2.16 },
  ]);

  map.addLight({
    id: "light-power-room-work",
    x: 5.2,
    y: F + 1.95,
    z: zBack + 0.25,
    color: 0xe8eef4,
    intensity: 14,
    distance: 7,
    target: { x: 6.0, y: F + 0.5, z: -22.6 },
    angle: 0.95,
  });
  // The bulb's light: a downward cone with visible rays, like the Junk Room's.
  map.addLight({
    id: "bulb-power-a",
    castShadow: true,
    x: POWER_BULB.x,
    y: F + POWER_BULB.y - 0.16,
    z: POWER_BULB.z,
    color: 0xffbd70,
    intensity: 110,
    distance: 10,
    target: { x: POWER_BULB.x, y: F, z: POWER_BULB.z },
    angle: 1.15,
  });
}

/** A cable along 3D points: a short straight length between each pair. */
function wire3(
  p: Pieces,
  points: ReadonlyArray<readonly [number, number, number]>,
  diameter: number,
  color: number,
): void {
  for (let i = 1; i < points.length; i++) {
    const [ax, ay, az] = points[i - 1];
    const [bx, by, bz] = points[i];
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const flat = Math.hypot(dx, dz);

    p.cable(
      (ax + bx) / 2,
      (ay + by) / 2,
      (az + bz) / 2,
      Math.hypot(flat, dy) + diameter * 0.8,
      diameter,
      color,
      // Yaw to the heading in the floor plane, then pitch up or down it.
      Math.atan2(-dz, dx),
      Math.atan2(dy, flat),
    );
  }
}

/**
 * More wiring in the power room, coming in from here and there: a ceiling
 * bundle across the room with cables dropping to the generator, the two
 * switchgear cabinets and the main cabinet; junction boxes on the south wall
 * either side of the door with conduits up to the ceiling bundle and cables
 * snaking across the floor; a conduit run along the east wall to a junction
 * box; and a plate in the west wall (from the Junk Room) with cables out of
 * it. Drawn only, and kept off the middle of the floor.
 */
function furnishPowerRoomMoreWiring(map: MapBuilder, F: number): void {
  const p = new Pieces();
  const SIGNAL = 0x1b1d21;
  const ceilingY = 3.74;
  const southWall = -17.32;
  const eastWall = 6.64;
  const rnd = lcg(5151);
  const jitter = (n: number): number => (rnd() - 0.5) * n;

  // A junction box on a wall, small and dark, with a lid screw and a label.
  const box = (
    x: number,
    y: number,
    z: number,
    facing: "s" | "e" | "w",
  ): void => {
    if (facing === "e") {
      p.box(x, y, z, 0.12, 0.3, 0.34, CHARCOAL);
      p.box(x - 0.07, y + 0.04, z, 0.02, 0.22, 0.26, GUNMETAL);
    } else if (facing === "w") {
      p.box(x, y, z, 0.12, 0.3, 0.34, CHARCOAL);
      p.box(x + 0.07, y + 0.04, z, 0.02, 0.22, 0.26, GUNMETAL);
    } else {
      p.box(x, y, z, 0.34, 0.3, 0.12, CHARCOAL);
      p.box(x, y + 0.04, z + 0.07, 0.26, 0.22, 0.02, GUNMETAL);
    }
  };

  // ------------------------------------------------ the ceiling bundle
  // A steel conduit and three cables along the ceiling, west to east, with
  // clamps; the supply for everything below.
  // (Clear of the wooden slab's opening, which ends at z -21.675.)
  const bundleZ = -21.95;

  p.bar(3.0, ceilingY, bundleZ, 8.0, 0.05, MAST_WORN);

  for (const [dz, d, color] of [
    [-0.07, 0.04, CABLES[0]],
    [0.06, 0.04, SIGNAL],
    [0.0, 0.035, CABLES[2]],
  ] as const) {
    p.cable(3.0, ceilingY - 0.05, bundleZ + dz, 8.0, d, color);
  }

  for (let x = -0.6; x < 6.8; x += 1.0) {
    p.box(x, ceilingY - 0.09, bundleZ, 0.05, 0.14, 0.12, GUNMETAL);
  }

  // Drops from the bundle: to the generator's top, to each switchgear
  // cabinet's top and to the main cabinet's, two cables each, sagging.
  const drops: Array<[number, number, number, number, number]> = [
    // [x on the bundle, x at the equipment, z at the equipment, top of it, spread]
    // (The generator's top is a metre up here: its two leads end on terminals
    // fixed to it, not in the air over it.)
    [5.8, 6.2, -23.0, 1.02, 0.06],
    [6.2, 6.3, -22.7, 1.02, -0.06],
    [1.1, 1.0, -23.2, 2.03, 0.05],
    [1.5, 1.4, -23.1, 2.03, -0.05],
    [2.3, 2.2, -23.2, 2.03, 0.05],
    [3.0, 3.3, -23.3, 2.17, 0.05],
  ];

  // A terminal block where each lead meets the generator's top.
  for (const [tx, tz] of [
    [6.2, -23.0],
    [6.3, -22.7],
  ] as const) {
    p.box(tx, 1.0, tz, 0.14, 0.06, 0.14, GUNMETAL);
    p.post(tx - 0.03, 1.06, tz, 0.04, 0.025, STEEL_BARE);
    p.post(tx + 0.03, 1.06, tz, 0.04, 0.025, STEEL_BARE);
  }

  drops.forEach(([bx, ex, ez, top, spread], n) => {
    const color = n % 2 ? CABLES[1] : SIGNAL;

    wire3(
      p,
      [
        [bx, ceilingY - 0.05, bundleZ + spread],
        [
          bx + (ex - bx) * 0.15 + jitter(0.08),
          ceilingY - 0.5,
          bundleZ + (ez - bundleZ) * 0.2,
        ],
        [
          bx + (ex - bx) * 0.55 + jitter(0.08),
          (ceilingY + top) / 2,
          bundleZ + (ez - bundleZ) * 0.6,
        ],
        [ex + jitter(0.05), top + 0.3, ez + (bundleZ - ez) * 0.1],
        [ex, top - 0.02, ez],
      ],
      0.04,
      color,
    );
  });

  // ------------------------------------------- the south wall, both sides of the door
  for (const [bx, by, count] of [
    [0.3, 1.55, 3],
    [5.2, 1.6, 4],
  ] as const) {
    box(bx, by, southWall, "s");

    // Conduit up the wall to the ceiling, then a cable along the ceiling to the bundle.
    p.cableUp(
      bx - 0.08,
      by + 0.3,
      southWall + 0.04,
      ceilingY - by - 0.3,
      0.045,
      MAST_WORN,
    );
    p.cable(
      bx - 0.08,
      ceilingY,
      (southWall + bundleZ) / 2,
      southWall - bundleZ - 0.2,
      0.04,
      SIGNAL,
      Math.PI / 2,
    );
    p.cable(
      bx - 0.03,
      ceilingY - 0.02,
      (southWall + bundleZ) / 2,
      southWall - bundleZ - 0.2,
      0.035,
      CABLES[0],
      Math.PI / 2,
    );

    // Cables out of the bottom of the box, across the wall and onto the floor.
    for (let k = 0; k < count; k++) {
      const x = bx - 0.12 + k * 0.08;

      wire3(
        p,
        [
          [x, by - 0.03, southWall + 0.06],
          [x + jitter(0.1), by - 0.5, southWall + 0.1],
          [x + jitter(0.3), 0.1, southWall + 0.35],
          [x + jitter(0.9), 0.03, southWall + 0.8 + k * 0.1],
        ],
        0.04,
        k % 2 ? SIGNAL : CABLES[k % 4],
      );
    }
  }

  // Floor cables from those boxes, wandering to the equipment (low, off the middle).
  wire3(
    p,
    [
      [5.3, 0.03, -17.6],
      [5.0, 0.03, -18.8],
      [5.5, 0.03, -20.1],
      [5.7, 0.03, -21.4],
      [5.75, 0.03, -22.2],
    ],
    0.045,
    CABLES[1],
  );
  wire3(
    p,
    [
      [5.35, 0.03, -17.65],
      [5.2, 0.03, -19.0],
      [5.7, 0.03, -20.5],
      [5.8, 0.03, -21.9],
    ],
    0.04,
    SIGNAL,
  );
  wire3(
    p,
    [
      [0.4, 0.03, -17.7],
      [0.2, 0.03, -19.3],
      [0.5, 0.03, -21.0],
      [0.9, 0.03, -22.4],
    ],
    0.045,
    CABLES[0],
  );
  wire3(
    p,
    [
      [0.45, 0.03, -17.7],
      [0.4, 0.03, -19.5],
      [0.8, 0.03, -21.2],
      [1.4, 0.03, -22.4],
    ],
    0.04,
    SIGNAL,
  );

  // ------------------------------------------------ the east wall
  // A conduit along it at 2.4 m, a junction box, and cables down to the floor.
  p.bar(eastWall, 2.4, -20.4, 6.2, 0.05, MAST_WORN, Math.PI / 2);

  for (const z of [-23.0, -21.4, -19.8, -18.2]) {
    p.box(eastWall, 2.34, z, 0.05, 0.12, 0.08, GUNMETAL);
  }

  box(eastWall - 0.06, 1.3, -19.6, "e");
  p.cableUp(eastWall - 0.02, 1.6, -19.6, 0.8, 0.045, MAST_WORN);

  for (let k = 0; k < 3; k++) {
    wire3(
      p,
      [
        [eastWall - 0.06, 1.3 + 0.03, -19.6 - 0.1 + k * 0.1],
        [eastWall - 0.12 + jitter(0.06), 0.8, -19.6 - 0.1 + k * 0.1],
        [eastWall - 0.3 + jitter(0.2), 0.1, -19.5 + jitter(0.4)],
        [eastWall - 0.9 + jitter(0.4), 0.03, -19.4 + k * 0.25],
      ],
      0.04,
      k === 1 ? SIGNAL : CABLES[k],
    );
  }

  // ----------------------------------- the west wall: a plate from the Junk Room
  p.box(-0.95, 0.9, -22.2, 0.05, 0.4, 0.45, GUNMETAL);

  for (let k = 0; k < 4; k++) {
    const z = -22.4 + k * 0.12;

    wire3(
      p,
      [
        [-0.92, 1.0 + (k % 2) * 0.1, z],
        [-0.8, 0.5, z + jitter(0.1)],
        [-0.5 + jitter(0.2), 0.04, z + 0.2 + jitter(0.2)],
        [0.0 + jitter(0.3), 0.03, z + 0.5 + jitter(0.3)],
      ],
      0.04,
      k % 2 ? SIGNAL : CABLES[k % 4],
    );
  }

  map.createFitting("fittings-power-room-more-wiring", F, p.elements, []);
}

/**
 * More of the power room's wiring: a ladder-type cable tray along the north
 * wall (over the switchgear row) carrying a bundle of red and black cables
 * from the breaker panel on the west wall to the main cabinet's top; two red
 * cables fanned across the floor in front of the switchgear from the main
 * cabinet's glands into the switchgear's bases; a short cable up to the work
 * lamp; the pendant lamp's supply along the ceiling and down to the conduit;
 * clamps, a wall junction box and a spare loop. Drawn only.
 */
function furnishPowerRoomWiring(map: MapBuilder, F: number): void {
  const p = new Pieces();
  const SIGNAL = 0x1b1d21;
  const zWall = -23.7;
  const zf = -23.1;

  // --------------------------------------------------- the cable tray
  // Two side rails and rungs, 2.5 m up, on brackets to the wall, from just
  // inside the west wall to the main cabinet.
  const trayY = 2.5;
  const x0 = -0.75;
  const x1 = 2.85;

  p.bar((x0 + x1) / 2, trayY + 0.03, zWall + 0.08, x1 - x0, 0.045, MAST_WORN);
  p.bar((x0 + x1) / 2, trayY + 0.03, zWall + 0.34, x1 - x0, 0.045, MAST_WORN);

  for (let x = x0 + 0.2; x < x1; x += 0.35) {
    p.box(x, trayY, zWall + 0.21, 0.04, 0.025, 0.3, MAST);
  }

  for (const x of [-0.5, 0.7, 1.9, 2.7]) {
    p.box(x, trayY - 0.28, zWall + 0.005, 0.05, 0.3, 0.08, GUNMETAL);
    p.box(x, trayY - 0.03, zWall + 0.05, 0.05, 0.04, 0.3, GUNMETAL);
  }

  // The bundle in the tray: two red and one black, each wandering a little.
  const rnd = lcg(31337);

  for (const [dz, d, color] of [
    [0.13, 0.05, CABLES[0]],
    [0.2, 0.045, SIGNAL],
    [0.29, 0.05, CABLES[2]],
  ] as const) {
    let x = x0;

    while (x < x1 - 0.02) {
      const step = Math.min(0.3 + rnd() * 0.15, x1 - x);

      p.cable(
        x + step / 2,
        trayY + 0.055,
        zWall + dz + (rnd() - 0.5) * 0.03,
        step + d * 0.9,
        d,
        color,
      );
      x += step;
    }
  }

  // Straps over the bundle.
  for (const x of [0.2, 1.3, 2.4]) {
    p.box(x, trayY + 0.02, zWall + 0.21, 0.03, 0.09, 0.3, GRIME);
  }

  // West end: down to the breaker panel's top (its top is 2.3 m up).
  p.cableUp(-0.8, 2.3, zWall + 0.13, 0.25, 0.05, CABLES[0]);
  p.cableUp(-0.8, 2.3, zWall + 0.29, 0.25, 0.05, CABLES[2]);
  p.cableUp(-0.72, 2.3, zWall + 0.2, 0.25, 0.045, SIGNAL);
  // ...and the panel's own gland.
  p.box(-0.82, 2.3, -22.6, 0.1, 0.05, 0.3, GUNMETAL);

  // East end: down over the main cabinet's top, into a gland box.
  p.box(2.95, 2.16, zWall + 0.25, 0.22, 0.12, 0.24, CHARCOAL);
  p.cableUp(2.9, 2.28, zWall + 0.13, 0.28, 0.05, CABLES[0]);
  p.cableUp(2.9, 2.28, zWall + 0.29, 0.28, 0.05, CABLES[2]);

  // --------------------------------------- fan-out across the floor
  // Two red cables from the main cabinet's other glands to the switchgear's
  // bases: loose lines in front of the row, staying clear of the door.
  const front = -23.0;

  plug(p, { x: 3.4, z: zf + 0.12 }, [0, 1], 0.05, 0);
  run(
    p,
    [
      [3.4, zf + 0.34],
      [3.0, -22.6],
      [2.3, -22.55],
      [1.5, -22.7],
      [1.0, front + 0.22],
    ],
    0.05,
    0,
    1,
  );
  plug(p, { x: 1.0, z: front }, [0, 1], 0.05, 1);

  plug(p, { x: 3.2, z: zf + 0.12 }, [0, 1], 0.05, 2);
  run(
    p,
    [
      [3.2, zf + 0.34],
      [2.85, -22.82],
      [2.4, -22.9],
      [2.2, front + 0.22],
    ],
    0.05,
    0,
    3,
  );
  plug(p, { x: 2.2, z: front }, [0, 1], 0.05, 3);

  // A loop of spare on the longer one, against the north wall's foot.
  coil(p, 2.3, -22.55, -Math.PI / 2, 0.2, 0.05);

  // --------------------------------------- feeds for the two lamps
  // The work lamp: a short cable from the cabinet's top right to the lamp.
  p.cableUp(3.92, 2.16, zWall + 0.1, 0.22, 0.04, SIGNAL);
  p.cable(4.55, 2.4, zWall + 0.1, 1.28, 0.04, SIGNAL);
  p.cableUp(5.17, 2.3, zWall + 0.1, 0.1, 0.04, SIGNAL);

  for (const x of [4.2, 4.9]) {
    p.box(x, 2.34, zWall + 0.04, 0.04, 0.1, 0.04, MAST_WORN);
  }

  // The supply along the ceiling to the north wall and down to the conduit.
  // It starts at the edge of the wooden slab's opening (nothing hangs in it).
  p.cable(3.24, 3.77, -22.65, 2.2, 0.03, SIGNAL, Math.PI / 2);
  p.cable(3.24, 3.77, -23.55, 0.3, 0.03, SIGNAL, Math.PI / 2);
  p.cableUp(3.24, 3.08, zWall + 0.1, 0.72, 0.03, SIGNAL);
  p.box(3.24, 3.72, -22.4, 0.05, 0.06, 0.05, MAST_WORN);

  map.createFitting("fittings-power-room-wiring", F, p.elements, []);
}

/**
 * The two switchgear cabinets, opened up: an open transformer cabinet and a
 * relay and switch cabinet, each 1.2 x 0.7 m against the north wall, the front
 * open (one door leaf swung wide, the other gone), so the inside shows:
 *   - the transformer: a laminated steel core, two copper-brown coils with
 *     bands, ceramic insulators on top joined by a bus bar, red leads, a tap
 *     changer and a terminal block;
 *   - the relay cabinet: a green circuit board with traces, chips and
 *     capacitors, a bank of knife switches (one open), a row of fuses, a
 *     contactor and a wire bundle to a terminal strip.
 * A plinth keeps the floor cables' plugs where they were. Each has one hidden
 * collision box over its whole footprint, as before.
 */
function furnishOpenSwitchgear(map: MapBuilder, F: number): void {
  const COPPER = 0x6a4a2c;
  const CERAMIC = 0xb9b4a4;
  const BOARD = 0x2f3b34;
  const TRACE = 0x4a6a58;
  const CORE = 0x3b4046;
  const PANEL = 0x4a5058;
  const BLUE = 0x3a4a68;
  const WIRE_BLACK = 0x1b1d21;
  const zc = -23.35;

  const shell = (q: Pieces, cx: number): void => {
    q.box(cx, 0, zc, 1.2, 0.25, 0.7, CABINET);
    q.box(cx - 0.58, 0.25, zc, 0.04, 1.75, 0.7, CABINET);
    q.box(cx + 0.58, 0.25, zc, 0.04, 1.75, 0.7, CABINET);
    q.box(cx, 1.94, zc, 1.2, 0.07, 0.7, GUNMETAL);
    q.box(cx, 0.25, -23.68, 1.12, 1.69, 0.04, GRIME);
    q.box(cx, 0.35, -23.64, 1.0, 1.5, 0.025, PANEL);

    for (const x of [-0.46, 0.46]) {
      for (const y of [0.4, 1.78]) {
        q.chunk(cx + x, y, -23.62, 0.035, STEEL_BARE);
      }
    }
  };

  // One door leaf swung wide on `side`, its inside pale with a placard; the
  // other leaf is gone, leaving bare hinge pins.
  const leaf = (q: Pieces, cx: number, side: number): void => {
    const x = cx + side * 0.62;

    q.box(x, 0.25, -22.7, 0.03, 1.75, 0.6, CABINET);
    q.box(x - side * 0.02, 0.45, -22.7, 0.012, 1.3, 0.5, PANEL);
    q.box(x - side * 0.03, 1.5, -22.7, 0.01, 0.2, 0.28, FADED_YELLOW);
    q.box(
      x - side * 0.035,
      1.5,
      -22.7,
      0.008,
      0.1,
      0.1,
      BLACK,
      0,
      0,
      Math.PI / 4,
    );

    for (const y of [0.5, 1.1, 1.7]) {
      q.box(cx + side * 0.58, y, -23.0, 0.06, 0.12, 0.05, STEEL_BARE);
      q.post(cx - side * 0.58, y, -23.0, 0.12, 0.025, STEEL_BARE);
    }
  };

  // ------------------------------------------------ the open transformer
  {
    const q = new Pieces();
    const cx = 1.0;

    shell(q, cx);
    leaf(q, cx, -1);

    // Core: a laminated stack with a lighter edge on each plate.
    q.box(cx, 0.5, -23.5, 0.7, 0.85, 0.2, CORE);

    for (let i = 0; i < 8; i++) {
      q.box(cx, 0.58 + i * 0.1, -23.395, 0.68, 0.012, 0.006, 0x6a727c);
    }

    // Two coils on the legs, with bands and a rim of insulation.
    for (const dx of [-0.24, 0.24]) {
      q.post(cx + dx, 0.62, -23.38, 0.58, 0.27, COPPER);

      for (const y of [0.66, 0.94, 1.12]) {
        q.post(cx + dx, y, -23.38, 0.04, 0.29, BLACK);
      }

      q.post(cx + dx, 1.2, -23.38, 0.03, 0.2, GUNMETAL);
    }

    // Three ceramic insulators on top, joined by a bus bar; red leads up from
    // the coils to the outer two.
    for (const dx of [-0.26, 0, 0.26]) {
      q.post(cx + dx, 1.4, -23.5, 0.2, 0.06, CERAMIC);
      q.post(cx + dx, 1.5, -23.5, 0.02, 0.1, CERAMIC);
      q.post(cx + dx, 1.6, -23.5, 0.02, 0.1, CERAMIC);
      q.chunk(cx + dx, 1.62, -23.5, 0.05, STEEL_BARE);
    }

    q.bar(cx, 1.66, -23.5, 0.62, 0.035, STEEL_BARE);
    q.cableUp(cx - 0.24, 1.22, -23.45, 0.44, 0.04, CABLES[0]);
    q.cableUp(cx + 0.24, 1.22, -23.45, 0.44, 0.04, CABLES[2]);

    // A tap changer: three dials with pointers, and a nameplate.
    for (const [i, y] of [0.7, 1.0, 1.3].entries()) {
      q.post(cx - 0.46, y, -23.6, 0.05, 0.12, BLACK);
      q.box(
        cx - 0.46,
        y + 0.04,
        -23.55,
        0.01,
        0.09,
        0.012,
        STEEL_BARE,
        0,
        0,
        0.6 * i - 0.5,
      );
    }

    q.box(cx + 0.38, 1.35, -23.6, 0.2, 0.08, 0.012, LABEL);

    // A terminal block along the bottom with its screws, and wires down.
    q.box(cx, 0.32, -23.58, 0.9, 0.08, 0.08, CHARCOAL);

    for (let i = 0; i < 7; i++) {
      q.chunk(cx - 0.4 + i * 0.133, 0.4, -23.53, 0.025, STEEL_BARE);
    }

    q.cableUp(cx - 0.3, 0.2, -23.55, 0.15, 0.035, CABLES[3]);
    q.cableUp(cx, 0.2, -23.55, 0.15, 0.035, WIRE_BLACK);
    q.cableUp(cx + 0.3, 0.2, -23.55, 0.15, 0.035, CABLES[0]);

    map.createFitting("fittings-open-transformer", F, q.elements, [
      { minX: 0.4, maxX: 1.6, minZ: -23.7, maxZ: -23.0, top: 2.0 },
    ]);
  }

  // ------------------------------------------- the relay and switch cabinet
  {
    const q = new Pieces();
    const cx = 2.2;

    shell(q, cx);
    leaf(q, cx, 1);

    // The circuit board: green, with traces, chips, capacitors and a header.
    q.box(cx - 0.22, 0.95, -23.61, 0.5, 0.46, 0.015, BOARD);

    for (let i = 0; i < 5; i++) {
      q.box(cx - 0.22, 1.0 + i * 0.075, -23.6, 0.44, 0.008, 0.004, TRACE);
    }

    for (const [dx, dy] of [
      [-0.35, 1.15],
      [-0.2, 1.15],
      [-0.28, 0.98],
      [-0.1, 1.05],
    ] as const) {
      q.box(cx + dx, dy, -23.6, 0.09, 0.05, 0.02, BLACK);
    }

    for (const dx of [-0.38, -0.3, -0.12]) {
      q.post(cx + dx, 0.75, -23.6, 0.06, 0.035, BLUE);
    }

    for (let i = 0; i < 6; i++) {
      q.box(cx - 0.4 + i * 0.03, 1.2, -23.6, 0.012, 0.04, 0.02, STEEL_BARE);
    }

    // A bank of three knife switches on ceramic bases, one of them open.
    for (const [i, dx] of [0.18, 0.3, 0.42].entries()) {
      q.box(cx + dx, 0.75, -23.6, 0.09, 0.62, 0.03, CERAMIC);
      q.chunk(cx + dx, 0.78, -23.57, 0.04, STEEL_BARE);
      q.chunk(cx + dx, 1.32, -23.57, 0.04, STEEL_BARE);
      q.box(
        cx + dx,
        0.8,
        -23.56,
        0.025,
        0.5,
        0.02,
        STEEL_BARE,
        0,
        i === 1 ? 0.35 : 0,
      );
      q.box(cx + dx, 1.28, -23.54, 0.05, 0.1, 0.05, BLACK);
    }

    // A row of fuses in clips, a contactor, and its pale label.
    for (let i = 0; i < 4; i++) {
      q.box(cx - 0.4 + i * 0.12, 0.5, -23.58, 0.08, 0.06, 0.05, CHARCOAL);
      q.post(cx - 0.4 + i * 0.12, 0.54, -23.58, 0.12, 0.04, CERAMIC);
    }

    q.box(cx + 0.28, 1.45, -23.57, 0.26, 0.26, 0.12, GUNMETAL);
    q.box(cx + 0.28, 1.5, -23.5, 0.14, 0.08, 0.006, LABEL);
    q.chunk(cx + 0.2, 1.6, -23.5, 0.035, 0x4c7a50);
    q.chunk(cx + 0.36, 1.6, -23.5, 0.035, 0x86322a);

    // A terminal strip, and a bundle of three wires up the left side, over
    // to the board and back.
    q.box(cx - 0.2, 0.3, -23.58, 0.7, 0.07, 0.07, CHARCOAL);

    for (let i = 0; i < 6; i++) {
      q.chunk(cx - 0.45 + i * 0.1, 0.37, -23.53, 0.022, STEEL_BARE);
    }

    for (const [dx, color] of [
      [-0.5, CABLES[0]],
      [-0.47, WIRE_BLACK],
      [-0.44, BLUE],
    ] as const) {
      q.cableUp(cx + dx, 0.34, -23.56, 1.4, 0.03, color);
    }

    q.cable(cx - 0.1, 1.74, -23.56, 0.78, 0.03, WIRE_BLACK);
    q.cable(cx - 0.1, 1.7, -23.57, 0.78, 0.03, CABLES[0]);
    q.cableUp(cx + 0.28, 1.58, -23.56, 0.14, 0.03, WIRE_BLACK);

    // Wires below, bundled into the plinth.
    q.cableUp(cx - 0.1, 0.2, -23.55, 0.15, 0.035, CABLES[2]);
    q.cableUp(cx + 0.1, 0.2, -23.55, 0.15, 0.035, WIRE_BLACK);

    map.createFitting("fittings-open-switchgear", F, q.elements, [
      { minX: 1.6, maxX: 2.8, minZ: -23.7, maxZ: -23.0, top: 2.0 },
    ]);
  }
}

/**
 * The two spawn areas' lamp posts: the same mast and head as the walkway
 * floodlights, standing on the ground floor against the wall beside each
 * area's poster, aimed at the poster and the floor below it. Each has its own
 * cable from its junction box along the floor to a sleeve box on the wall
 * face at 3.6 m (the line carries on inside the wall), and on the first floor
 * above a matching box with a cable on to the nearest walkway support's
 * junction box, so it reads as a tap off the same wiring.
 */
export function furnishSpawnLamps(map: MapBuilder): void {
  const F = 4;
  const nw: Support = {
    id: "lamp-spawn-nw",
    x: -21.0,
    z: -20.8,
    nx: -1,
    nz: 0,
    // A caged work lamp on a bracket at the end of a conduit, bolted to the
    // wall (not a mast standing out from it), with its flex from the conduit.
    height: 4.3,
    kind: "single",
    tilt: 0.5,
    cage: true,
    platform: 0,
    style: "wall",
    power: 85,
    aim: [-26.0, 0.8, -17.2],
    // The room's principal light: warm amber, not the cold white of the masts.
    color: 0xffc27a,
  };
  for (const [lamp, wallX, boxZ, target] of [
    [nw, -21.0, -21.8, foot(SUPPORTS[0])],
  ] as const) {
    // (The lamp itself is the wall halogen `halogen-wall-spawn` (see
    // NightLights), a proper bracketed head on the wall; this is its feed.)

    // The ground part: from the foot box along the floor to below the sleeve
    // box, then up the wall's face in a clamped conduit.
    const p = new Pieces();
    const out = lamp.nx; // the room is on this side of the wall
    const [fx, fz] = foot(lamp);
    const bx = wallX + out * 0.1;

    junction(p, fx, fz);

    run(
      p,
      [
        [fx, fz],
        [fx + out * 0.1, (fz + boxZ) / 2 + 0.15],
        [bx + out * 0.05, boxZ + 0.1],
        [bx, boxZ],
      ],
      0.042,
      0,
      1,
    );
    p.post(bx, 0.04, boxZ, 3.5, 0.07, MAST);

    for (const y of [0.8, 1.8, 2.8]) {
      p.box(bx, y, boxZ, 0.1, 0.06, 0.12, MAST_WORN);
    }

    // The sleeve box on the face, where the line goes into the wall.
    p.box(bx, 3.5, boxZ, 0.16, 0.3, 0.26, CHARCOAL);
    p.box(bx, 3.8, boxZ, 0.18, 0.025, 0.28, GUNMETAL);
    p.chunk(bx + out * 0.08, 3.62, boxZ - 0.08, 0.035, STEEL_BARE);
    p.chunk(bx + out * 0.08, 3.62, boxZ + 0.08, 0.035, STEEL_BARE);
    // From the sleeve box along the wall's face to the lamp's bracket (1 m on
    // along the wall), and up its last 30 cm into the plate.
    run(
      p,
      [
        [bx, boxZ],
        [bx, -20.85],
      ],
      0.04,
      3.62,
      1,
    );
    p.box(bx, 3.5, -20.8, 0.1, 0.5, 0.1, CHARCOAL);
    p.cableUp(bx, 3.64, -20.8, 0.3, 0.04, SITE_CABLES[0]);
    map.createFitting(`${lamp.id}-feed`, 0, p.elements, []);

    // The first-floor part: a matching box on the floor above the same spot,
    // and a cable on to the walkway support's junction box.
    const q = new Pieces();
    const ax = wallX - out * 0.6;

    junction(q, ax, boxZ, true);
    // Straight along the wall's foot to the work light's (or the mast's) box.
    const tap: XZ[] =
      lamp.id === "lamp-spawn-nw"
        ? [
            [ax - out * 0.1, boxZ],
            [-20.78, boxZ + 0.5],
            [-20.78, -16.4],
            [-20.2, -15.84],
            [-16.5, -15.84],
            [target[0], target[1]],
          ]
        : [
            [ax - out * 0.1, boxZ],
            [21.3, -22.4],
            [20.7, -23.82],
            [14.3, -23.82],
            [target[0], target[1]],
          ];

    run(q, tap, 0.042, 0, 10);
    clips(q, tap.slice(1), 0.9, 0.042);
    map.createFitting(`${lamp.id}-tap`, F, q.elements, []);
  }
}

/**
 * The service area on the east deck, where the machinery of a working site
 * would be kept together: a petrol generator against the Server room's wall,
 * a temporary distribution board beside it, a cable reel, two fuel drums on a
 * drip tray, jerrycans and an extinguisher. The mains lead runs from the
 * generator to the board along the wall's foot; a short lead goes on to the
 * work lamp above. (It replaces the grey box that stood here.)
 */
export function furnishDeckService(map: MapBuilder, floorY: number): void {
  const F = floorY;
  const gen = buildGenerator(map, {
    id: "generator-east-deck",
    baseY: F,
    facing: "z",
    back: -4.7,
    from: 22.75,
    length: 1.8,
    depth: 0.9,
  });
  const p = new Pieces();
  const boardX = 26.4;
  const sock = gen.sockets[0];

  // The board, back to the wall, and the mains lead to it (red, the heavy supply).
  distributionBoard(p, boardX, -4.84);

  const mains: XZ[] = [
    [sock.x, sock.z + 0.22],
    [sock.x + 0.35, -3.48],
    [25.4, -3.5],
    [26.0, -3.9],
    [boardX - 0.1, -4.62],
  ];

  run(p, mains, 0.065, 0, 0);
  plug(p, sock, [0, 1], 0.065, 0);

  // A reel with its lead taken to the board, beside it.
  reel(p, 27.5, -4.15, 0.3, 13);
  run(
    p,
    [
      [27.3, -4.25],
      [27.0, -4.5],
      [boardX + 0.3, -4.6],
    ],
    0.036,
    0,
    13,
  );
  // Jerrycans and a drip tray by the generator's east end, an extinguisher on the wall.
  jerrycan(p, 25.15, -3.4, 0.2);
  jerrycan(p, 25.45, -3.45, -0.1);
  p.box(25.3, 0, -3.42, 0.7, 0.02, 0.28, GUNMETAL);
  extinguisher(p, 24.3, 0.9, -5.0, "z", 1);
  warningSign(p, 23.3, 1.7, -5.0, "z", 1);
  map.createFitting("deck-service", F, p.elements, []);

  // Two fuel drums on a drip tray, touching the generator's end.
  const q = new Pieces();

  q.box(24.9, 0, -4.1, 0.74, 0.04, 1.28, GUNMETAL);
  drum(q, 24.9, -4.4, 0x6b3d30, true, 0.04);
  drum(q, 24.9, -3.8, 0x3f5a4a, false, 0.04);
  // A pump on a hose across the drums.
  q.box(24.9, 0.94, -4.1, 0.1, 0.1, 0.5, 0x8791a0);
  q.cable(24.9, 0.96, -4.1, 0.7, 0.03, SITE_CABLES[0], Math.PI / 2);
  map.createFitting("deck-fuel", F, q.elements, [
    { minX: 24.6, maxX: 25.2, minZ: -4.7, maxZ: -3.5, top: 1.0 },
  ]);

  // A drum with a fire in it, on the deck under the bridge: scorched steel,
  // vent holes punched round its foot, a few charred sticks across the mouth
  // (the flames and their glow are drawn by BarrelFire).
  const fx = 27.1;
  // (This area is built five metres south of where it stands: world z -0.5.)
  const fz = 4.5;
  const f = new Pieces();

  f.post(fx, 0, fz, 0.88, 0.58, 0x3b312a);
  f.post(fx, 0.2, fz, 0.04, 0.6, 0x241f1b);
  f.post(fx, 0.6, fz, 0.04, 0.6, 0x241f1b);
  f.post(fx, 0.8, fz, 0.06, 0.52, 0x120e0b);

  for (const a of [0.3, 1.4, 2.5, 3.6, 4.7, 5.8]) {
    f.box(
      fx + Math.cos(a) * 0.29,
      0.06,
      fz + Math.sin(a) * 0.29,
      0.05,
      0.07,
      0.05,
      0x0d0a08,
      -a,
    );
  }

  f.bar(fx, 0.9, fz, 0.5, 0.05, 0x1a1411, 0.5, 0, 0.1);
  f.bar(fx, 0.93, fz, 0.46, 0.05, 0x1a1411, -0.8, 0, -0.1);
  f.bar(fx, 0.96, fz, 0.4, 0.045, 0x1a1411, 1.9, 0, 0.05);
  // Some scrap timber stacked beside it for the next while.
  f.box(fx + 0.62, 0, fz + 0.1, 0.9, 0.05, 0.12, 0x6a5238, 0.5);
  f.box(fx + 0.6, 0.05, fz + 0.12, 0.8, 0.05, 0.1, 0x5c4630, 0.42);
  // (A jump gets onto it, but it is no ledge to vault: a drum is not a wall.)
  map.createFitting("deck-fire-drum", F, f.elements, [
    {
      minX: fx - 0.29,
      maxX: fx + 0.29,
      minZ: fz - 0.29,
      maxZ: fz + 0.29,
      top: 0.9,
      role: "ledge",
    },
  ]);
  map.addFireDrum({ id: "fire-drum-bridge", x: fx, y: F + 0.82, z: fz });
  map.addDecal({
    id: "decal-site-fire-soot",
    kind: "stain",
    x: fx,
    z: fz,
    y: F,
    width: 1.8,
    depth: 1.8,
    rotation: 0.4,
    color: 0x0d0c0b,
    alpha: 0.5,
  });

  // Oil under the generator and the drums.
  map.addDecal({
    id: "decal-site-deck-oil",
    kind: "stain",
    x: 24.2,
    z: -3.8,
    y: F,
    width: 2.4,
    depth: 1.4,
    rotation: 0.2,
    color: 0x14161a,
    alpha: 0.46,
  });
}
