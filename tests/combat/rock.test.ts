import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { ATTACKS } from "../../src/combat/AttackDefinitions";
import type { CombatEvent } from "../../src/combat/CombatEvents";
import { CombatSystem } from "../../src/combat/CombatSystem";
import { ProjectileSystem } from "../../src/combat/Projectiles";
import { ROCK_CONFIG, rockDamageFor } from "../../src/combat/RockConfig";
import {
  createRockPath,
  traceRockPath,
  type RockWorld,
} from "../../src/combat/RockFlight";
import { TestFighter } from "./helpers";

const OPEN: RockWorld = { clearFraction: () => 1 };

const BODY = ATTACKS["flying-light-punch"].damage;
const HEAVY = ATTACKS["heavy-run-punch"].damage;

/** Direction from `origin` to `point` (the throw is dead straight at this range). */
function lead(origin: THREE.Vector3, point: THREE.Vector3): THREE.Vector3 {
  return point.clone().sub(origin).normalize();
}

interface Setup {
  combat: CombatSystem;
  projectiles: ProjectileSystem;
  thrower: TestFighter;
  target: TestFighter;
  events: CombatEvent[];
  /** Throws at a body part and flies the rock out; returns the target's damage. */
  throwAt: (part: "head" | "torso" | "legs") => number;
}

/** Thrower at the origin facing +z; target 10 m ahead, facing back at them. */
function setup(world: RockWorld = OPEN): Setup {
  const combat = new CombatSystem();
  const thrower = new TestFighter("thrower");
  const target = new TestFighter("target");
  const events: CombatEvent[] = [];

  target.position.set(0, 0, 10);
  target.yaw = Math.PI;
  combat.register(thrower);
  combat.register(target);
  combat.events.subscribe((e) => events.push(e));

  const projectiles = new ProjectileSystem(combat, world);
  const height = { head: 1.6, torso: 1.2, legs: 0.5 };

  const throwAt = (part: "head" | "torso" | "legs"): number => {
    const origin = new THREE.Vector3(0, 1.4, 0.4);
    const point = new THREE.Vector3(0, height[part], 10);
    const before = target.health.current;

    projectiles.throwRock("thrower", origin, lead(origin, point));

    for (let i = 0; i < 240 && projectiles.active.length > 0; i++) {
      projectiles.update(1 / 60);
    }

    return before - target.health.current;
  };

  return { combat, projectiles, thrower, target, events, throwAt };
}

describe("Rock flight: preview and real rock share one physics", () => {
  it("the aim path is exactly the path the thrown rock takes", () => {
    const { projectiles } = setup();
    const origin = new THREE.Vector3(1, 1.5, 2);
    const direction = new THREE.Vector3(0.3, 0.12, 1).normalize();
    const path = createRockPath(256);

    traceRockPath(origin, direction, OPEN, path, 1);
    const rock = projectiles.throwRock("thrower", origin, direction);

    // One fixed step at a time: the rock must sit on each previewed point.
    for (let i = 1; i < Math.min(path.count, 40); i++) {
      projectiles.update(ROCK_CONFIG.ROCK_STEP);
      expect(rock.position.distanceTo(path.points[i])).toBeLessThan(1e-5);
    }
  });

  it("goes mostly straight at close range, dips at medium range, drops at long range", () => {
    const path = createRockPath(256);

    traceRockPath(
      new THREE.Vector3(0, 8, 0),
      new THREE.Vector3(0, 0, 1),
      OPEN,
      path,
      1,
    );

    const dropAt = (z: number): number => {
      const point = path.points.slice(0, path.count).find((p) => p.z >= z);

      return 8 - (point?.y ?? 0);
    };

    // Dead straight out to the start of the dip...
    expect(dropAt(3)).toBeLessThan(0.001);
    expect(dropAt(10)).toBeLessThan(0.05);
    // ...then a gradual dip, and a clear drop at long range.
    expect(dropAt(20)).toBeGreaterThan(0.1);
    expect(dropAt(20)).toBeLessThan(1);
    expect(dropAt(30)).toBeGreaterThan(0.6);
    // Never a rainbow: still travelling forward the whole way.
    expect(path.points[path.count - 1].z).toBeGreaterThan(30);
  });

  it("a rock thrown at the sky keeps flying and comes down, it does not vanish mid-air", () => {
    const scene = setup();
    const rock = scene.projectiles.throwRock(
      "thrower",
      new THREE.Vector3(0, 1.5, 0),
      new THREE.Vector3(1, 0.7, 0).normalize(),
    );
    let apex = 0;
    let lastY = 1.5;

    for (let i = 0; i < 600 && scene.projectiles.active.includes(rock); i++) {
      scene.projectiles.update(1 / 60);
      apex = Math.max(apex, rock.position.y);
      lastY = rock.position.y;
    }

    // It went up, then came back down to the floor before being removed.
    expect(apex).toBeGreaterThan(10);
    expect(lastY).toBeLessThan(1);
    expect(scene.projectiles.active).not.toContain(rock);
  });

  it("the preview ends where scenery stops it", () => {
    const wall: RockWorld = {
      clearFraction: (from, to) =>
        to.z > 8 && from.z <= 8 ? (8 - from.z) / (to.z - from.z) : 1,
    };
    const path = createRockPath(256);

    traceRockPath(
      new THREE.Vector3(0, 1.5, 0),
      new THREE.Vector3(0, 0, 1),
      wall,
      path,
      1,
    );

    expect(path.hitSomething).toBe(true);
    expect(path.points[path.count - 1].z).toBeCloseTo(8, 1);
  });

  it("lands on the floor when thrown into the ground", () => {
    const path = createRockPath(256);

    traceRockPath(
      new THREE.Vector3(0, 1.5, 0),
      new THREE.Vector3(0, -0.5, 1).normalize(),
      OPEN,
      path,
      1,
    );

    expect(path.hitSomething).toBe(true);
    expect(path.points[path.count - 1].y).toBeLessThan(0.2);
  });
});

