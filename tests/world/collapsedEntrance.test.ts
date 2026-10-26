import { describe, expect, it } from "vitest";

import { ArenaCollision } from "../../src/world/ArenaCollision";
import { DOOR_HEIGHT, WALL_THICKNESS } from "../../src/world/ArenaLayout";
import {
  HIDDEN_AT_LEAST,
  SLIT,
  buildCollapse,
  collapseCoverage,
  entranceOf,
  holeOf,
} from "../../src/world/CollapsedEntrance";
import { createCrimeTape } from "../../src/world/CrimeTape";
import { nightLights } from "../../src/world/NightLights";
import { circuitOfLamp } from "../../src/world/PowerCircuits";
import { ARENA_LAYOUT as layout } from "../../src/world/UpperFloorMap";

const entrance = entranceOf(layout.rooms, WALL_THICKNESS, DOOR_HEIGHT);
const world = new ArenaCollision(layout);
const F = entrance.floor;

describe("Where the vault entrance is", () => {
  it("is the Server room's own west doorway, read from the room", () => {
    const room = layout.rooms.find((r) => r.id === "room-server")!;
    const door = room.doors.find((d) => d.side === "w")!;

    expect(entrance.face).toBe(room.minX);
    expect(entrance.centre).toBe(door.at);
    expect(entrance.width).toBe(door.width);
    expect(entrance.floor).toBe(room.floorY);
    // It looks out onto the loading dock, away from the room.
    expect(entrance.out).toBe(-1);
  });

  it("puts every piece of the collapse in front of that doorway, on the dock side", () => {
    const { elements } = buildCollapse(entrance);

    for (const e of elements) {
      // Within the doorway's width and a few metres out (spilled gravel the
      // furthest), and a little way in at most.
      expect(Math.abs(e.z - entrance.centre), "z").toBeLessThan(
        entrance.width / 2 + 2.5,
      );
      expect(e.x, "x").toBeGreaterThan(entrance.face - 3.2);
      expect(e.x, "x").toBeLessThan(entrance.face + 1.4);
    }
  });

  it("is not at the spawn: its sealed door is as it was and nothing of the collapse is there", () => {
    const nw = layout.rooms.find((r) => r.id === "room-spawn-nw")!;

    expect(layout.piles.some((p) => p.id === "fittings-gate-closed")).toBe(
      true,
    );

    for (const pile of layout.piles.filter((p) => /vault/.test(p.id))) {
      expect(pile.x, pile.id).toBeGreaterThan(nw.maxX);
    }

    expect(layout.lights.filter((l) => /scene/.test(l.id))).toHaveLength(1);

    for (const l of layout.lights.filter((x) => /scene/.test(x.id))) {
      expect(l.x).toBeGreaterThan(15);
    }

    for (const tape of layout.tapes ?? []) {
      for (const run of tape.runs) {
        expect(run.from[0]).toBeGreaterThan(15);
      }
    }
  });
});

describe("The collapse", () => {
  const collapse = buildCollapse(entrance);

  it("hides at least 92% of the doorway from the dock, and leaves one small gap", () => {
    const covered = collapseCoverage(entrance, collapse.footprints);

    expect(covered).toBeGreaterThanOrEqual(HIDDEN_AT_LEAST);
    expect(covered).toBeLessThan(0.99);

    const hole = holeOf(entrance);
    const gap = (SLIT.u1 - SLIT.u0) * (SLIT.y1 - SLIT.y0);

    expect(gap / ((hole.u1 - hole.u0) * (hole.y1 - hole.y0))).toBeLessThan(
      0.05,
    );
  });

  it("is the same every run, varied in size and kind, and light on meshes", () => {
    expect(buildCollapse(entrance).elements).toHaveLength(
      collapse.elements.length,
    );

    const kinds = new Set(collapse.elements.map((e) => e.shape));

    // Broken rock, chipped slabs, bricks and the bent reinforcement.
    for (const k of ["rock", "slab", "brick", "pipe"] as const) {
      expect(kinds.has(k), k).toBe(true);
    }

    expect(
      new Set(collapse.elements.map((e) => (e.sx * e.sy * e.sz).toFixed(3)))
        .size,
    ).toBeGreaterThan(50);
    // A modest count: merged, it is a handful of meshes.
    expect(collapse.elements.length).toBeLessThan(820);
    // And colour is varied, not one tone.
    expect(new Set(collapse.elements.map((e) => e.color)).size).toBeGreaterThan(
      8,
    );
  });

  it("is snapped rebar and broken wall at the doorway's edge, never a clean outline", () => {
    const bars = collapse.elements.filter((e) => e.shape === "pipe");

    expect(bars.length).toBeGreaterThanOrEqual(10);
    // Fractured pieces along both jambs and over the lintel.
    const edge = collapse.elements.filter(
      (e) =>
        e.shape === "slab" &&
        Math.abs(Math.abs(e.z - entrance.centre) - entrance.width / 2) < 0.4,
    );

    expect(edge.length).toBeGreaterThanOrEqual(4);
  });
});

