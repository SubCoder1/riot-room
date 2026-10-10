import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { canPerceive, SightMemory } from "../../src/combat/Awareness";
import type { CombatEvent } from "../../src/combat/CombatEvents";
import { CombatSystem } from "../../src/combat/CombatSystem";
import { ExplosionSystem } from "../../src/combat/Explosions";
import {
  FUSES,
  PROFILES,
  ProjectileSystem,
  type ThrownItem,
} from "../../src/combat/Projectiles";
import {
  SMOKE_LIFETIME,
  SmokeSystem,
  smokePhase,
  smokeRadius,
  smokeThickness,
} from "../../src/combat/Smoke";
import { SMOKE_CONFIG as C } from "../../src/combat/SmokeConfig";
import type { ThrowWorld } from "../../src/combat/ThrowableFlight";
import { ExplosionView } from "../../src/vfx/ExplosionView";
import { SmokeCloudView } from "../../src/vfx/SmokeCloudView";
import { TestFighter } from "./helpers";

const STEP = 1 / 60;
const OPEN: ThrowWorld = { clearFraction: () => 1, surfaceY: () => 0 };

interface Scene {
  combat: CombatSystem;
  projectiles: ProjectileSystem;
  smoke: SmokeSystem;
  victim: TestFighter;
  events: CombatEvent[];
  emitted: ThrownItem[];
  run: (seconds: number) => void;
}

function setup(): Scene {
  const combat = new CombatSystem();
  const victim = new TestFighter("victim");
  const thrower = new TestFighter("thrower");
  const events: CombatEvent[] = [];
  const emitted: ThrownItem[] = [];

  victim.position.set(30, 0, 30);
  combat.register(thrower);
  combat.register(victim);
  combat.events.subscribe((e) => events.push(e));

  const projectiles = new ProjectileSystem(combat, OPEN);
  const smoke = new SmokeSystem(combat, OPEN);
  const explosions = new ExplosionSystem(combat, OPEN);

  projectiles.onDetonate = (item, point) => {
    if (item.kind === "smoke") {
      emitted.push(item);
      smoke.emit(item.ownerId, point);
    } else if (item.kind === "grenade") {
      explosions.detonate(item.ownerId, point);
    }
  };

  const run = (seconds: number): void => {
    for (let t = 0; t < seconds - 1e-9; t += STEP) {
      projectiles.update(STEP);
      smoke.update(STEP);
    }
  };

  return { combat, projectiles, smoke, victim, events, emitted, run };
}

const at = (x: number, y: number, z: number): THREE.Vector3 =>
  new THREE.Vector3(x, y, z);

describe("Smoke grenade throwing", () => {
  it("uses the shared flight with its own profile and the configured fuse", () => {
    expect(PROFILES.smoke.speed).toBe(C.SMOKE_THROW_SPEED);
    expect(FUSES.smoke).toBe(C.SMOKE_FUSE);
  });

  it("bounces and rolls like a grenade, then starts to emit once, after its fuse", () => {
    const scene = setup();
    const item = scene.projectiles.throwProjectile(
      "smoke",
      "thrower",
      at(0, 1.2, 0),
      new THREE.Vector3(0, 0, 1),
    );

    scene.run(C.SMOKE_FUSE - 0.3);

    expect(item.bounces).toBeGreaterThan(0);
    expect(scene.smoke.clouds).toHaveLength(0);

    scene.run(0.6);
    scene.run(3);

    expect(scene.emitted).toHaveLength(1);
    expect(scene.smoke.clouds).toHaveLength(1);
    expect(scene.projectiles.active).toHaveLength(0);
    expect(scene.events.filter((e) => e.type === "smoke-started")).toHaveLength(
      1,
    );
  });

  it("starts the cloud where the canister lies, on the surface", () => {
    const scene = setup();

    scene.projectiles.throwProjectile(
      "smoke",
      "thrower",
      at(0, 1.2, 0),
      new THREE.Vector3(0, 0, 1),
    );
    scene.run(C.SMOKE_FUSE + 0.2);

    const cloud = scene.smoke.clouds[0];

    expect(cloud.position.z).toBeGreaterThan(2);
    expect(cloud.position.y).toBeGreaterThan(0);
    expect(cloud.position.y).toBeLessThan(2);
  });

  it("deals no damage and causes no explosion", () => {
    const scene = setup();

    scene.victim.position.set(0, 0, 8);
    scene.projectiles.throwProjectile(
      "smoke",
      "thrower",
      at(0, 1.2, 0),
      new THREE.Vector3(0, 0, 1),
    );
    scene.run(C.SMOKE_FUSE + 6);

    expect(scene.victim.health.current).toBe(scene.victim.health.max);
    expect(scene.events.filter((e) => e.type === "hit")).toHaveLength(0);
    expect(scene.events.filter((e) => e.type === "explosion")).toHaveLength(0);
  });
});

