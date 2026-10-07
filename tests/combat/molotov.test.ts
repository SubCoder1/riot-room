import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { CombatEvent } from "../../src/combat/CombatEvents";
import { CombatSystem } from "../../src/combat/CombatSystem";
import {
  FIRE_LIFETIME,
  FireSystem,
  fireIntensity,
  fireRadius,
  firePhase,
} from "../../src/combat/FireZones";
import { MOLOTOV_CONFIG as C } from "../../src/combat/MolotovConfig";
import { ProjectileSystem } from "../../src/combat/Projectiles";
import {
  MOLOTOV_PROFILE,
  createRockPath,
  traceRockPath,
  type RockWorld,
} from "../../src/combat/RockFlight";
import { TestFighter } from "./helpers";

const FLAT: RockWorld = {
  clearFraction: () => 1,
  surfaceY: () => 0,
};

const STEP = 1 / 60;

interface Scene {
  combat: CombatSystem;
  fires: FireSystem;
  projectiles: ProjectileSystem;
  thrower: TestFighter;
  victim: TestFighter;
  events: CombatEvent[];
  run: (seconds: number) => void;
}

function setup(world: RockWorld = FLAT): Scene {
  const combat = new CombatSystem();
  const thrower = new TestFighter("thrower");
  const victim = new TestFighter("victim");
  const events: CombatEvent[] = [];

  victim.position.set(0, 0, 0);
  thrower.position.set(0, 0, -20);
  combat.register(thrower);
  combat.register(victim);
  combat.events.subscribe((e) => events.push(e));

  const fires = new FireSystem(combat, world);
  const projectiles = new ProjectileSystem(combat, world);

  projectiles.onBurst = (rock, point) => {
    fires.ignite(rock.ownerId, point);
  };

  const run = (seconds: number): void => {
    for (let t = 0; t < seconds - 1e-9; t += STEP) {
      projectiles.update(STEP);
      fires.update(STEP);
    }
  };

  return { combat, fires, projectiles, thrower, victim, events, run };
}

const hazardHits = (scene: Scene) =>
  scene.events.filter(
    (e) => e.type === "hit" && e.attackId === "molotov-fire",
  ) as Extract<CombatEvent, { type: "hit" }>[];

describe("Fire radius and lifecycle", () => {
  it("spreads from a small start to the configured full radius", () => {
    expect(C.MOLOTOV_MAX_RADIUS).toBe(3);
    expect(fireRadius(0)).toBeCloseTo(C.MOLOTOV_START_RADIUS);
    expect(fireRadius(C.MOLOTOV_SPREAD_TIME * 0.4)).toBeGreaterThan(1.2);
    expect(fireRadius(C.MOLOTOV_SPREAD_TIME * 0.4)).toBeLessThan(
      C.MOLOTOV_MAX_RADIUS,
    );
    expect(fireRadius(C.MOLOTOV_SPREAD_TIME)).toBeCloseTo(C.MOLOTOV_MAX_RADIUS);
    expect(C.MOLOTOV_SPREAD_TIME).toBeGreaterThanOrEqual(0.5);
    expect(C.MOLOTOV_SPREAD_TIME).toBeLessThanOrEqual(1);
  });

  it("only ever grows while spreading", () => {
    let last = 0;

    for (let t = 0; t <= C.MOLOTOV_SPREAD_TIME; t += 0.01) {
      expect(fireRadius(t)).toBeGreaterThanOrEqual(last);
      last = fireRadius(t);
    }
  });

  it("stays at full size for 7 seconds once it has spread, then dies out", () => {
    expect(C.MOLOTOV_DURATION).toBe(7);

    const spread = C.MOLOTOV_SPREAD_TIME;

    expect(firePhase(spread + 0.01)).toBe("active");
    expect(fireRadius(spread + 3)).toBe(C.MOLOTOV_MAX_RADIUS);
    expect(fireRadius(spread + 6.99)).toBe(C.MOLOTOV_MAX_RADIUS);
    expect(firePhase(spread + 7.01)).toBe("fading");
    expect(fireRadius(spread + 7.01)).toBeLessThan(C.MOLOTOV_MAX_RADIUS);
    expect(fireRadius(FIRE_LIFETIME)).toBe(0);
    expect(fireIntensity(FIRE_LIFETIME)).toBe(0);
    expect(FIRE_LIFETIME).toBeCloseTo(spread + 7 + C.MOLOTOV_FIRE_FADE_TIME);
  });

  it("is removed after its life, with events, and leaves nothing behind", () => {
    const scene = setup();

    scene.fires.ignite("thrower", new THREE.Vector3(10, 1, 10));
    scene.run(FIRE_LIFETIME - 0.5);
    expect(scene.fires.zones).toHaveLength(1);

    scene.run(1);
    expect(scene.fires.zones).toHaveLength(0);
    expect(scene.events.filter((e) => e.type === "fire-started")).toHaveLength(
      1,
    );
    expect(scene.events.filter((e) => e.type === "fire-ended")).toHaveLength(1);
  });

  it("is put on the surface below the impact, never in mid-air", () => {
    const platform: RockWorld = {
      clearFraction: () => 1,
      surfaceY: (x) => (x > 5 ? 2 : 0),
    };
    const scene = setup(platform);

    expect(
      scene.fires.ignite("thrower", new THREE.Vector3(8, 2.1, 0)).position.y,
    ).toBe(2);
    expect(
      scene.fires.ignite("thrower", new THREE.Vector3(1, 5, 0)).position.y,
    ).toBe(0);
  });

  it("keeps only a limited number of fires (the oldest goes out)", () => {
    const scene = setup();

    for (let i = 0; i < C.MOLOTOV_MAX_ZONES + 3; i++) {
      scene.fires.ignite("thrower", new THREE.Vector3(10 + i, 0, 10));
    }

    expect(scene.fires.zones).toHaveLength(C.MOLOTOV_MAX_ZONES);
  });

  it("clear() puts every fire out", () => {
    const scene = setup();

    scene.fires.ignite("thrower", new THREE.Vector3(10, 0, 10));
    scene.fires.clear();

    expect(scene.fires.zones).toHaveLength(0);
  });
});