describe("The doorway stays shut, and nothing else is shut with it", () => {
  const z0 = entrance.centre - entrance.width / 2;
  const z1 = entrance.centre + entrance.width / 2;

  it("cannot be walked through: not at the heap, not in the doorway, not just inside", () => {
    for (let z = z0 + 0.1; z <= z1 - 0.1; z += 0.2) {
      for (const x of [20.9, 21.5, 22.1, 22.6]) {
        expect(world.isBlocked(x, z, F, 0.35), `${x},${z}`).toBe(true);
      }
    }
  });

  it("is open dock floor in front of it, and the lane from the walkway into the dock is clear", () => {
    expect(world.isBlocked(15, entrance.centre, F, 0.35)).toBe(false);

    // The mouth where the east walkway meets the dock, and the way north.
    for (const [x, z] of [
      [18.9, -12.8],
      [19.2, -13.6],
      [18.6, -15],
      [17.2, -17.5],
    ] as const) {
      expect(world.isBlocked(x, z, F, 0.45), `${x},${z}`).toBe(false);
    }
  });

  it("leaves nothing waist-high on the dock to jump: the one lamp lies on the floor with a low, slim head and no case beside it", () => {
    for (const lamp of nightLights(layout).filter((x) => /scene/.test(x.id))) {
      const boxes = layout.walls.filter((w) =>
        w.id.startsWith(`fittings-vault-${lamp.id}`),
      );

      expect(boxes).toHaveLength(1);
      expect(boxes[0].maxX - boxes[0].minX).toBeLessThan(0.5);
      expect(boxes[0].maxZ - boxes[0].minZ).toBeLessThan(0.5);
    }
  });

  it("has no floodlight, post or drum in the doorway or the route past it", () => {
    for (const l of nightLights(layout).filter((x) => /scene/.test(x.id))) {
      expect(circuitOfLamp(l.id)).toBe("exterior");
      expect(l.target!.x).toBeGreaterThan(20.5);
      expect(l.target!.x).toBeLessThan(23);
    }
  });
});

describe("The crime-scene tape", () => {
  const tape = layout.tapes![0];

  it("is strung across the approach to the heap, sagging, never in it", () => {
    expect(tape.runs.length).toBeGreaterThanOrEqual(3);

    for (const run of tape.runs) {
      expect(run.sag).toBeGreaterThan(0);

      // One end is on a lamp mast out in front; a side run's other end is
      // tied to the wall beside the doorway.
      expect(Math.min(run.from[0], run.to[0])).toBeLessThan(
        entrance.face - 1.5,
      );

      for (const end of [run.from, run.to]) {
        expect(end[0]).toBeLessThan(entrance.face);
        expect(end[1]).toBeGreaterThan(F + 0.5);
        expect(end[1]).toBeLessThan(F + 1.3);
      }
    }
  });

  it("is read from the dock: its viewer is out in front, and each run has a face and a back", () => {
    expect(tape.viewer[0]).toBeLessThan(entrance.face - 4);

    const group = createCrimeTape(tape.runs, tape.viewer);

    expect(group.children).toHaveLength(tape.runs.length * 2);
  });
});
