import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { blastShare, ExplosionSystem } from "../../src/combat/Explosions";
import type { CombatEvent } from "../../src/combat/CombatEvents";
import { CombatSystem } from "../../src/combat/CombatSystem";
import { GRENADE_CONFIG as C } from "../../src/combat/GrenadeConfig";
import {
  FUSES,
  PROFILES,
  ProjectileSystem,
  type ThrownItem,
} from "../../src/combat/Projectiles";
import { THROW_CONFIG } from "../../src/combat/ThrowConfig";
import {
  createThrowPath,
  perimeterClearFraction,
  traceThrowPath,
  type ThrowBounds,
  type ThrowWorld,
} from "../../src/combat/ThrowableFlight";
import { TestFighter } from "./helpers";

const STEP = 1 / 60;

/** Open ground: only the floor stops anything. */
const OPEN: ThrowWorld = { clearFraction: () => 1, surfaceY: () => 0 };

/** A wall across the whole level at z = `at` (anything crossing it is stopped). */
function wallAt(at: number): ThrowWorld {
  return {
    surfaceY: () => 0,
    clearFraction: (from, to) => {
      const a = from.z - at;
      const b = to.z - at;

      if (a === 0 || a * b > 0) {
        return 1;
      }

      return Math.abs(a) / (Math.abs(a) + Math.abs(b));
    },
  };
}

interface Scene {
  combat: CombatSystem;
  projectiles: ProjectileSystem;
  explosions: ExplosionSystem;
  thrower: TestFighter;
  victim: TestFighter;
  events: CombatEvent[];
  detonations: ThrownItem[];
  run: (seconds: number) => void;
}

/** The thrower 20 m behind a victim standing at the origin. */
function setup(world: ThrowWorld = OPEN): Scene {
  const combat = new CombatSystem();
  const thrower = new TestFighter("thrower");
  const victim = new TestFighter("victim");
  const events: CombatEvent[] = [];
  const detonations: ThrownItem[] = [];

  victim.position.set(0, 0, 0);
  thrower.position.set(0, 0, -20);
  combat.register(thrower);
  combat.register(victim);
  combat.events.subscribe((e) => events.push(e));

  const projectiles = new ProjectileSystem(combat, world);
  const explosions = new ExplosionSystem(combat, world);

  projectiles.onDetonate = (item, point) => {
    detonations.push(item);

    if (item.kind === "grenade") {
      explosions.detonate(item.ownerId, point);
    }
  };

  const run = (seconds: number): void => {
    for (let t = 0; t < seconds - 1e-9; t += STEP) {
      projectiles.update(STEP);
    }
  };

  return {
    combat,
    projectiles,
    explosions,
    thrower,
    victim,
    events,
    detonations,
    run,
  };
}

const blasts = (scene: Scene) =>
  scene.events.filter(
    (e) => e.type === "hit" && e.attackId === "grenade-blast",
  );

/** Drops a grenade at rest on the floor at (x, z) and lets the blast go off. */
function explodeAt(scene: Scene, x: number, z: number): void {
  scene.explosions.detonate("thrower", new THREE.Vector3(x, 0.06, z));
}

describe("Grenade flight: preview and real throw share one physics", () => {
  it("the aim path is exactly the path the thrown grenade takes", () => {
    const origin = new THREE.Vector3(10, 1.5, 0);
    const direction = new THREE.Vector3(0, 0.35, 1).normalize();
    const path = createThrowPath(400);

    traceThrowPath(origin, direction, OPEN, path, 1, PROFILES.grenade);

    const scene = setup();
    const item = scene.projectiles.throwProjectile(
      "grenade",
      "thrower",
      origin,
      direction,
    );

    // The same fixed steps: the n-th sample is the n-th step of the flight.
    for (let i = 1; i < path.count - 1; i++) {
      scene.projectiles.update(STEP);

      expect(item.position.distanceTo(path.points[i])).toBeLessThan(1e-6);
    }
  });

  it("flies on a gravity arc: it falls below a straight line to the crosshair", () => {
    const origin = new THREE.Vector3(10, 1.5, 0);
    const direction = new THREE.Vector3(0, 0, 1);
    const path = createThrowPath(600);

    traceThrowPath(origin, direction, OPEN, path, 1, PROFILES.grenade);

    const end = path.points[path.count - 1];

    expect(path.hitSomething).toBe(true);
    expect(end.y).toBeLessThan(0.2);
    expect(end.z).toBeGreaterThan(5);
  });
});

