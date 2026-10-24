import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  WAREHOUSE_TUBES,
  createHangingTubeGlow,
} from "../../src/world/HangingTubes";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";
import { spawnPlayer } from "./playerHarness";

/** The Warehouse's two work lamps are tube lights now, hung from the hoist beam. */
describe("The Warehouse's hanging tube lights", () => {
  const lamps = ARENA_LAYOUT.lights.filter((l) =>
    l.id.startsWith("tube-warehouse-"),
  );

  it("replace the old work lamps: a tube lamp each, none of the old", () => {
    expect(lamps).toHaveLength(WAREHOUSE_TUBES.length);
    expect(
      ARENA_LAYOUT.lights.some((l) => l.id.startsWith("light-room-warehouse")),
    ).toBe(false);

    for (const lamp of lamps) {
      // A spotlight hung over the floor, aimed down, cool white.
      expect(lamp.target).toBeDefined();
      expect(lamp.target!.y).toBeLessThan(lamp.y - 2);
      expect(lamp.x).toBeCloseTo(lamp.target!.x, 6);
      expect(lamp.y).toBeGreaterThan(4 + 2.5);
      expect(lamp.y).toBeLessThan(4 + 4);
      expect((lamp.color >> 16) & 255).toBeGreaterThan(0xc0);
    }
  });

  it("hang on cables from the beam, the tubes under a wire guard", () => {
    const pile = ARENA_LAYOUT.piles.find(
      (p) => p.id === "warehouse-hanging-tubes",
    )!;

    expect(pile).toBeDefined();

    // Two cables to the beam from each fixture, thin and upright.
    const cables = pile.elements.filter((e) => e.shape === "cable");

    expect(cables.length).toBeGreaterThanOrEqual(WAREHOUSE_TUBES.length * 2);

    for (const cable of cables.slice(0, 4)) {
      expect(cable.sy + cable.sx + cable.sz).toBeGreaterThan(0);
    }

    // The fixtures hang between the floor and the roof (6.5 m up).
    const boxes = pile.elements.filter((e) => e.shape === "plank");

    expect(boxes.length).toBeGreaterThan(20);
    expect(Math.min(...boxes.map((b) => b.y))).toBeGreaterThan(2.5);
    expect(Math.max(...boxes.map((b) => b.y))).toBeLessThan(6.6);
  });

  it("are one on the left and one on the right of the Warehouse's middle", () => {
    const [a, b] = WAREHOUSE_TUBES;

    expect(a.x).toBeCloseTo(b.x, 6);
    expect(Math.abs(a.z - b.z)).toBeGreaterThan(5);
    // The Warehouse runs z 12 to 24: one each side of its middle (18).
    expect(Math.min(a.z, b.z)).toBeLessThan(18);
    expect(Math.max(a.z, b.z)).toBeGreaterThan(18);
  });

  it("have two glowing tubes each", () => {
    const glow = createHangingTubeGlow();
    const mesh = glow.group.getObjectByName(
      "warehouse-tubes",
    ) as THREE.InstancedMesh;

    expect(mesh.count).toBe(WAREHOUSE_TUBES.length * 2);
    glow.dispose();
  });
});

describe("The lane between the Warehouse's drum stack and the east shelving", () => {
  it("is wide enough to walk through, north to south", () => {
    const p = spawnPlayer(30.28, 4, 14.2, Math.PI);

    p.input.keys.add("KeyW");
    p.step(2.0);

    // Through it, past the shelving's north end and well on beyond.
    expect(p.player.position.z).toBeGreaterThan(18.5);
    expect(p.player.position.x).toBeGreaterThan(29.4);
    expect(p.player.position.x).toBeLessThan(31.2);
  });
});