describe("Fire damage", () => {
  it("hurts over time in small ticks, not in one big hit", () => {
    const scene = setup();

    scene.fires.ignite("thrower", new THREE.Vector3(0, 0, 0));
    scene.run(0.4);
    expect(scene.victim.health.current).toBe(100);

    scene.run(0.2);
    expect(hazardHits(scene)).toHaveLength(1);
    expect(hazardHits(scene)[0].damage).toBeGreaterThanOrEqual(
      C.MOLOTOV_DAMAGE_PER_TICK,
    );
    expect(hazardHits(scene)[0].damage).toBeLessThan(
      C.MOLOTOV_DAMAGE_PER_TICK * 2,
    );

    scene.run(3);
    expect(hazardHits(scene).length).toBeGreaterThanOrEqual(6);

    for (const hit of hazardHits(scene)) {
      expect(hit.damage).toBeLessThanOrEqual(C.MOLOTOV_MAX_OVERLAP_DAMAGE);
      expect(hit.damage).toBeGreaterThan(0);
    }
  });

  it("walking through is survivable; standing in it kills within 5 seconds", () => {
    const burnt = (seconds: number): number => {
      const scene = setup();

      scene.fires.ignite("thrower", new THREE.Vector3(0, 0, 0));
      scene.run(seconds);

      return 100 - scene.victim.health.current;
    };

    // A sprint across the 6 m width takes about a second.
    const walkedThrough = burnt(1.2);

    expect(walkedThrough).toBeGreaterThan(0);
    expect(walkedThrough).toBeLessThan(25);
    // A couple of seconds is painful but not deadly...
    expect(burnt(2.5)).toBeLessThan(100);
    expect(burnt(2.5)).toBeGreaterThan(walkedThrough * 2);
    // ...and a character that stays put is dead within 5 seconds.
    expect(burnt(5)).toBe(100);
  });

  it("ticks hurt more the longer you keep burning", () => {
    const scene = setup();

    scene.fires.ignite("thrower", new THREE.Vector3(0, 0, 0));
    scene.run(C.MOLOTOV_SPREAD_TIME + 6);

    const hits = hazardHits(scene);

    expect(hits[hits.length - 1].damage).toBeGreaterThan(hits[0].damage);
  });

  it("does nothing to someone outside the radius, and the radius is the same one that is drawn", () => {
    const scene = setup();

    scene.victim.position.set(2.9, 0, 0);
    scene.fires.ignite("thrower", new THREE.Vector3(0, 0, 0));

    // Burning needs half a second inside, and 2.9 m is only inside once the
    // fire has nearly spread: had the damage used a bigger radius than the
    // flames, the first tick would already have landed.
    scene.run(0.95);
    expect(fireRadius(0.3) + C.MOLOTOV_BODY_RADIUS).toBeLessThan(2.9);
    expect(scene.victim.health.current).toBe(100);

    // Fully spread: now inside.
    scene.run(C.MOLOTOV_SPREAD_TIME + 1);
    expect(scene.victim.health.current).toBeLessThan(100);

    // Well outside the full radius: never burnt.
    const far = setup();

    far.victim.position.set(C.MOLOTOV_MAX_RADIUS + 1, 0, 0);
    far.fires.ignite("thrower", new THREE.Vector3(0, 0, 0));
    far.run(FIRE_LIFETIME);
    expect(far.victim.health.current).toBe(100);
  });

  it("stops when the player leaves the fire", () => {
    const scene = setup();

    scene.fires.ignite("thrower", new THREE.Vector3(0, 0, 0));
    scene.run(C.MOLOTOV_SPREAD_TIME + 1.5);

    const burntInside = scene.victim.health.current;

    expect(burntInside).toBeLessThan(100);

    scene.victim.position.set(10, 0, 0);
    scene.run(3);

    expect(scene.victim.health.current).toBe(burntInside);
  });

  it("is not stopped by holding block", () => {
    const guarded = setup();
    const open = setup();

    guarded.victim.blocking = true;

    for (const scene of [guarded, open]) {
      scene.fires.ignite("thrower", new THREE.Vector3(0, 0, 0));
      scene.run(C.MOLOTOV_SPREAD_TIME + 3);
    }

    expect(guarded.victim.health.current).toBe(open.victim.health.current);
    expect(guarded.victim.health.current).toBeLessThan(100);
    expect(guarded.events.some((e) => e.type === "guard-reduced")).toBe(false);
  });

  it("overlapping fires do not stack the damage", () => {
    const one = setup();
    const three = setup();

    one.fires.ignite("thrower", new THREE.Vector3(0, 0, 0));

    for (let i = 0; i < 3; i++) {
      three.fires.ignite("thrower", new THREE.Vector3(0.1 * i, 0, 0));
    }

    one.run(C.MOLOTOV_SPREAD_TIME + 4);
    three.run(C.MOLOTOV_SPREAD_TIME + 4);

    expect(three.victim.health.current).toBe(one.victim.health.current);
    expect(hazardHits(three)).toHaveLength(hazardHits(one).length);
  });

  it("does not burn someone standing far above the fire", () => {
    const scene = setup();

    scene.victim.position.set(0, 4, 0);
    scene.fires.ignite("thrower", new THREE.Vector3(0, 0, 0));
    scene.run(C.MOLOTOV_SPREAD_TIME + 2);

    expect(scene.victim.health.current).toBe(100);
  });

  it("the thrower is burnt too (free for all), and a dead target is left alone", () => {
    const scene = setup();

    scene.thrower.position.set(0, 0, 0);
    scene.fires.ignite("thrower", new THREE.Vector3(0, 0, 0));
    scene.run(C.MOLOTOV_SPREAD_TIME + 1);
    expect(scene.thrower.health.current).toBeLessThan(100);

    scene.victim.health.damage(1000);
    const events = scene.events.length;

    scene.run(2);
    expect(
      scene.events
        .slice(events)
        .some((e) => e.type === "hit" && e.targetId === "victim"),
    ).toBe(false);
  });
});