describe("Grenade fuse and detonation", () => {
  it("uses the configured fuse and does not go off early", () => {
    expect(FUSES.grenade).toBe(C.GRENADE_FUSE);

    const scene = setup();

    scene.projectiles.throwProjectile(
      "grenade",
      "thrower",
      new THREE.Vector3(10, 1.4, -10),
      new THREE.Vector3(0, 0.2, -1),
    );
    scene.run(C.GRENADE_FUSE - 0.2);

    expect(scene.detonations).toHaveLength(0);
    expect(scene.projectiles.active).toHaveLength(1);
  });

  it("goes off exactly once, after the fuse, and is then gone", () => {
    const scene = setup();

    scene.projectiles.throwProjectile(
      "grenade",
      "thrower",
      new THREE.Vector3(10, 1.4, -10),
      new THREE.Vector3(0, 0.2, -1),
    );
    scene.run(C.GRENADE_FUSE + 0.2);
    scene.run(5);

    expect(scene.detonations).toHaveLength(1);
    expect(scene.projectiles.active).toHaveLength(0);
    expect(scene.events.filter((e) => e.type === "explosion")).toHaveLength(1);
  });

  it("goes off where it lies, not where it was thrown", () => {
    const scene = setup();

    scene.projectiles.throwProjectile(
      "grenade",
      "thrower",
      new THREE.Vector3(10, 1.4, -10),
      new THREE.Vector3(0, 0.1, 1),
    );
    scene.run(C.GRENADE_FUSE + 0.1);

    const at = scene.detonations[0].position;

    expect(at.y).toBeLessThan(0.3);
    expect(at.z).toBeGreaterThan(-10);
  });

  it("a frame longer than a step is stepped in fixed slices (same result)", () => {
    const origin = new THREE.Vector3(10, 1.4, -10);
    const direction = new THREE.Vector3(0, 0.3, 1);
    const a = setup();
    const b = setup();
    const first = a.projectiles.throwProjectile(
      "grenade",
      "thrower",
      origin,
      direction,
    );
    const second = b.projectiles.throwProjectile(
      "grenade",
      "thrower",
      origin,
      direction,
    );

    for (let i = 0; i < 60; i++) {
      a.projectiles.update(1 / 60);
    }

    b.projectiles.update(0.5);
    b.projectiles.update(0.5);

    expect(first.position.distanceTo(second.position)).toBeLessThan(1e-6);
  });

  it("only a limited number are out at once (the oldest is dropped)", () => {
    const scene = setup();

    for (let i = 0; i < THROW_CONFIG.THROW_MAX_ACTIVE + 5; i++) {
      scene.projectiles.throwProjectile(
        "grenade",
        "thrower",
        new THREE.Vector3(10, 1.4, -10),
        new THREE.Vector3(0, 0.2, 1),
      );
    }

    expect(scene.projectiles.active).toHaveLength(
      THROW_CONFIG.THROW_MAX_ACTIVE,
    );
  });

  it("clear() removes everything and nothing goes off afterwards", () => {
    const scene = setup();

    scene.projectiles.throwProjectile(
      "grenade",
      "thrower",
      new THREE.Vector3(10, 1.4, -10),
      new THREE.Vector3(0, 0.2, 1),
    );
    scene.projectiles.clear();
    scene.run(C.GRENADE_FUSE + 1);

    expect(scene.detonations).toHaveLength(0);
    expect(scene.events.filter((e) => e.type === "explosion")).toHaveLength(0);
  });

  it("one that is thrown at the sky still comes down and goes off", () => {
    const scene = setup();

    scene.projectiles.throwProjectile(
      "grenade",
      "thrower",
      new THREE.Vector3(10, 1.4, -10),
      new THREE.Vector3(0, 1, 0.2),
    );
    scene.run(C.GRENADE_FUSE + 2);

    expect(scene.detonations).toHaveLength(1);
  });
});

