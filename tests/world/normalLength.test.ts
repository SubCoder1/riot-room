import { describe, expect, it } from "vitest";

import {
  mulberry32,
  normalLength,
} from "../../src/world/materials/ConcreteTexture";

describe("normalLength (the length every normal map divides by)", () => {
  it("is the length of (nx, ny, 1)", () => {
    expect(normalLength(0, 0)).toBe(1);
    expect(normalLength(3, 4)).toBeCloseTo(Math.sqrt(26), 14);
    expect(normalLength(-3, 4)).toBe(normalLength(3, -4));
  });

  it("agrees with Math.hypot(nx, ny, 1) to within rounding, over the slopes a texture has", () => {
    const random = mulberry32(99);

    for (let i = 0; i < 20000; i++) {
      const nx = (random() - 0.5) * 8;
      const ny = (random() - 0.5) * 8;
      const exact = Math.hypot(nx, ny, 1);

      expect(Math.abs(normalLength(nx, ny) - exact) / exact).toBeLessThan(
        1e-15,
      );
    }
  });
});