describe("Smoke cloud lifetime", () => {
  it("expands over its configured time, holds, then dissipates and is removed", () => {
    expect(smokeRadius(0)).toBeCloseTo(C.SMOKE_START_RADIUS, 5);
    expect(smokeRadius(C.SMOKE_EXPAND_TIME)).toBeCloseTo(C.SMOKE_MAX_RADIUS, 5);
    expect(smokeRadius(C.SMOKE_EXPAND_TIME / 2)).toBeGreaterThan(
      C.SMOKE_START_RADIUS,
    );
    expect(smokeRadius(C.SMOKE_EXPAND_TIME / 2)).toBeLessThan(
      C.SMOKE_MAX_RADIUS,
    );

    expect(smokePhase(0.1)).toBe("expanding");
    expect(smokePhase(C.SMOKE_EXPAND_TIME + 1)).toBe("holding");
    expect(smokePhase(C.SMOKE_EXPAND_TIME + C.SMOKE_DURATION + 1)).toBe(
      "dissipating",
    );

    expect(SMOKE_LIFETIME).toBe(
      C.SMOKE_EXPAND_TIME + C.SMOKE_DURATION + C.SMOKE_FADE_TIME,
    );
    expect(smokeRadius(SMOKE_LIFETIME)).toBe(0);
    expect(smokeThickness(SMOKE_LIFETIME)).toBe(0);
  });

  it("is thick while it holds and thins away at the end", () => {
    const holdEnd = C.SMOKE_EXPAND_TIME + C.SMOKE_DURATION;

    expect(smokeThickness(C.SMOKE_EXPAND_TIME + 1)).toBe(1);
    expect(smokeThickness(holdEnd + C.SMOKE_FADE_TIME / 2)).toBeLessThan(1);
    expect(smokeThickness(holdEnd + C.SMOKE_FADE_TIME / 2)).toBeGreaterThan(0);
  });

  it("is removed when its life is over, with an end event", () => {
    const scene = setup();

    scene.smoke.emit("thrower", at(0, 0, 0));
    scene.run(SMOKE_LIFETIME - 0.5);
    expect(scene.smoke.clouds).toHaveLength(1);

    scene.run(1);
    expect(scene.smoke.clouds).toHaveLength(0);
    expect(scene.events.filter((e) => e.type === "smoke-ended")).toHaveLength(
      1,
    );
  });

  it("only a few clouds exist at once (the oldest disperses first)", () => {
    const scene = setup();

    for (let i = 0; i < C.SMOKE_MAX_CLOUDS + 3; i++) {
      scene.smoke.emit("thrower", at(i * 20, 0, 0));
    }

    expect(scene.smoke.clouds).toHaveLength(C.SMOKE_MAX_CLOUDS);
    expect(scene.smoke.clouds[0].position.x).toBeGreaterThan(0);
  });

  it("clear() removes every cloud", () => {
    const scene = setup();

    scene.smoke.emit("thrower", at(0, 0, 0));
    scene.smoke.emit("thrower", at(20, 0, 0));
    scene.smoke.clear();

    expect(scene.smoke.clouds).toHaveLength(0);
  });
});

