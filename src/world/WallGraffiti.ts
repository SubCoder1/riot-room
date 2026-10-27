import * as THREE from "three";

import type { GraffitiDefinition } from "./ArenaLayout";

/**
 * Spray paint on a wall: each piece is drawn once on a canvas (wobbling strokes
 * of uneven width, overspray, drips, a worn and speckled finish) and hung as a
 * transparent plane a hair off the wall, so it reads as paint on the brick and
 * not as lettering built out of boxes. Drawn only: nothing here is solid.
 */

/** Crude one-stroke letters on a 1 x 2 grid: [x0, y0, x1, y1] segments. */
type Seg = readonly [number, number, number, number];

const GLYPHS: Record<string, readonly Seg[]> = {
  K: [
    [0, 0, 0, 2],
    [1, 2, 0, 1],
    [0, 1, 1, 0],
  ],
  R: [
    [0, 0, 0, 2],
    [0, 2, 1, 2],
    [1, 2, 1, 1],
    [1, 1, 0, 1],
    [0.3, 1, 1, 0],
  ],
  O: [
    [0, 0, 0, 2],
    [0, 2, 1, 2],
    [1, 2, 1, 0],
    [1, 0, 0, 0],
  ],
  W: [
    [0, 2, 0.25, 0],
    [0.25, 0, 0.5, 1.2],
    [0.5, 1.2, 0.75, 0],
    [0.75, 0, 1, 2],
  ],
  C: [
    [1, 2, 0, 2],
    [0, 2, 0, 0],
    [0, 0, 1, 0],
  ],
  P: [
    [0, 0, 0, 2],
    [0, 2, 1, 2],
    [1, 2, 1, 1],
    [1, 1, 0, 1],
  ],
  S: [
    [1, 2, 0, 2],
    [0, 2, 0, 1],
    [0, 1, 1, 1],
    [1, 1, 1, 0],
    [1, 0, 0, 0],
  ],
  E: [
    [0, 0, 0, 2],
    [0, 2, 1, 2],
    [0, 1, 0.8, 1],
    [0, 0, 1, 0],
  ],
  U: [
    [0, 2, 0, 0],
    [0, 0, 1, 0],
    [1, 0, 1, 2],
  ],
  T: [
    [0, 2, 1, 2],
    [0.5, 2, 0.5, 0],
  ],
  F: [
    [0, 0, 0, 2],
    [0, 2, 1, 2],
    [0, 1, 0.8, 1],
  ],
  N: [
    [0, 0, 0, 2],
    [0, 2, 1, 0],
    [1, 0, 1, 2],
  ],
  X: [
    [0, 0, 1, 2],
    [0, 2, 1, 0],
  ],
  "1": [
    [0.2, 1.6, 0.55, 2],
    [0.55, 2, 0.55, 0],
  ],
  "8": [
    [0, 0, 0, 1],
    [0, 1, 1, 1],
    [1, 1, 1, 0],
    [1, 0, 0, 0],
    [0, 1, 0, 2],
    [0, 2, 1, 2],
    [1, 2, 1, 1],
  ],
  "7": [
    [0, 2, 1, 2],
    [1, 2, 0.35, 0],
  ],
};

function rng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state / 4294967296;
  };
}

const hex = (color: number, alpha: number): string =>
  `rgba(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}, ${alpha})`;

interface Pen {
  ctx: CanvasRenderingContext2D;
  random: () => number;
  /** Pixels per world metre. */
  scale: number;
}

/** One wobbling stroke from (x0, y0) to (x1, y1) in canvas pixels. */
function line(
  pen: Pen,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  color: number,
  alpha: number,
): void {
  const { ctx, random } = pen;
  const steps = Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) / 14));
  const wobble = width * 0.35;
  let px: number;
  let py: number;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Overspray first: a wide, soft, faint pass; then the body of the stroke.
  for (const [mult, a, blur] of [
    [1.8, 0.07, width * 0.4],
    [1.0, 1, width * 0.08],
  ] as const) {
    px = x0;
    py = y0;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const nx =
        x0 + (x1 - x0) * t + (i < steps ? (random() - 0.5) * wobble : 0);
      const ny =
        y0 + (y1 - y0) * t + (i < steps ? (random() - 0.5) * wobble : 0);

      ctx.strokeStyle = hex(color, alpha * a);
      ctx.shadowColor = hex(color, alpha * a);
      ctx.shadowBlur = blur;
      ctx.lineWidth = width * mult * (0.75 + random() * 0.5);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      px = nx;
      py = ny;
    }
  }

  ctx.shadowBlur = 0;
}