describe("Rock damage uses the existing combat numbers", () => {
  it("a body hit equals the light jump punch", () => {
    expect(ROCK_CONFIG.ROCK_BODY_DAMAGE).toBe(BODY);
    expect(rockDamageFor("torso")).toBe(BODY);
    expect(rockDamageFor("legs")).toBe(BODY);
  });

  it("a head hit is more than a body hit but less than a heavy attack", () => {
    expect(rockDamageFor("head")).toBeGreaterThan(BODY);
    expect(rockDamageFor("head")).toBeLessThan(HEAVY);
  });

  it("a torso, leg and head hit deal exactly those numbers to health", () => {
    expect(setup().throwAt("torso")).toBe(BODY);
    expect(setup().throwAt("legs")).toBe(BODY);
    expect(setup().throwAt("head")).toBe(rockDamageFor("head"));
  });

  it("the hit event carries the real damage and the rock is gone afterwards", () => {
    const scene = setup();

    scene.throwAt("torso");

    const hits = scene.events.filter((e) => e.type === "hit");

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      type: "hit",
      attackerId: "thrower",
      attackId: "rock-throw",
      hurtbox: "torso",
      damage: BODY,
      healthLeft: 100 - BODY,
    });
    expect(scene.projectiles.active).toHaveLength(0);
  });

  it("pushes the target along the throw", () => {
    const scene = setup();

    scene.throwAt("torso");

    expect(scene.target.hits).toHaveLength(1);
    expect(scene.target.hits[0].knockback).toBe(ROCK_CONFIG.ROCK_KNOCKBACK);
    expect(scene.target.hits[0].knockbackDirection.z).toBeGreaterThan(0.99);
  });
});