describe("Grenades bounce and roll", () => {
  it("bounces off a wall instead of stopping or going off on contact", () => {
    const scene = setup(wallAt(5));
    const item = scene.projectiles.throwProjectile(
      "grenade",
      "thrower",
      new THREE.Vector3(10, 1.4, 0),
      new THREE.Vector3(0, 0.05, 1),
    );

    for (let i = 0; i < 240 && item.bounces === 0; i++) {
      scene.projectiles.update(STEP);
    }

    // It met the wall and came straight back off it.
    expect(item.bounces).toBeGreaterThan(0);
    expect(item.position.z).toBeLessThan(5.05);
    expect(item.velocity.z).toBeLessThan(0);
    expect(scene.detonations).toHaveLength(0);
    expect(scene.projectiles.active).toHaveLength(1);
  });

  it("hits the floor, rolls a little and comes to rest", () => {
    const scene = setup();
    const item = scene.projectiles.throwProjectile(
      "grenade",
      "thrower",
      new THREE.Vector3(10, 1.0, -10),
      new THREE.Vector3(0, 0, 1),
    );

    scene.run(C.GRENADE_FUSE - 0.3);

    expect(item.bounces).toBeGreaterThan(0);
    expect(item.rolling).toBe(true);
    expect(item.resting).toBe(true);
    expect(item.position.y).toBeLessThan(0.2);
    expect(item.velocity.length()).toBe(0);
  });

  it("settles on a raised surface instead of falling through it", () => {
    const platform: ThrowWorld = {
      surfaceY: () => 3,
      clearFraction: (from, to) => {
        // A slab with its top at y = 3, everywhere.
        if (from.y > 3 && to.y <= 3) {
          return (from.y - 3) / (from.y - to.y);
        }

        return 1;
      },
    };
    const scene = setup(platform);
    const item = scene.projectiles.throwProjectile(
      "grenade",
      "thrower",
      new THREE.Vector3(10, 4.5, 0),
      new THREE.Vector3(0, 0, 1),
    );

    scene.run(C.GRENADE_FUSE - 0.2);

    expect(item.position.y).toBeGreaterThan(2.9);
  });

  it("glances off a body without hurting it", () => {
    const scene = setup();
    const item = scene.projectiles.throwProjectile(
      "grenade",
      "thrower",
      new THREE.Vector3(0, 1.2, -6),
      new THREE.Vector3(0, 0, 1),
    );

    scene.run(0.7);

    expect(item.bounces).toBeGreaterThan(0);
    expect(scene.victim.health.current).toBe(scene.victim.health.max);
    expect(item.position.z).toBeLessThan(0.6);
  });
});

describe("Explosion damage", () => {
  it("is the maximum right at the centre and falls off with distance", () => {
    const near = blastShare(0);
    const middle = blastShare(C.GRENADE_BLAST_RADIUS / 2);
    const edge = blastShare(C.GRENADE_BLAST_RADIUS - 0.01);

    expect(near).toBe(1);
    expect(near).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(edge);
    expect(edge).toBeCloseTo(C.GRENADE_EDGE_DAMAGE_SHARE, 1);
    expect(blastShare(C.GRENADE_BLAST_RADIUS)).toBe(0);
    expect(blastShare(C.GRENADE_BLAST_RADIUS + 3)).toBe(0);
  });

  it("hurts someone next to it for nearly the maximum, through the health system", () => {
    const scene = setup();

    explodeAt(scene, 0.5, 0);

    const dealt = scene.victim.health.max - scene.victim.health.current;

    expect(dealt).toBeGreaterThan(C.GRENADE_MAX_DAMAGE * 0.6);
    expect(dealt).toBeLessThanOrEqual(C.GRENADE_MAX_DAMAGE);
    expect(blasts(scene)).toHaveLength(1);
  });

  it("hurts less further away and nothing beyond the radius", () => {
    const damageAt = (distance: number): number => {
      const scene = setup();

      explodeAt(scene, distance, 0);

      return scene.victim.health.max - scene.victim.health.current;
    };

    expect(damageAt(1)).toBeGreaterThan(damageAt(3));
    expect(damageAt(3)).toBeGreaterThan(damageAt(5));
    expect(damageAt(C.GRENADE_BLAST_RADIUS + 1)).toBe(0);
  });

  it("hurts each fighter once per explosion, however many body parts are in range", () => {
    const scene = setup();

    explodeAt(scene, 1, 0);

    expect(blasts(scene)).toHaveLength(1);
    expect(scene.victim.hits).toHaveLength(1);
  });

  it("pushes the target straight away from the blast and staggers it", () => {
    const scene = setup();

    explodeAt(scene, 0, -1.5);

    const hit = scene.victim.hits[0];

    expect(hit.knockback).toBeGreaterThan(0);
    expect(hit.hitstun).toBeGreaterThan(0);
    // The blast is behind (-z): the push goes forward (+z).
    expect(hit.knockbackDirection.z).toBeGreaterThan(0.9);
  });

  it("the thrower's own grenade does not hurt them by default", () => {
    const scene = setup();

    scene.thrower.position.set(0, 0, 0.5);
    explodeAt(scene, 0, 0.2);

    expect(C.GRENADE_SELF_DAMAGE_MULTIPLIER).toBe(0);
    expect(scene.thrower.health.current).toBe(scene.thrower.health.max);
  });

  it("a dead fighter is not hit again", () => {
    const scene = setup();

    scene.victim.health.damage(1000);
    explodeAt(scene, 0.5, 0);

    expect(blasts(scene)).toHaveLength(0);
  });

  it("a wall between the blast and the body stops the damage", () => {
    const scene = setup(wallAt(-1));

    // The blast is behind the wall (z = -1), the victim in front of it.
    explodeAt(scene, 0, -2);

    expect(scene.victim.health.current).toBe(scene.victim.health.max);
    expect(blasts(scene)).toHaveLength(0);
  });

  it("the same blast with nothing in the way does hurt", () => {
    const scene = setup(OPEN);

    explodeAt(scene, 0, -2);

    expect(scene.victim.health.current).toBeLessThan(scene.victim.health.max);
  });

  it("a raised guard softens the blast, but never to zero", () => {
    const open = setup();
    const guarded = setup();

    guarded.victim.blocking = true;
    explodeAt(open, 0.5, 0);
    explodeAt(guarded, 0.5, 0);

    const full = open.victim.health.max - open.victim.health.current;
    const softened = guarded.victim.health.max - guarded.victim.health.current;

    expect(softened).toBeGreaterThan(0);
    expect(softened).toBeLessThan(full);
    expect(
      guarded.events.some(
        (e) => e.type === "guard-reduced" && e.attackId === "grenade-blast",
      ),
    ).toBe(true);
  });

  it("a grenade thrown at someone goes off after the fuse and hurts them once", () => {
    const scene = setup();

    // Thrown short of the victim so it lands near them (it rolls the rest).
    scene.projectiles.throwProjectile(
      "grenade",
      "thrower",
      new THREE.Vector3(0, 1.3, -4),
      new THREE.Vector3(0, -0.05, 1),
    );
    scene.run(C.GRENADE_FUSE + 3);

    expect(scene.detonations).toHaveLength(1);
    expect(blasts(scene).length).toBeLessThanOrEqual(1);
  });
});

