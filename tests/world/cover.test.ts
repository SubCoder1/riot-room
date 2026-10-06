import { describe, expect, it } from "vitest";

import { ATTACKS } from "../../src/combat/AttackDefinitions";
import { ArenaCollision } from "../../src/world/ArenaCollision";
import { ARENA_LAYOUT } from "../../src/world/ArenaLayout";
import { makeScene, runAttack, type Scene } from "../combat/helpers";

const world = new ArenaCollision();

/** A scene wired to the arena's real cover check, like Game.ts does. */
function sceneWithCover(): Scene {
  const scene = makeScene();

  scene.system.lineOfSight = (from, to) =>
    !world.segmentBlocked(from.x, from.y, from.z, to.x, to.y, to.z);

  return scene;
}

/** Puts attacker and defender on opposite sides of a cover piece, facing each other. */
function placeAcross(scene: Scene, coverId: string, axis: "x" | "z"): void {
  const cover = ARENA_LAYOUT.covers.find((c) => c.id === coverId)!;
  const cx = (cover.minX + cover.maxX) / 2;
  const cz = (cover.minZ + cover.maxZ) / 2;
  const reach = 0.9;
  const half =
    axis === "z"
      ? (cover.maxZ - cover.minZ) / 2
      : (cover.maxX - cover.minX) / 2;

  const offset = half + reach;

  if (axis === "z") {
    scene.attacker.position.set(cx, 0, cz + offset);
    scene.defender.position.set(cx, 0, cz - offset);
  } else {
    scene.attacker.position.set(cx + offset, 0, cz);
    scene.defender.position.set(cx - offset, 0, cz);
  }

  scene.attacker.strike.set(
    scene.defender.position.x,
    1.2,
    scene.defender.position.z,
  );
}

describe("Line of sight (segmentBlocked)", () => {
  const block = ARENA_LAYOUT.covers.find((c) => c.id === "cover-block-3")!;
  const low = ARENA_LAYOUT.covers.find((c) => c.id === "cover-low-1")!;
  const bx = (block.minX + block.maxX) / 2;
  const lx = (low.minX + low.maxX) / 2;

  it("a line through a 2 m block is blocked", () => {
    expect(
      world.segmentBlocked(bx, 1.3, block.minZ - 1, bx, 1.2, block.maxZ + 1),
    ).toBe(true);
  });

  it("a chest-height line over a 0.8 m low wall is clear", () => {
    expect(
      world.segmentBlocked(lx, 1.3, low.minZ - 1, lx, 1.2, low.maxZ + 1),
    ).toBe(false);
  });

  it("a line through a pillar is blocked, beside it is clear", () => {
    const pillar = ARENA_LAYOUT.pillars[0];

    expect(
      world.segmentBlocked(
        pillar.x - 2,
        1.3,
        pillar.z,
        pillar.x + 2,
        1.3,
        pillar.z,
      ),
    ).toBe(true);
    expect(
      world.segmentBlocked(
        pillar.x - 2,
        1.3,
        pillar.z + 1.5,
        pillar.x + 2,
        1.3,
        pillar.z + 1.5,
      ),
    ).toBe(false);
  });

  it("open floor is clear", () => {
    expect(world.segmentBlocked(-9, 1.3, 9, -3, 1.2, 9)).toBe(false);
  });

  it("a line into the side of a platform is blocked, along its top is clear", () => {
    // Central platform is 1.8 m high.
    expect(world.segmentBlocked(-8, 1.3, 0, 0, 1.3, 0)).toBe(true);
    expect(world.segmentBlocked(-3, 3.0, 0, 3, 3.0, 0)).toBe(false);
  });
});

describe("Punches and cover", () => {
  it("a punch cannot hit through a 2 m concrete block", () => {
    const scene = sceneWithCover();

    placeAcross(scene, "cover-block-3", "z");

    expect(runAttack(scene, "light-punch")).toBe(0);
    expect(scene.defender.health.current).toBe(100);
  });

  it("heavy and flying punches are stopped too", () => {
    for (const id of [
      "heavy-run-punch",
      "flying-light-punch",
      "flying-heavy-punch",
    ] as const) {
      const scene = sceneWithCover();

      placeAcross(scene, "cover-block-4", "z");

      expect(runAttack(scene, id)).toBe(0);
    }
  });

  it("a block along either axis stops it", () => {
    const scene = sceneWithCover();

    placeAcross(scene, "cover-block-5", "x");

    expect(runAttack(scene, "light-punch")).toBe(0);
  });

  it("the same punch lands once the cover is not between them", () => {
    const scene = sceneWithCover();

    placeAcross(scene, "cover-block-3", "z");
    // Defender steps out from behind the block.
    scene.defender.position.x += 4;
    scene.attacker.position
      .copy(scene.defender.position)
      .add({ x: 0, y: 0, z: 1.2 } as never);
    scene.attacker.strike.set(
      scene.defender.position.x,
      1.2,
      scene.defender.position.z,
    );

    expect(runAttack(scene, "light-punch")).toBe(ATTACKS["light-punch"].damage);
  });

  it("a low 0.8 m wall does not stop a punch thrown over it", () => {
    const scene = sceneWithCover();

    placeAcross(scene, "cover-low-1", "z");

    expect(runAttack(scene, "light-punch")).toBe(ATTACKS["light-punch"].damage);
  });

  it("without a line-of-sight check combat is unchanged", () => {
    const scene = makeScene();

    expect(scene.system.lineOfSight).toBeNull();
    expect(runAttack(scene, "light-punch")).toBe(ATTACKS["light-punch"].damage);
  });

  it("a punch blocked at first can still land if the line opens in its active window", () => {
    const scene = sceneWithCover();
    const { startup, active } = ATTACKS["light-punch"];

    placeAcross(scene, "cover-block-3", "z");
    scene.system.startAttack("attacker", "light-punch", "right");
    scene.system.update(startup + 0.01);
    expect(scene.defender.health.current).toBe(100);

    // Defender is knocked/steps clear of the block mid-punch.
    scene.defender.position.x += 4;
    scene.attacker.position.x += 4;
    scene.attacker.strike.set(
      scene.defender.position.x,
      1.2,
      scene.defender.position.z,
    );
    scene.system.update(active / 2);

    expect(scene.defender.health.current).toBe(
      100 - ATTACKS["light-punch"].damage,
    );
  });
});