describe("Smoke and what can be seen", () => {
  const fullyGrown = (): SmokeSystem => {
    const smoke = new SmokeSystem(null, OPEN);
    const cloud = smoke.emit("thrower", at(0, 0, 0));

    cloud.age = C.SMOKE_EXPAND_TIME + 1;

    return smoke;
  };

  it("is dense at the middle, thin at the edge and absent outside", () => {
    const smoke = fullyGrown();
    const centre = smoke.clouds[0].position.clone();
    const edge = centre.clone().add(at(C.SMOKE_MAX_RADIUS * 0.9, 0, 0));
    const outside = centre.clone().add(at(C.SMOKE_MAX_RADIUS + 1, 0, 0));

    expect(smoke.densityAt(centre)).toBe(1);
    expect(smoke.densityAt(edge)).toBeGreaterThan(0);
    expect(smoke.densityAt(edge)).toBeLessThan(1);
    expect(smoke.densityAt(outside)).toBe(0);
  });

  it("looking across the cloud sees almost nothing", () => {
    const smoke = fullyGrown();
    const centre = smoke.clouds[0].position;
    const from = centre.clone().add(at(-C.SMOKE_MAX_RADIUS - 1, 0, 0));
    const to = centre.clone().add(at(C.SMOKE_MAX_RADIUS + 1, 0, 0));

    expect(smoke.visibility(from, to)).toBeLessThan(C.SMOKE_SIGHT_THRESHOLD);
    expect(smoke.blocksSight(from, to)).toBe(true);
  });

  it("looking past the cloud is not affected", () => {
    const smoke = fullyGrown();
    const centre = smoke.clouds[0].position;
    const from = centre.clone().add(at(-8, 0, C.SMOKE_MAX_RADIUS + 3));
    const to = centre.clone().add(at(8, 0, C.SMOKE_MAX_RADIUS + 3));

    expect(smoke.visibility(from, to)).toBe(1);
    expect(smoke.blocksSight(from, to)).toBe(false);
  });

  it("a short look into the edge is only dimmed, a long one through the middle is blind", () => {
    const smoke = fullyGrown();
    const centre = smoke.clouds[0].position;
    const edgeA = centre.clone().add(at(-C.SMOKE_MAX_RADIUS - 0.5, 0, 0));
    const edgeB = centre.clone().add(at(-C.SMOKE_MAX_RADIUS + 0.6, 0, 0));
    const through = centre.clone().add(at(C.SMOKE_MAX_RADIUS, 0, 0));

    expect(smoke.visibility(edgeA, edgeB)).toBeGreaterThan(0.6);
    expect(smoke.visibility(edgeA, through)).toBeLessThan(0.1);
  });

  it("thickens as the cloud forms and clears as it dissipates", () => {
    const smoke = new SmokeSystem(null, OPEN);
    const cloud = smoke.emit("thrower", at(0, 0, 0));
    const from = cloud.position.clone().add(at(-6, 0, 0));
    const to = cloud.position.clone().add(at(6, 0, 0));

    cloud.age = 0.05;
    const early = smoke.visibility(from, to);

    cloud.age = C.SMOKE_EXPAND_TIME + 1;
    const full = smoke.visibility(from, to);

    cloud.age = SMOKE_LIFETIME - 0.2;
    const late = smoke.visibility(from, to);

    expect(full).toBeLessThan(early);
    expect(late).toBeGreaterThan(full);
  });

  it("no smoke means a clear view", () => {
    const smoke = new SmokeSystem(null, OPEN);

    expect(smoke.visibility(at(0, 1, 0), at(20, 1, 0))).toBe(1);
    expect(smoke.densityAt(at(0, 1, 0))).toBe(0);
  });

  it("never touches movement or combat: it makes nobody invulnerable", () => {
    const scene = setup();

    scene.victim.position.set(0, 0, 0);

    const cloud = scene.smoke.emit("thrower", at(0, 0, 0));

    cloud.age = C.SMOKE_EXPAND_TIME + 1;

    // A punch lands inside the smoke exactly as it does outside it.
    scene.combat.startAttack("thrower", "light-punch", "right");
    const attacker = scene.combat.getCombatants()[0] as TestFighter;

    attacker.position.set(0, 0, -1);
    attacker.strike.set(0, 1.2, 0);

    for (let i = 0; i < 40; i++) {
      scene.combat.update(STEP);
    }

    expect(scene.victim.health.current).toBeLessThan(scene.victim.health.max);
  });
});

