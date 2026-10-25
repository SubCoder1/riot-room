import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  GeneratorSmoke,
  IDLE_RATE,
  START_RATE,
} from "../../src/vfx/GeneratorSmoke";
import { Arena } from "../../src/world/Arena";
import { ArenaCollision } from "../../src/world/ArenaCollision";
import { nightLights } from "../../src/world/NightLights";
import {
  CIRCUIT_GENERATOR,
  PowerState,
  RESTART_DELAY,
  circuitOfLamp,
  isIndependentLamp,
} from "../../src/world/PowerCircuits";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";

describe("The two lighting circuits", () => {
  it("every lamp of the night is on a circuit or deliberately independent", () => {
    for (const light of nightLights(ARENA_LAYOUT)) {
      expect(
        circuitOfLamp(light.id) !== null || isIndependentLamp(light.id),
        light.id,
      ).toBe(true);
    }
  });

  it("floodlights, work lamps and the yard are exterior; tubes, bulbs and room lamps interior", () => {
    for (const { id } of nightLights(ARENA_LAYOUT)) {
      if (id.startsWith("light-support-") || id.startsWith("halogen-")) {
        expect(circuitOfLamp(id), id).toBe("exterior");
      }

      if (id.startsWith("tube-") || id.startsWith("bulb-")) {
        expect(circuitOfLamp(id), id).toBe("interior");
      }
    }

    // Emergency and equipment indicators stay on whatever happens.
    expect(circuitOfLamp("indicator-server-racks")).toBeNull();
    expect(isIndependentLamp("indicator-server-racks")).toBe(true);
  });

  it("the two generators run the two circuits and stand where a player can reach their panels", () => {
    const world = new ArenaCollision();
    const byId = new Map(ARENA_LAYOUT.generators.map((g) => [g.id, g]));

    for (const [circuit, id] of Object.entries(CIRCUIT_GENERATOR)) {
      const g = byId.get(id)!;
      const floor = g.y - 1.1;

      expect(g.circuit).toBe(circuit);
      // The panel's spot is open floor on the generator's own level.
      expect(world.isBlocked(g.panel.x, g.panel.z, floor, 0.4), id).toBe(false);
      expect(Math.hypot(g.panel.x - g.x, g.panel.z - g.z)).toBeLessThan(2);
      expect(g.indicator.y).toBeCloseTo(floor + 0.32);
      // Its body is drawn on its own, so the game can shake it.
      expect(ARENA_LAYOUT.piles.find((p) => p.id === g.body)?.animated).toBe(
        true,
      );
    }
  });
});

describe("Generator state", () => {
  it("both start on; only Batman switches one off, once, and only that circuit", () => {
    const power = new PowerState();

    expect(power.isOn("interior")).toBe(true);
    expect(power.isOn("exterior")).toBe(true);
    expect(power.shutDown("generator-roof", "thug")).toBe("denied");
    expect(power.isOn("exterior")).toBe(true);
    expect(power.shutDown("generator-roof", "batman")).toBe("off");
    expect(power.shutDown("generator-roof", "batman")).toBe("already");
    expect(power.isOn("exterior")).toBe(false);
    expect(power.isOn("interior")).toBe(true);
    expect(power.shutDown("generator-main", "batman")).toBe("off");
    expect(power.shutDown("not-a-generator", "batman")).toBe("denied");
    power.reset();
    expect(power.isOn("interior") && power.isOn("exterior")).toBe(true);
  });
});

describe("Starting a generator again", () => {
  it("waits ten seconds off, then starts, and can be switched off and on again and again", () => {
    const power = new PowerState();

    expect(RESTART_DELAY).toBe(10);
    expect(power.switchOn("generator-roof", 0)).toBe("already");
    expect(power.shutDown("generator-roof", "batman", 100)).toBe("off");
    expect(power.secondsUntilRestart("exterior", 104)).toBeCloseTo(6);
    expect(power.switchOn("generator-roof", 104)).toBe("cooling");
    expect(power.isOn("exterior")).toBe(false);
    expect(power.switchOn("generator-roof", 110)).toBe("on");
    expect(power.isOn("exterior")).toBe(true);
    // And again, with its own ten seconds.
    expect(power.shutDown("generator-roof", "batman", 120)).toBe("off");
    expect(power.switchOn("generator-roof", 125)).toBe("cooling");
    expect(power.switchOn("generator-roof", 131)).toBe("on");
    expect(power.switchOn("nope", 200)).toBe("denied");
  });
});

describe("Generator smoke", () => {
  const run = (smoke: GeneratorSmoke, seconds: number): void => {
    for (let t = 0; t < seconds; t += 0.05) {
      smoke.update(0.05);
    }
  };

  it("a thin trickle while it runs, a thick plume after a start, none while off", () => {
    const smoke = new GeneratorSmoke(ARENA_LAYOUT.generators);
    const id = "generator-main";

    run(smoke, 4);
    const idle = smoke.count(id);

    expect(idle).toBeGreaterThan(0);
    expect(idle).toBeLessThanOrEqual(Math.ceil(IDLE_RATE * 4));

    smoke.startUp(id);
    run(smoke, 2);
    expect(smoke.count(id)).toBeGreaterThan(idle * 3);
    expect(START_RATE).toBeGreaterThan(IDLE_RATE * 5);

    smoke.setRunning(id, false);
    run(smoke, 8);
    expect(smoke.count(id)).toBe(0);
    smoke.dispose();
  });
});