/** A rough ring (an ellipse drawn as short wobbling strokes). */
function ring(
  pen: Pen,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  width: number,
  color: number,
  alpha: number,
  from = 0,
  to = Math.PI * 2,
): void {
  const steps = 22;

  for (let i = 0; i < steps; i++) {
    const a0 = from + ((to - from) * i) / steps;
    const a1 = from + ((to - from) * (i + 1)) / steps;

    line(
      pen,
      cx + Math.cos(a0) * rx,
      cy + Math.sin(a0) * ry,
      cx + Math.cos(a1) * rx,
      cy + Math.sin(a1) * ry,
      width,
      color,
      alpha,
    );
  }
}

/** Paint that ran: a thin tapering line down from a point, ending in a drop. */
function drip(
  pen: Pen,
  x: number,
  y: number,
  length: number,
  width: number,
  color: number,
  alpha: number,
): void {
  const { ctx } = pen;
  const steps = 8;

  ctx.lineCap = "round";

  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;

    ctx.strokeStyle = hex(color, alpha);
    ctx.lineWidth = Math.max(1.2, width * (1 - t0 * 0.6));
    ctx.beginPath();
    ctx.moveTo(x, y + length * t0);
    ctx.lineTo(x, y + length * t1);
    ctx.stroke();
  }

  ctx.fillStyle = hex(color, alpha);
  ctx.beginPath();
  ctx.ellipse(x, y + length, width * 0.55, width * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Letters in strokes, slanted and uneven, with the odd drip; returns the width used. */
function lettering(
  pen: Pen,
  text: string,
  x: number,
  y: number,
  height: number,
  width: number,
  color: number,
  alpha: number,
  slant: number,
  drips: number,
): number {
  const { random } = pen;
  const letter = height * 0.55;
  const advance = height * 0.82;
  let cursor = x;

  for (const ch of text) {
    const glyph = GLYPHS[ch];

    if (glyph) {
      const scale = 0.9 + random() * 0.25;
      const rise = (random() - 0.5) * height * 0.08;

      for (const [x0, y0, x1, y1] of glyph) {
        // Canvas y runs down: a glyph's y = 0 is the baseline.
        const ax = cursor + x0 * letter + (y0 / 2) * height * slant;
        const ay = y + height - (y0 * height * scale) / 2 + rise;
        const bx = cursor + x1 * letter + (y1 / 2) * height * slant;
        const by = y + height - (y1 * height * scale) / 2 + rise;

        line(pen, ax, ay, bx, by, width * (0.8 + random() * 0.5), color, alpha);

        if (y1 === 0 && random() < drips) {
          drip(
            pen,
            bx,
            by,
            height * (0.25 + random() * 0.6),
            width * 0.35,
            color,
            alpha * 0.85,
          );
        }
      }
    }

    cursor += advance;
  }

  return cursor - x;
}

/** What `kind` of mark is drawn, and on which colours. */
/** Damp rising from the foot of a wall: dark at the bottom, a ragged tide line above. */
function paintDamp(pen: Pen, w: number, h: number): void {
  const { ctx, random } = pen;
  const g = ctx.createLinearGradient(0, h, 0, 0);

  g.addColorStop(0, "rgba(6, 8, 8, 0.6)");
  g.addColorStop(0.4, "rgba(8, 10, 10, 0.34)");
  g.addColorStop(1, "rgba(8, 10, 10, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Ragged top: wet runs reach up the wall in places, stop short in others.
  ctx.globalCompositeOperation = "destination-out";

  for (let i = 0; i < 90; i++) {
    const x = random() * w;
    const bar = 5 + random() * 30;
    const reach = h * (0.05 + random() * 0.6);

    ctx.fillStyle = `rgba(0, 0, 0, ${0.3 + random() * 0.5})`;
    ctx.fillRect(x, 0, bar, reach);
  }

  ctx.globalCompositeOperation = "source-over";

  // Pale mineral bloom along the tide line, and a few dark drips.
  for (let i = 0; i < 26; i++) {
    const x = random() * w;
    const y = h * (0.35 + random() * 0.4);

    ctx.fillStyle = `rgba(150, 150, 140, ${0.05 + random() * 0.08})`;
    ctx.fillRect(x, y, 2 + random() * 10, 1 + random() * 2);
  }
}

/** Water that has run down a wall from above: thin dark streaks, one faintly rust. */
function paintStreaks(pen: Pen, w: number, h: number): void {
  const { ctx, random } = pen;
  const blot = ctx.createRadialGradient(w * 0.5, 0, 0, w * 0.5, 0, w * 0.45);

  blot.addColorStop(0, "rgba(8, 9, 9, 0.5)");
  blot.addColorStop(1, "rgba(8, 9, 9, 0)");
  ctx.fillStyle = blot;
  ctx.fillRect(0, 0, w, h * 0.4);

  for (let i = 0; i < 9; i++) {
    const x = w * (0.2 + random() * 0.6);
    const width = 3 + random() * 8;
    const length = h * (0.3 + random() * 0.65);
    const rust = i === 3;
    const rgb = rust ? "70, 42, 28" : "8, 9, 9";
    const g = ctx.createLinearGradient(0, 0, 0, length);

    g.addColorStop(0, `rgba(${rgb}, ${rust ? 0.3 : 0.42})`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.strokeStyle = g;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(
      x + (random() - 0.5) * 24,
      length * 0.5,
      x + (random() - 0.5) * 30,
      length,
    );
    ctx.stroke();
  }
}

/** A smudge of soot: a dark cloud that thins upward and out. */
function paintSoot(pen: Pen, w: number, h: number): void {
  const { ctx, random } = pen;

  for (let i = 0; i < 7; i++) {
    const x = w * (0.3 + random() * 0.4);
    const y = h * (0.55 + random() * 0.35);
    const r = Math.min(w, h) * (0.25 + random() * 0.3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);

    g.addColorStop(0, "rgba(6, 6, 6, 0.32)");
    g.addColorStop(1, "rgba(6, 6, 6, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function paint(pen: Pen, def: GraffitiDefinition, w: number, h: number): void {
  const { ctx, random } = pen;
  const text = def.text ?? "";
  const CREAM = 0xcbbf9f;
  const RED = 0x8a2f26;
  const ORANGE = 0xa8602e;
  const CHAR = 0x17181b;

  switch (def.kind) {
    case "damp":
      paintDamp(pen, w, h);
      break;
    case "streaks":
      paintStreaks(pen, w, h);
      break;
    case "soot":
      paintSoot(pen, w, h);
      break;
    case "tag": {
      // An older, faded layer beneath: a muted orange mark half painted over.
      lettering(
        pen,
        text,
        w * 0.1,
        h * 0.12,
        h * 0.7,
        h * 0.05,
        ORANGE,
        0.13,
        0.1,
        0.1,
      );
      ctx.save();
      ctx.translate(w * 0.02, h * 0.03);
      // The red shadow of the tag, then the cream body on top of it.
      lettering(
        pen,
        text,
        w * 0.09,
        h * 0.2,
        h * 0.58,
        h * 0.06,
        RED,
        0.55,
        0.18,
        0.4,
      );
      ctx.restore();
      lettering(
        pen,
        text,
        w * 0.09,
        h * 0.18,
        h * 0.58,
        h * 0.055,
        CREAM,
        0.92,
        0.18,
        0.55,
      );
      // An underline swoosh and a smaller flick.
      line(pen, w * 0.07, h * 0.86, w * 0.9, h * 0.78, h * 0.04, RED, 0.8);
      line(pen, w * 0.2, h * 0.93, w * 0.62, h * 0.9, h * 0.02, RED, 0.6);
      break;
    }

    case "hand": {
      lettering(
        pen,
        text,
        w * 0.06,
        h * 0.15,
        h * 0.62,
        h * 0.05,
        CREAM,
        0.85,
        0.22,
        0.5,
      );
      line(pen, w * 0.05, h * 0.9, w * 0.7, h * 0.86, h * 0.03, CREAM, 0.6);
      break;
    }

    case "cross": {
      // A name, then slashed out in red.
      lettering(
        pen,
        text,
        w * 0.08,
        h * 0.25,
        h * 0.5,
        h * 0.05,
        CHAR,
        0.75,
        0.1,
        0.2,
      );
      lettering(
        pen,
        text,
        w * 0.085,
        h * 0.255,
        h * 0.5,
        h * 0.034,
        CREAM,
        0.7,
        0.1,
        0.3,
      );
      line(pen, w * 0.04, h * 0.2, w * 0.95, h * 0.82, h * 0.075, RED, 0.9);
      line(pen, w * 0.05, h * 0.84, w * 0.94, h * 0.18, h * 0.07, RED, 0.9);
      break;
    }

    case "warning": {
      lettering(
        pen,
        text,
        w * 0.05,
        h * 0.2,
        h * 0.55,
        h * 0.06,
        CREAM,
        0.7,
        0.05,
        0.35,
      );
      break;
    }

    case "crown": {
      const pts: Array<[number, number]> = [
        [0.12, 0.62],
        [0.12, 0.28],
        [0.3, 0.46],
        [0.5, 0.18],
        [0.7, 0.46],
        [0.88, 0.28],
        [0.88, 0.62],
        [0.12, 0.62],
      ];

      for (let i = 1; i < pts.length; i++) {
        line(
          pen,
          pts[i - 1][0] * w,
          pts[i - 1][1] * h,
          pts[i][0] * w,
          pts[i][1] * h,
          h * 0.06,
          RED,
          0.85,
        );
      }

      line(pen, w * 0.1, h * 0.76, w * 0.9, h * 0.74, h * 0.04, RED, 0.7);

      for (const x of [0.12, 0.5, 0.88]) {
        drip(
          pen,
          x * w,
          h * 0.74,
          h * (0.1 + random() * 0.2),
          h * 0.022,
          RED,
          0.7,
        );
      }

      break;
    }

    case "target": {
      // A crosshair in a ring, with ticks, a dot, and a broken second ring.
      const cx = w * 0.5;
      const cy = h * 0.5;
      const r = Math.min(w, h) * 0.34;

      ring(pen, cx, cy, r, r, h * 0.035, CREAM, 0.8);
      ring(pen, cx, cy, r * 1.25, r * 1.25, h * 0.022, CREAM, 0.55, 0.3, 4.2);
      line(pen, cx, cy - r * 1.5, cx, cy + r * 1.5, h * 0.03, CREAM, 0.8);
      line(pen, cx - r * 1.5, cy, cx + r * 1.5, cy, h * 0.03, CREAM, 0.8);
      line(
        pen,
        cx - r * 0.6,
        cy + r * 0.7,
        cx + r * 0.8,
        cy - r * 0.5,
        h * 0.02,
        CREAM,
        0.6,
      );
      ring(pen, cx, cy, h * 0.03, h * 0.03, h * 0.04, RED, 0.85);
      drip(pen, cx - r * 0.2, cy + r, h * 0.2, h * 0.02, CREAM, 0.7);
      break;
    }

    case "skull": {
      // A skull: round cranium, hollow eyes, a nose and a row of teeth.
      const cx = w * 0.5;
      const cy = h * 0.4;
      const r = Math.min(w * 0.4, h * 0.3);

      ring(
        pen,
        cx,
        cy,
        r,
        r * 1.05,
        h * 0.04,
        CREAM,
        0.85,
        Math.PI * 0.85,
        Math.PI * 2.15,
      );
      line(
        pen,
        cx - r * 0.75,
        cy + r * 0.75,
        cx - r * 0.55,
        cy + r * 1.35,
        h * 0.04,
        CREAM,
        0.85,
      );
      line(
        pen,
        cx + r * 0.75,
        cy + r * 0.75,
        cx + r * 0.55,
        cy + r * 1.35,
        h * 0.04,
        CREAM,
        0.85,
      );
      line(
        pen,
        cx - r * 0.55,
        cy + r * 1.35,
        cx + r * 0.55,
        cy + r * 1.35,
        h * 0.04,
        CREAM,
        0.85,
      );
      ring(
        pen,
        cx - r * 0.38,
        cy + r * 0.1,
        r * 0.2,
        r * 0.26,
        h * 0.05,
        CHAR,
        0.9,
      );
      ring(
        pen,
        cx + r * 0.38,
        cy + r * 0.1,
        r * 0.2,
        r * 0.26,
        h * 0.05,
        CHAR,
        0.9,
      );
      line(
        pen,
        cx,
        cy + r * 0.45,
        cx - r * 0.08,
        cy + r * 0.7,
        h * 0.03,
        CHAR,
        0.85,
      );

      for (let k = -2; k <= 2; k++) {
        line(
          pen,
          cx + k * r * 0.2,
          cy + r * 1.0,
          cx + k * r * 0.2,
          cy + r * 1.33,
          h * 0.025,
          CREAM,
          0.75,
        );
      }

      drip(pen, cx - r * 0.3, cy + r * 1.35, h * 0.25, h * 0.025, CREAM, 0.7);
      drip(pen, cx + r * 0.2, cy + r * 1.35, h * 0.14, h * 0.02, CREAM, 0.7);
      break;
    }

    case "claws": {
      // Four raking scratches, as if made by a hand.
      for (let k = 0; k < 4; k++) {
        const x0 = w * (0.2 + k * 0.17) + (random() - 0.5) * 8;

        line(
          pen,
          x0,
          h * 0.1,
          x0 + w * (0.08 + random() * 0.05),
          h * 0.9,
          h * 0.03,
          CREAM,
          0.75,
        );
      }

      break;
    }

    case "rules": {
      // "NO" over "RULES", then a big X beneath, faded.
      lettering(
        pen,
        "NO",
        w * 0.3,
        h * 0.04,
        h * 0.28,
        h * 0.026,
        CREAM,
        0.7,
        0.05,
        0.3,
      );
      lettering(
        pen,
        "RULES",
        w * 0.08,
        h * 0.36,
        h * 0.28,
        h * 0.026,
        CREAM,
        0.7,
        0.05,
        0.4,
      );
      line(pen, w * 0.38, h * 0.72, w * 0.62, h * 0.98, h * 0.03, CREAM, 0.7);
      line(pen, w * 0.62, h * 0.72, w * 0.38, h * 0.98, h * 0.03, CREAM, 0.7);
      break;
    }

    case "tally": {
      const groups = Math.max(1, Math.round(def.count ?? 2));
      const gw = w / groups;

      for (let g = 0; g < groups; g++) {
        const x0 = g * gw + gw * 0.12;

        for (let k = 0; k < 4; k++) {
          const x = x0 + k * gw * 0.16;

          line(
            pen,
            x + (random() - 0.5) * 3,
            h * 0.2,
            x + (random() - 0.5) * 6,
            h * 0.8,
            h * 0.035,
            CREAM,
            0.8,
          );
        }

        line(
          pen,
          x0 - gw * 0.06,
          h * 0.7,
          x0 + gw * 0.62,
          h * 0.28,
          h * 0.035,
          CREAM,
          0.8,
        );
      }

      break;
    }
  }
}

/** Wears the finished paint: scuffs, flaking and damp patches rubbed out of it. */
function weather(pen: Pen, w: number, h: number, fade: number): void {
  const { ctx, random } = pen;

  ctx.globalCompositeOperation = "destination-out";

  for (let i = 0; i < 36; i++) {
    const x = random() * w;
    const y = random() * h;
    const r = (0.04 + random() * 0.14) * Math.min(w, h);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);

    g.addColorStop(0, `rgba(0, 0, 0, ${0.25 + random() * 0.45})`);
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Fine flaking, and brick mortar lines the paint never quite filled.
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = `rgba(0, 0, 0, ${0.3 + random() * 0.5})`;
    ctx.fillRect(
      random() * w,
      random() * h,
      1 + random() * 3,
      1 + random() * 2,
    );
  }

  for (let y = h * 0.07; y < h; y += h * 0.12) {
    ctx.fillStyle = `rgba(0, 0, 0, ${0.3 * fade})`;
    ctx.fillRect(0, y + (random() - 0.5) * 3, w, 1.5 + random());
  }

  ctx.globalCompositeOperation = "source-over";
}

/** Draws one piece; null where there is no canvas to draw on (tests, no DOM). */
export function createGraffitiTexture(
  def: GraffitiDefinition,
): THREE.CanvasTexture | null {
  if (typeof document === "undefined") {
    return null;
  }

  const w = 1024;
  const h = Math.max(128, Math.round((1024 * def.height) / def.width));
  const canvas = document.createElement("canvas");

  canvas.width = w;
  canvas.height = h;

  let ctx: CanvasRenderingContext2D | null;

  try {
    ctx = canvas.getContext("2d");
  } catch {
    ctx = null;
  }

  if (!ctx) {
    return null;
  }

  const pen: Pen = { ctx, random: rng(def.seed), scale: w / def.width };

  paint(pen, def, w, h);
  weather(pen, w, h, def.fade ?? 0.6);

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  return texture;
}

/** A graffiti plane a hair off its wall, facing into the room. */
export function createGraffiti(def: GraffitiDefinition): THREE.Mesh | null {
  const map = createGraffitiTexture(def);

  if (!map) {
    return null;
  }

  const material = new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    color: 0xb4b2ac,
    roughness: 0.95,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(def.width, def.height),
    material,
  );

  mesh.name = `graffiti:${def.id}`;
  mesh.position.set(def.x + def.nx * 0.02, def.y, def.z + def.nz * 0.02);
  mesh.rotation.y = Math.atan2(def.nx, def.nz);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;

  return mesh;
}
