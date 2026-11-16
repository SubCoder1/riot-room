/** Where a texture is damaged: the dark inside of a fracture or chip and its pale broken edge, 0 to 1 each. */
export interface FractureMaps {
  dark: Float32Array;
  light: Float32Array;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);

  return t * t * (3 - 2 * t);
};

/**
 * Damage for a seamless texture, drawn as damaged concrete and not as lines
 * on it. There are no branches and nothing forks:
 *
 *  - impacts: a ragged chip (dark inside, flecked with pale aggregate, a pale
 *    broken rim) with a few short, separate fractures running out of it, each
 *    a straight, jagged stretch with gaps in it;
 *  - the odd longer fracture: three or four straight stretches along a stress
 *    direction (near vertical, or a diagonal), kinked where they meet, broken
 *    by gaps, bitten wider by a chip or two;
 *  - spalled patches: a larger piece of the surface gone.
 *
 * The damage is uneven over the tile: a low-frequency field says where the
 * wall is hurt, and sites start only there, so a lightly hurt area gets a few
 * small chips and a heavy one several impacts and a long fracture, while the
 * rest is left whole. `count` is the most sites a tile holds (the textures'
 * existing `cracks` option) and `damage` the seamless field (0 to 1).
 */
export function buildFractures(
  size: number,
  random: () => number,
  count: number,
  damage: Float32Array,
): FractureMaps {
  const dark = new Float32Array(size * size);
  const light = new Float32Array(size * size);

  if (count <= 0) {
    return { dark, light };
  }

  const wrap = (v: number): number => ((Math.round(v) % size) + size) % size;
  const darken = (x: number, y: number, amount: number): void => {
    const i = wrap(y) * size + wrap(x);

    dark[i] = Math.max(dark[i], amount);
  };
  const brighten = (x: number, y: number, amount: number): void => {
    const i = wrap(y) * size + wrap(x);

    light[i] = Math.max(light[i], amount);
  };

  // A ragged bite: dark inside with a few pale flecks of aggregate, a pale rim.
  const chip = (cx: number, cy: number, radius: number): void => {
    const sectors = 6;
    const lobes: number[] = [];

    for (let k = 0; k < sectors; k++) {
      lobes.push(0.45 + 0.8 * random());
    }

    // Longer one way than the other, as a piece breaks away.
    const aspect = 0.6 + random() * 0.8;
    const turn = random() * Math.PI;

    for (let oy = -radius * 1.8; oy <= radius * 1.8; oy++) {
      for (let ox = -radius * 1.8; ox <= radius * 1.8; ox++) {
        const dx = (ox * Math.cos(turn) + oy * Math.sin(turn)) / aspect;
        const dy = -ox * Math.sin(turn) + oy * Math.cos(turn);
        const sector = Math.floor(
          ((Math.atan2(dy, dx) / (Math.PI * 2) + 0.5) % 1) * sectors,
        );
        const edge = radius * lobes[sector];
        const d = Math.hypot(dx, dy);

        if (d < edge) {
          darken(cx + ox, cy + oy, 0.7);

          // Aggregate showing in what is missing.
          if (random() < 0.07) {
            brighten(cx + ox, cy + oy, 0.55);
          }
        } else if (d < edge + 1.6) {
          brighten(cx + ox, cy + oy, 0.7);
        }
      }
    }
  };

  // One straight, jagged stretch (a fracture): a pixel or so of jitter about
  // the line, thin at the end, with gaps where it is not through.
  const stretch = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    width: number,
    gappy: boolean,
  ): void => {
    const length = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(length * 2));
    const nx = -(y1 - y0) / length;
    const ny = (x1 - x0) / length;
    let gap = 0;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;

      if (gappy) {
        if (gap > 0) {
          gap--;
          continue;
        }

        if (random() < 0.012) {
          gap = 4 + Math.floor(random() * 10);
          continue;
        }
      }

      const jitter = (random() - 0.5) * 1.6;
      const x = x0 + (x1 - x0) * t + nx * jitter;
      const y = y0 + (y1 - y0) * t + ny * jitter;
      const w = Math.max(0.6, width * (1 - 0.45 * t));

      for (let o = -w / 2; o <= w / 2; o += 0.5) {
        darken(x + nx * o, y + ny * o, 1);
      }

      if (w > 1.3 && random() < 0.5) {
        brighten(x + nx * (w / 2 + 1), y + ny * (w / 2 + 1), 0.55);
      }
    }
  };

  const wanted = Math.ceil(count * 0.6);
  let made = 0;

  for (let n = 0; n < wanted * 8 && made < wanted; n++) {
    const x = random() * size;
    const y = random() * size;
    const hurt = damage[wrap(y) * size + wrap(x)];
    const severity = smooth(0.45, 0.75, hurt);

    // Sites start only in the hurt parts of the tile.
    if (severity <= 0 || random() > severity + 0.1) {
      continue;
    }

    made++;

    const kind = random();

    if (kind < 0.62) {
      // An impact: a chip with a few short separate fractures out of it.
      const radius = 2.5 + severity * 5 + random() * 3;

      chip(x, y, radius);

      const rays = 1 + Math.floor(random() * 2);

      for (let j = 0; j < rays; j++) {
        const angle = random() * Math.PI * 2;
        const start = radius * 0.8;
        const length = radius * (1.2 + random() * 2) + severity * 6;

        stretch(
          x + Math.cos(angle) * start,
          y + Math.sin(angle) * start,
          x + Math.cos(angle) * (start + length),
          y + Math.sin(angle) * (start + length),
          1 + severity * 0.8,
          true,
        );
      }
    } else if (kind < 0.88 && severity > 0.35) {
      // A longer fracture: straight stretches kinked where they meet, along
      // a stress direction, with gaps and a chip or two where it opens.
      const heading =
        random() < 0.55
          ? Math.PI / 2 + (random() - 0.5) * 0.3
          : (random() < 0.5 ? 0.75 : 2.39) + (random() - 0.5) * 0.3;
      const sections = 3 + Math.floor(random() * 2);
      let px = x;
      let py = y;

      for (let k = 0; k < sections; k++) {
        const angle = heading + (random() - 0.5) * 0.35;
        const length = 20 + random() * 36 + severity * 20;
        const qx = px + Math.cos(angle) * length;
        const qy = py + Math.sin(angle) * length;

        // (A stretch is missing now and then.)
        if (random() > 0.2) {
          stretch(px, py, qx, qy, 1.2 + severity * 1.2, true);
        }

        if (k > 0 && random() < 0.5) {
          chip(px, py, 2 + random() * 3);
        }

        px = qx;
        py = qy;
      }
    } else {
      // A spalled patch: a larger piece of the surface gone.
      chip(x, y, 6 + severity * 8 + random() * 4);
    }
  }

  return { dark, light };
}