describe("Enemy awareness", () => {
  it("cover hides a target, smoke hides a target, a clear line does not", () => {
    const smoke = new SmokeSystem(null, OPEN);
    const cloud = smoke.emit("thrower", at(0, 0, 0));
    const eye = at(-8, 1.6, 0);
    const target = at(8, 1.2, 0);

    cloud.age = C.SMOKE_EXPAND_TIME + 1;

    expect(canPerceive(eye, target, () => true, null)).toBe(true);
    expect(canPerceive(eye, target, () => false, null)).toBe(false);
    expect(canPerceive(eye, target, () => true, smoke)).toBe(false);

    smoke.clear();
    expect(canPerceive(eye, target, () => true, smoke)).toBe(true);
  });

  it("an observer keeps the last place the target was seen, and does not track it through smoke", () => {
    const memory = new SightMemory();

    expect(memory.searchPoint).toBeNull();

    memory.update(0.1, true, at(5, 0, 5));
    memory.update(0.1, true, at(6, 0, 5));
    expect(memory.searchPoint?.x).toBe(6);

    // The target moves on, but it is hidden: the memory stays where it was seen.
    memory.update(0.5, false, at(20, 0, 5));
    memory.update(0.5, false, at(30, 0, 5));
    expect(memory.searchPoint?.x).toBe(6);
    expect(memory.sinceSeen).toBeCloseTo(1, 5);

    // Seen again: it follows once more.
    memory.update(0.1, true, at(12, 0, 5));
    expect(memory.searchPoint?.x).toBe(12);
    expect(memory.sinceSeen).toBe(0);

    memory.reset();
    expect(memory.searchPoint).toBeNull();
  });
});

describe("Drawing the smoke and explosions leaks nothing", () => {
  const camera = new THREE.PerspectiveCamera();

  it("a cloud gets a bounded number of sprites and gives them all back", () => {
    const smoke = new SmokeSystem(null, OPEN);
    const view = new SmokeCloudView(smoke);

    camera.position.set(0, 1.6, -12);

    smoke.emit("thrower", at(0, 0, 0));
    view.update(camera, 0);

    // The puffs plus one flash.
    expect(view.group.children).toHaveLength(C.SMOKE_PARTICLE_COUNT + 1);
    expect(view.count).toBe(1);

    smoke.clear();
    view.update(camera, 1);

    expect(view.group.children).toHaveLength(0);
    expect(view.count).toBe(0);

    view.dispose();
  });

  it("the puffs fade out as the cloud dissipates", () => {
    const smoke = new SmokeSystem(null, OPEN);
    const view = new SmokeCloudView(smoke);
    const cloud = smoke.emit("thrower", at(0, 0, 0));

    camera.position.set(0, 1.6, -14);
    cloud.age = C.SMOKE_EXPAND_TIME + 1;
    view.update(camera, 0);

    const visible = (): number =>
      view.group.children.filter((c) => c.visible).length;
    const opacity = (): number =>
      Math.max(
        ...view.group.children.map((c) => (c as THREE.Sprite).material.opacity),
      );
    const full = opacity();

    expect(visible()).toBeGreaterThan(10);

    cloud.age = SMOKE_LIFETIME - 0.5;
    view.update(camera, 1);

    expect(opacity()).toBeLessThan(full * 0.5);
    view.dispose();
  });

  it("the screen tint follows how deep in the smoke the camera is", () => {
    const smoke = new SmokeSystem(null, OPEN);
    const view = new SmokeCloudView(smoke);
    const cloud = smoke.emit("thrower", at(0, 0, 0));

    cloud.age = C.SMOKE_EXPAND_TIME + 1;

    camera.position.copy(cloud.position);
    expect(view.interior(camera)).toBe(1);

    camera.position.set(40, 1.6, 40);
    expect(view.interior(camera)).toBe(0);
    view.dispose();
  });

  it("an explosion's fire is gone in a couple of seconds, its scorch a little later, then the slot is free", () => {
    const view = new ExplosionView();

    view.spawn(at(0, 0, 0));
    expect(view.playing).toBe(1);

    // The fire and smoke are gone within a few seconds...
    for (let i = 0; i < 60; i++) {
      view.update(1 / 20);
    }

    const sprites = view.group.children.filter(
      (c) => c.visible && (c as THREE.Sprite).isSprite,
    );

    expect(sprites).toHaveLength(0);

    // ...and the scorch mark on the floor fades a few seconds later.
    for (let i = 0; i < 60; i++) {
      view.update(1 / 20);
    }

    expect(view.playing).toBe(0);
    expect(view.group.children.filter((c) => c.visible)).toHaveLength(0);
    view.dispose();
  });
});