describe("The lamps follow their circuit", () => {
  const arena = new Arena();
  const lamp = (id: string): THREE.Light =>
    arena.group.getObjectByName(id) as THREE.Light;
  const brightness = (id: string): number =>
    lamp(id).color.r + lamp(id).color.g + lamp(id).color.b;
  const settle = (): void => {
    for (let t = 0; t < 12; t += 0.1) {
      arena.update(0.1);
    }
  };
  const lampsOf = (circuit: "interior" | "exterior"): string[] =>
    nightLights(ARENA_LAYOUT)
      .map((l) => l.id)
      .filter((id) => circuitOfLamp(id) === circuit);

  it("switching the roof generator off darkens the outdoor lamps and only those", () => {
    const inside = brightness("bulb-junk-a");
    const indicator = brightness("indicator-server-racks");

    arena.setCircuitPower("exterior", false);
    settle();

    for (const id of lampsOf("exterior")) {
      expect(brightness(id), id).toBeLessThan(0.01);
    }

    expect(brightness("bulb-junk-a")).toBeCloseTo(inside);
    expect(brightness("tube-armory-1")).toBeGreaterThan(0.5);
    expect(brightness("indicator-server-racks")).toBeCloseTo(indicator);
    // Still in the scene: no shader change when a lamp goes out.
    expect(lamp("halogen-roof-east").visible).toBe(true);
  });

  it("the lamps go out one by one, and come back in the reverse order", () => {
    const ids = lampsOf("exterior");
    const reached = (up: boolean): string[] => {
      const order: string[] = [];

      for (let t = 0; t < 10; t += 0.05) {
        arena.update(0.05);

        for (const id of ids) {
          const lit = arena.lampLevelOf(id) > 0.5;

          if (lit === up && !order.includes(id)) {
            order.push(id);
          }
        }
      }

      return order;
    };

    arena.setCircuitPower("exterior", true);
    settle();
    arena.setCircuitPower("exterior", false);
    // Not all at once: a moment in, some are still fully lit and some are dark.
    for (let t = 0; t < 0.9; t += 0.05) {
      arena.update(0.05);
    }
    const levels = ids.map((id) => arena.lampLevelOf(id));

    expect(Math.min(...levels)).toBeLessThan(0.5);
    expect(Math.max(...levels)).toBe(1);

    const offOrder: string[] = ids.filter((id) => arena.lampLevelOf(id) <= 0.5);

    for (const id of reached(false)) {
      if (!offOrder.includes(id)) {
        offOrder.push(id);
      }
    }

    expect(offOrder).toHaveLength(ids.length);

    arena.setCircuitPower("exterior", true);

    const onOrder = reached(true);

    expect(onOrder).toHaveLength(ids.length);
    // The last to go out is the first back.
    expect(onOrder[0]).toBe(offOrder[offOrder.length - 1]);
    expect(onOrder[onOrder.length - 1]).toBe(offOrder[0]);
  });

  it("switching the indoor generator off darkens the room lamps and tubes, and the outdoor ones are untouched", () => {
    arena.setCircuitPower("exterior", true);
    arena.setCircuitPower("interior", false);
    settle();

    for (const id of lampsOf("interior")) {
      expect(brightness(id), id).toBeLessThan(0.01);
    }

    expect(brightness("halogen-roof-east")).toBeGreaterThan(0.5);
    expect(brightness("indicator-server-racks")).toBeGreaterThan(0.1);
  });

  it("a halogen head goes black when its circuit is off (no white lens left)", () => {
    arena.setCircuitPower("exterior", false);
    settle();

    const glow = arena.group.getObjectByName("glow-halogen-roof-east")!;
    let lens: THREE.MeshBasicMaterial | null = null;

    glow.traverse((o) => {
      if (
        o instanceof THREE.Mesh &&
        o.geometry instanceof THREE.PlaneGeometry
      ) {
        lens = o.material as THREE.MeshBasicMaterial;
      }
    });

    const material = lens as unknown as THREE.MeshBasicMaterial;

    expect(material).not.toBeNull();
    expect(
      Math.max(material.color.r, material.color.g, material.color.b),
    ).toBeLessThan(0.02);
  });

  it("a new round puts both back", () => {
    arena.setCircuitPower("interior", true);
    arena.setCircuitPower("exterior", true);
    settle();

    for (const id of [...lampsOf("interior"), ...lampsOf("exterior")]) {
      expect(brightness(id), id).toBeGreaterThan(0.1);
    }
  });
});
