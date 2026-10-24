import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { Lightning } from "../../src/world/Lightning";
import { Moths } from "../../src/world/Moths";
import { NightAtmosphere } from "../../src/world/NightAtmosphere";

function seeded(seed: number): () => number {
  let a = seed;

  return () => {
    a = (a + 0x6d2b79f5) | 0;

    let t = Math.imul(a ^ (a >>> 15), 1 | a);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Runs the machine and records when each event starts. */
function run(seconds: number, seed: number) {
  const bolt = new Lightning({ random: seeded(seed) });
  const starts: number[] = [];
  let maxLevel = 0;
  let previous = 0;

  for (let t = 0; t < seconds; t += 1 / 60) {
    const level = bolt.update(1 / 60);

    expect(level).toBeGreaterThanOrEqual(0);
    expect(level).toBeLessThanOrEqual(1);

    if (level > 0 && previous === 0) {
      starts.push(t);
    }

    maxLevel = Math.max(maxLevel, level);
    previous = level;
  }

  return { bolt, starts, maxLevel };
}

describe("Lightning", () => {
  it("waits an irregular 12 to 30 seconds between events", () => {
    const { starts } = run(900, 7);
    const gaps = starts.slice(1).map((t, i) => t - starts[i]);

    expect(gaps.length).toBeGreaterThan(20);

    for (const gap of gaps) {
      // The gap is measured start to start, so it includes the short flash.
      expect(gap).toBeGreaterThan(11.9);
      expect(gap).toBeLessThan(31.5);
    }

    expect(new Set(gaps.map((g) => Math.round(g))).size).toBeGreaterThan(8);
  });

  it("varies in strength: mostly subtle, sometimes strong", () => {
    const { bolt } = run(6000, 11);
    const subtle = bolt.history.filter((p) => p < 0.75).length;
    const strong = bolt.history.filter((p) => p > 0.8).length;

    expect(subtle).toBeGreaterThan(strong);
    expect(strong).toBeGreaterThan(0);
  }, 30000);

  it("always falls back to zero and idles", () => {
    const bolt = new Lightning({ random: seeded(3) });
    let sawFlash = false;

    for (let t = 0; t < 120; t += 1 / 60) {
      bolt.update(1 / 60);
      sawFlash ||= bolt.phase !== "idle";
    }

    expect(sawFlash).toBe(true);

    // Whatever the phase, a few seconds with no new event ends at zero.
    for (let t = 0; t < 3; t += 1 / 60) {
      bolt.update(1 / 60);
    }

    expect(bolt.update(1 / 60)).toBe(0);
  });

  it("a huge frame gap does not play an event out at once", () => {
    const bolt = new Lightning({ random: seeded(5) });

    expect(() => bolt.update(60)).not.toThrow();
    expect(bolt.update(60)).toBeLessThanOrEqual(1);
  });
});

describe("NightAtmosphere", () => {
  it("raises the sky light during a flash and restores every light on dispose", () => {
    const key = new THREE.DirectionalLight(0x7487ad, 0.22);
    const hemi = new THREE.HemisphereLight(0x24304a, 0x030509, 0.5);
    const lamp = new THREE.PointLight(0xffffff, 14, 5, 2);
    const flash = { value: 0 };
    const bolt = new Lightning({ random: seeded(9), minGap: 1, maxGap: 2 });
    const night = new NightAtmosphere(key, hemi, flash, [lamp], [], bolt);
    let peak = 0;

    for (let t = 0; t < 40; t += 1 / 60) {
      night.update(1 / 60);
      peak = Math.max(peak, key.intensity);

      // The hemisphere (which reaches indoors) never moves much.
      expect(hemi.intensity).toBeLessThan(0.5 + 0.31);
      expect(flash.value).toBeLessThanOrEqual(1);
    }

    expect(peak).toBeGreaterThan(0.8);

    // Interrupted mid-event: dispose still puts everything back.
    night.dispose();

    expect(key.intensity).toBe(0.22);
    expect(hemi.intensity).toBe(0.5);
    expect(lamp.intensity).toBe(14);
    expect(flash.value).toBe(0);
    expect(key.color.getHex()).toBe(0x7487ad);
  });
});

describe("Halogen flicker", () => {
  it("dims at random times, never below zero or above base, and restores", () => {
    const key = new THREE.DirectionalLight(0x7487ad, 0.22);
    const hemi = new THREE.HemisphereLight(0x24304a, 0x030509, 0.5);
    const spot = new THREE.SpotLight(0xffffff, 80);
    const glow = new THREE.Group();
    const levels: number[] = [];

    glow.userData.setLevel = (level: number) => levels.push(level);

    const night = new NightAtmosphere(
      key,
      hemi,
      { value: 0 },
      [],
      [{ light: spot, glow }],
    );
    let min = 80;

    for (let t = 0; t < 120; t += 1 / 60) {
      night.update(1 / 60);
      min = Math.min(min, spot.intensity);

      expect(spot.intensity).toBeGreaterThan(0);
      expect(spot.intensity).toBeLessThanOrEqual(80 + 1e-9);
    }

    expect(min).toBeLessThan(70);
    expect(new Set(levels.map((l) => l.toFixed(2))).size).toBeGreaterThan(10);

    night.dispose();

    expect(spot.intensity).toBe(80);
  });
});

describe("Moths", () => {
  it("one or two per lamp, and they never stray far from it", () => {
    const lamps = [
      { position: new THREE.Vector3(0, 5, 0), aim: new THREE.Vector3(0, 0, 3) },
      {
        position: new THREE.Vector3(10, 6, 4),
        aim: new THREE.Vector3(8, 1, 4),
      },
      {
        position: new THREE.Vector3(-8, 5, 2),
        aim: new THREE.Vector3(-8, 1, 6),
      },
    ];
    const moths = new Moths(lamps);

    expect(moths.count).toBeGreaterThanOrEqual(lamps.length);
    expect(moths.count).toBeLessThanOrEqual(lamps.length * 2);

    for (let t = 0; t < 120; t += 0.05) {
      moths.update(t);

      for (const g of moths.group.children) {
        const nearest = Math.min(
          ...lamps.map((l) => g.position.distanceTo(l.position)),
        );

        expect(nearest).toBeLessThan(1.6);
      }
    }

    moths.dispose();
  });

  it("every bug flies its own path, never a copy of another", () => {
    // Several lamps at one place, so only the bugs' own randomness differs.
    const lamps = Array.from({ length: 8 }, () => ({
      position: new THREE.Vector3(0, 5, 0),
      aim: new THREE.Vector3(0, 0, 3),
    }));
    const moths = new Moths(lamps);
    const paths: THREE.Vector3[][] = moths.group.children.map(() => []);

    for (let t = 0; t < 20; t += 0.05) {
      moths.update(t);
      moths.group.children.forEach((g, i) => paths[i].push(g.position.clone()));
    }

    for (let a = 0; a < paths.length; a++) {
      for (let b = a + 1; b < paths.length; b++) {
        const apart =
          paths[a].reduce((sum, p, i) => sum + p.distanceTo(paths[b][i]), 0) /
          paths[a].length;

        expect(apart, `${a} vs ${b}`).toBeGreaterThan(0.25);
      }
    }
  });
});