describe("Molotov projectile", () => {
  it("flies the same way in the preview and in the world", () => {
    const scene = setup();
    const origin = new THREE.Vector3(6, 1.5, 0);
    const direction = new THREE.Vector3(0, 0.15, 1).normalize();
    const path = createRockPath(256);

    traceRockPath(origin, direction, FLAT, path, 1, MOLOTOV_PROFILE);

    const bottle = scene.projectiles.throwProjectile(
      "molotov",
      "thrower",
      origin,
      direction,
    );

    for (let i = 1; i < Math.min(path.count, 30); i++) {
      scene.projectiles.update(STEP);
      expect(bottle.position.distanceTo(path.points[i])).toBeLessThan(1e-5);
    }
  });

  it("breaks on the floor and starts a fire there, once", () => {
    const scene = setup();

    scene.projectiles.throwProjectile(
      "molotov",
      "thrower",
      new THREE.Vector3(8, 1.5, -10),
      new THREE.Vector3(0, -0.2, 1).normalize(),
    );
    scene.run(1.5);

    expect(scene.projectiles.active).toHaveLength(0);
    expect(scene.fires.zones).toHaveLength(1);
    expect(scene.fires.zones[0].position.y).toBe(0);
    expect(scene.fires.zones[0].position.x).toBeCloseTo(8, 0);
    expect(scene.fires.zones[0].ownerId).toBe("thrower");
  });

  it("breaks on a body too, and does no direct damage itself", () => {
    const scene = setup();

    scene.victim.position.set(0, 0, 10);
    scene.projectiles.throwProjectile(
      "molotov",
      "thrower",
      new THREE.Vector3(0, 1.3, 0.5),
      new THREE.Vector3(0, 0, 1),
    );
    scene.run(0.8);

    expect(scene.fires.zones).toHaveLength(1);
    expect(
      scene.events.some((e) => e.type === "hit" && e.attackId === "rock-throw"),
    ).toBe(false);
  });

  it("breaks on a wall and the fire drops to the surface below", () => {
    const wall: RockWorld = {
      clearFraction: (from, to) =>
        to.z > 6 && from.z <= 6 ? (6 - from.z) / (to.z - from.z) : 1,
      surfaceY: () => 0,
    };
    const scene = setup(wall);

    scene.projectiles.throwProjectile(
      "molotov",
      "thrower",
      new THREE.Vector3(0, 2.5, 0),
      new THREE.Vector3(0, 0, 1),
    );
    scene.run(1);

    expect(scene.fires.zones).toHaveLength(1);
    expect(scene.fires.zones[0].position.y).toBe(0);
    expect(scene.fires.zones[0].position.z).toBeCloseTo(6, 0);
  });

  it("a rock never starts a fire", () => {
    const scene = setup();

    scene.projectiles.throwRock(
      "thrower",
      new THREE.Vector3(8, 1.5, -10),
      new THREE.Vector3(0, -0.2, 1).normalize(),
    );
    scene.run(1.5);

    expect(scene.fires.zones).toHaveLength(0);
  });
});