describe("The outer wall stops grenades too", () => {
  const bounds: ThrowBounds = { halfX: 32, halfZ: 24, height: 13 };
  const walled: ThrowWorld = {
    surfaceY: () => 0,
    clearFraction: (from, to) => perimeterClearFraction(from, to, bounds),
  };

  it("a line that stays inside is clear, one that goes through the wall is cut at it", () => {
    const inside = perimeterClearFraction(
      new THREE.Vector3(0, 2, 0),
      new THREE.Vector3(20, 2, 10),
      bounds,
    );
    const through = perimeterClearFraction(
      new THREE.Vector3(20, 2, 0),
      new THREE.Vector3(40, 2, 0),
      bounds,
    );

    expect(inside).toBe(1);
    expect(through).toBeCloseTo(0.6, 1);
  });

  it("each of the four sides works, and above the wall it is open sky", () => {
    const hit = (to: [number, number, number]): number =>
      perimeterClearFraction(
        new THREE.Vector3(0, 2, 0),
        new THREE.Vector3(...to),
        bounds,
      );

    expect(hit([50, 2, 0])).toBeLessThan(1);
    expect(hit([-50, 2, 0])).toBeLessThan(1);
    expect(hit([0, 2, 40])).toBeLessThan(1);
    expect(hit([0, 2, -40])).toBeLessThan(1);
    expect(
      perimeterClearFraction(
        new THREE.Vector3(0, 20, 0),
        new THREE.Vector3(60, 20, 0),
        bounds,
      ),
    ).toBe(1);
  });

  it("a grenade thrown at the outer wall bounces back and stays in the map", () => {
    const scene = setup(walled);
    const item = scene.projectiles.throwProjectile(
      "grenade",
      "thrower",
      new THREE.Vector3(25, 5, 10),
      new THREE.Vector3(1, 0.1, 0),
    );
    let farthest = 0;

    for (let i = 0; i < 400 && scene.projectiles.active.length > 0; i++) {
      scene.projectiles.update(STEP);
      farthest = Math.max(farthest, Math.abs(item.position.x));
    }

    expect(farthest).toBeLessThan(32);
    expect(item.bounces).toBeGreaterThan(0);
  });

  it("a smoke canister thrown at it does the same, on every side", () => {
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const scene = setup(walled);
      const item = scene.projectiles.throwProjectile(
        "smoke",
        "thrower",
        new THREE.Vector3(dx * 20, 4, dz * 14),
        new THREE.Vector3(dx, 0.1, dz),
      );
      let farthestX = 0;
      let farthestZ = 0;

      for (let i = 0; i < 300 && scene.projectiles.active.length > 0; i++) {
        scene.projectiles.update(STEP);
        farthestX = Math.max(farthestX, Math.abs(item.position.x));
        farthestZ = Math.max(farthestZ, Math.abs(item.position.z));
      }

      expect(farthestX).toBeLessThan(32);
      expect(farthestZ).toBeLessThan(24);
    }
  });
});