describe("Rock vs the directional guard", () => {
  const reduced = (damage: number): number =>
    Math.max(1, Math.round(damage * ROCK_CONFIG.ROCK_BLOCK_DAMAGE_MULTIPLIER));

  it("a guard facing the thrower softens a body hit, but never to zero", () => {
    const scene = setup();

    scene.target.blocking = true;

    const damage = scene.throwAt("torso");

    expect(damage).toBe(reduced(BODY));
    expect(damage).toBeGreaterThan(0);
    expect(damage).toBeLessThan(BODY);
    expect(scene.events.some((e) => e.type === "guard-reduced")).toBe(true);
    // The shown number is the reduced one, not the full one.
    expect(
      scene.events.find((e) => e.type === "hit" && e.damage === damage),
    ).toBeDefined();
    expect(
      scene.events.some((e) => e.type === "hit" && e.damage === BODY),
    ).toBe(false);
  });

  it("outside the guard cone (the thrower is to the side) is full damage", () => {
    const scene = setup();

    scene.target.blocking = true;
    scene.target.yaw = Math.PI / 2; // faces +x, the thrower is off to the side

    expect(scene.throwAt("torso")).toBe(BODY);
    expect(scene.events.some((e) => e.type === "block-failed")).toBe(true);
  });

  it("from behind is full damage", () => {
    const scene = setup();

    scene.target.blocking = true;
    scene.target.yaw = 0; // faces away from the thrower

    expect(scene.throwAt("torso")).toBe(BODY);
    expect(scene.events.find((e) => e.type === "block-failed")).toMatchObject({
      reason: "rear",
    });
  });

  it("a head hit through a guard that covers the head is softened too", () => {
    const scene = setup();

    scene.target.blocking = true;
    scene.target.pitch = 0.5; // guard raised over the face: head and torso

    const damage = scene.throwAt("head");

    expect(damage).toBe(reduced(rockDamageFor("head")));
    expect(damage).toBeGreaterThan(0);
    expect(damage).toBeLessThan(rockDamageFor("head"));
  });

  it("a head hit over a low guard (head not covered) is the full headshot", () => {
    const scene = setup();

    scene.target.blocking = true;

    expect(scene.throwAt("head")).toBe(rockDamageFor("head"));
  });

  it("the guard multiplier is the one setting", () => {
    expect(ROCK_CONFIG.ROCK_BLOCK_DAMAGE_MULTIPLIER).toBeGreaterThan(0);
    expect(ROCK_CONFIG.ROCK_BLOCK_DAMAGE_MULTIPLIER).toBeLessThan(1);
  });
});

describe("Rock projectiles", () => {
  it("never hit their own thrower", () => {
    const scene = setup();
    const origin = new THREE.Vector3(0, 1.2, 0);

    scene.projectiles.throwRock("target", origin, new THREE.Vector3(0, 0, -1));

    for (let i = 0; i < 120; i++) {
      scene.projectiles.update(1 / 60);
    }

    expect(scene.target.health.current).toBe(100);
  });

  it("are stopped by scenery before they reach a body", () => {
    const wall: RockWorld = {
      clearFraction: (from, to) =>
        to.z > 5 && from.z <= 5 ? (5 - from.z) / (to.z - from.z) : 1,
    };
    const scene = setup(wall);

    expect(scene.throwAt("torso")).toBe(0);
    expect(scene.projectiles.active).toHaveLength(0);
  });

  it("miss, drop out of the world and are cleaned up", () => {
    const scene = setup();

    scene.projectiles.throwRock(
      "thrower",
      new THREE.Vector3(0, 1.4, 0),
      new THREE.Vector3(1, 0, 0),
    );
    expect(scene.projectiles.active).toHaveLength(1);

    for (let i = 0; i < 300; i++) {
      scene.projectiles.update(1 / 60);
    }

    expect(scene.projectiles.active).toHaveLength(0);
    expect(scene.target.health.current).toBe(100);
  });

  it("a frame longer than a step is stepped in fixed slices (same result)", () => {
    const a = setup();
    const b = setup();
    const origin = new THREE.Vector3(0, 1.4, 0);
    const direction = new THREE.Vector3(0, 0.05, 1).normalize();
    const ra = a.projectiles.throwRock("thrower", origin, direction);
    const rb = b.projectiles.throwRock("thrower", origin, direction);

    for (let i = 0; i < 12; i++) {
      a.projectiles.update(1 / 60);
    }

    b.projectiles.update(12 / 60 + 1e-9);

    expect(ra.position.distanceTo(rb.position)).toBeLessThan(1e-4);
  });

  it("only a limited number fly at once", () => {
    const scene = setup();

    for (let i = 0; i < ROCK_CONFIG.ROCK_MAX_ACTIVE + 10; i++) {
      scene.projectiles.throwRock(
        "thrower",
        new THREE.Vector3(0, 1.4, 0),
        new THREE.Vector3(1, 0.1, 0),
      );
    }

    expect(scene.projectiles.active.length).toBe(ROCK_CONFIG.ROCK_MAX_ACTIVE);
  });

  it("a dead target is not hit again", () => {
    const scene = setup();

    scene.target.health.damage(100);

    expect(scene.throwAt("torso")).toBe(0);
  });

  it("clear() removes everything in flight", () => {
    const scene = setup();

    scene.projectiles.throwRock(
      "thrower",
      new THREE.Vector3(0, 1.4, 0),
      new THREE.Vector3(1, 0, 0),
    );
    scene.projectiles.clear();

    expect(scene.projectiles.active).toHaveLength(0);
  });
});
