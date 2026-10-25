import { describe, expect, it } from "vitest";

import { ArenaCollision } from "../../src/world/ArenaCollision";
import { ROOF_LOW } from "../../src/world/ArenaLayout";
import { nightLights } from "../../src/world/NightLights";
import { circuitOfLamp } from "../../src/world/PowerCircuits";
import { ARENA_LAYOUT as layout } from "../../src/world/UpperFloorMap";
import { spawnPlayer } from "./playerHarness";

const world = new ArenaCollision();
const room = layout.rooms.find((r) => r.id === "room-server")!;

describe("The Server room, carried north over the old spawn yard", () => {
  it("is one room on the upper floor, 14 m deep, and the map has no second north-east room", () => {
    expect(layout.rooms.some((r) => r.id === "room-spawn-ne")).toBe(false);
    expect(room.floorY).toBe(4);
    expect([room.minX, room.maxX, room.minZ, room.maxZ]).toEqual([
      22, 32, -24, -10,
    ]);
    expect(room.doors).toHaveLength(1);
    // One staircase is left (out of the north-west yard); this room has none.
    expect(layout.stairs.map((s) => s.id)).toEqual(["stairs-spawn-nw"]);
  });

  it("is not a spawn area: the only spawn points are in the north-west yard, with the stairs", () => {
    const nw = layout.rooms.find((r) => r.id === "room-spawn-nw")!;

    expect(layout.spawnPoints).toHaveLength(2);

    for (const p of layout.spawnPoints) {
      expect(p.x).toBeGreaterThan(nw.minX);
      expect(p.x).toBeLessThan(nw.maxX);
      expect(p.z).toBeGreaterThan(nw.minZ);
      expect(p.z).toBeLessThan(nw.maxZ);
      expect(p.y).toBe(0);
    }

    expect(layout.posters.map((p) => p.here)).toEqual(["nw"]);
  });

  it("holds the server racks and console, moved in whole and inside its walls", () => {
    for (const id of [
      "rack-server-1",
      "rack-server-2",
      "rack-server-3",
      "console-server",
    ]) {
      const rack = layout.walls.find((w) => w.id === id)!;

      expect(rack, id).toBeDefined();
      expect(rack.minX).toBeGreaterThanOrEqual(room.minX + 0.29);
      expect(rack.maxX).toBeLessThanOrEqual(room.maxX - 0.29);
      expect(rack.minZ).toBeGreaterThanOrEqual(room.minZ + 0.29);
      expect(rack.maxZ).toBeLessThanOrEqual(room.maxZ - 0.29);
      expect(rack.bottom).toBe(4);
    }
  });

  it("opens west onto the loading dock, and the way out is walkable", () => {
    const p = spawnPlayer(26.0, 4, -14.3, Math.PI / 2);

    p.input.keys.add("KeyW");
    p.step(3);

    expect(p.player.position.x).toBeLessThan(21);
    expect(p.feet()).toBeCloseTo(4, 2);
  });

  it("has a roof over it, and none of its walls floats", () => {
    expect(
      layout.platforms.some((p) => p.id.startsWith("room-server-roof")),
    ).toBe(true);

    // The floor under it is solid down to the ground.
    expect(world.groundHeight(27, -20, 4)).toBe(4);
    expect(world.groundHeight(27, -11, 4)).toBe(4);
  });
});

describe("The extended bridge", () => {
  const catwalk = layout.platforms.find((p) => p.id === "catwalk-east")!;

  it("runs from the unified room's south wall to the Break room, 13 m long", () => {
    expect(catwalk.minZ).toBe(room.maxZ);
    expect(catwalk.maxZ).toBe(3);
    expect(catwalk.maxZ - catwalk.minZ).toBeGreaterThanOrEqual(13);
    expect(catwalk.height).toBeCloseTo(ROOF_LOW);
  });

  it("is walkable end to end at its own height, with no gap in the floor", () => {
    for (let z = catwalk.minZ + 0.2; z < catwalk.maxZ; z += 0.25) {
      expect(world.groundHeight(27.2, z, ROOF_LOW), `z ${z}`).toBeCloseTo(
        ROOF_LOW,
      );
    }
  });

  it("has a railing down both sides, the full length", () => {
    for (const id of ["rail-catwalk-west-1", "rail-catwalk-east-1"]) {
      const rails = layout.walls.filter((w) => w.id.startsWith(id));

      expect(rails.length, id).toBeGreaterThan(0);
      expect(Math.min(...rails.map((r) => r.minZ)), id).toBeCloseTo(room.maxZ);
      expect(Math.max(...rails.map((r) => r.maxZ)), id).toBeCloseTo(3);
    }
  });

  it("has its ladder at the room's south face, on the bridge's width", () => {
    const ladder = layout.ladders.find((l) => l.id === "ladder-catwalk-east")!;

    expect(ladder.z).toBeCloseTo(room.maxZ + 0.12);
    expect(ladder.x).toBeGreaterThan(catwalk.minX);
    expect(ladder.x).toBeLessThan(catwalk.maxX);
    expect(ladder.bottomY).toBeCloseTo(ROOF_LOW);
  });

  it("the east deck's service area moved with the wall it stands against", () => {
    const gen = layout.walls.find((w) => w.id === "generator-east-deck")!;

    expect(gen.minZ).toBeGreaterThanOrEqual(room.maxZ);
    expect(gen.minZ).toBeLessThan(room.maxZ + 0.6);
  });
});

describe("The Server room is cleared of the old spawn dressing", () => {
  it("has no stored materials, crates, poster or lamp post: only the server furnishings", () => {
    for (const id of [
      "stack-spawn-ne",
      "crate-spawn-ne-d",
      "fittings-spawn-ne-logs",
      "fittings-spawn-ne-bricks",
      "fittings-spawn-ne-cabinet",
      "fittings-spawn-ne-pallet",
      "lamp-spawn-ne",
    ]) {
      expect(
        layout.walls.some((w) => w.id === id),
        id,
      ).toBe(false);
      expect(
        layout.piles.some((p) => p.id === id),
        id,
      ).toBe(false);
    }

    expect(layout.posters.some((p) => p.here === "ne")).toBe(false);
    expect(layout.lights.some((l) => l.id === "light-lamp-spawn-ne")).toBe(
      false,
    );
  });

  it("keeps the racks' wall fittings on a wall: the north wall, the east wall or the west wall's solid ends", () => {
    for (const pile of layout.piles.filter((p) =>
      ["fittings-server-wall", "fittings-server-cabinet"].includes(p.id),
    )) {
      for (const e of pile.elements) {
        const x = pile.x + e.x;
        const z = pile.z + e.z;
        const onNorth = z < room.minZ + 1.0;
        const onEast = x > room.maxX - 0.6;
        const onWest = x < room.minX + 0.6 && !(z > -16.4 && z < -12.2); // not in the doorway

        expect(onNorth || onEast || onWest, `${pile.id} at ${x},${z}`).toBe(
          true,
        );
      }
    }
  });
});

describe("The wall halogen over the bridge", () => {
  const lamp = nightLights(layout).find((l) => l.id === "halogen-wall-bridge")!;
  const catwalk = layout.platforms.find((p) => p.id === "catwalk-east")!;

  it("is one yellowish-orange halogen, high on the room's south wall over the bridge's north end", () => {
    expect(lamp).toBeDefined();
    expect(lamp.y).toBeGreaterThanOrEqual(8.5);
    // On the wall's outer face (z -10): a short bracket out from it.
    expect(lamp.z).toBeGreaterThan(room.maxZ);
    expect(lamp.z).toBeLessThan(room.maxZ + 0.6);
    // At the east corner of the wall (the room's east wall is at x 31.7), the
    // bridge's end a few metres west of it.
    expect(lamp.x).toBeGreaterThan(30);
    expect(lamp.x).toBeLessThan(room.maxX - 0.3);
    // Aimed down the bridge and down toward the ground (not straight across).
    expect(lamp.target!.z).toBeGreaterThan(lamp.z);

    const down = Math.atan2(
      lamp.y - lamp.target!.y,
      Math.hypot(lamp.target!.x - lamp.x, lamp.target!.z - lamp.z),
    );

    expect(down).toBeGreaterThan(0.45);
    expect(down).toBeLessThan(0.9);
    // Yellowish-orange: red high, green mid, blue low.
    const r = (lamp.color >> 16) & 255;
    const g = (lamp.color >> 8) & 255;
    const b = lamp.color & 255;

    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b + 40);
    // Outdoor: on the roof generator's circuit.
    expect(circuitOfLamp("halogen-wall-bridge")).toBe("exterior");
  });

  it("the bridge's steel is complete: stringers, cross beams, portal columns and braces, and knees at both walls, the whole 13 m", () => {
    const steel = layout.steel;
    const stringers = steel.filter((m) =>
      m.id.startsWith("steel-catwalk-stringer-"),
    );
    const cross = steel.filter((m) => m.id.startsWith("steel-catwalk-cross-"));
    const columns = steel.filter((m) =>
      m.id.startsWith("steel-column-catwalk-"),
    );
    const braces = steel.filter((m) => m.id.startsWith("steel-catwalk-brace-"));
    const knees = steel.filter((m) => m.id.startsWith("steel-catwalk-knee-"));

    // Two stringers, the full length.
    expect(stringers).toHaveLength(2);

    for (const m of stringers) {
      expect(Math.min(m.from[2], m.to[2])).toBeCloseTo(catwalk.minZ);
      expect(Math.max(m.from[2], m.to[2])).toBeCloseTo(catwalk.maxZ);
    }

    // Cross beams at a steady spacing from end to end (no span over 2.3 m).
    const zs = cross.map((m) => m.from[2]).sort((a, b) => a - b);

    expect(zs.length).toBeGreaterThanOrEqual(7);
    expect(zs[0]).toBeLessThan(catwalk.minZ + 1.2);
    expect(zs[zs.length - 1]).toBeGreaterThan(catwalk.maxZ - 1.8);

    for (let i = 1; i < zs.length; i++) {
      expect(zs[i] - zs[i - 1], `beam ${i}`).toBeLessThan(2.3);
    }

    // Two portal frames: a column each side of the bridge, tied by a cross
    // beam at their top and braced in an X.
    expect(columns).toHaveLength(4);
    expect(braces).toHaveLength(4);

    for (const c of columns) {
      expect(c.from[0] < catwalk.minX || c.from[0] > catwalk.maxX).toBe(true);
      expect(c.from[2]).toBeGreaterThan(catwalk.minZ);
      expect(c.from[2]).toBeLessThan(catwalk.maxZ);
      expect(c.from[1]).toBe(4);
      // The top meets the cross beam's underside.
      expect(c.to[1]).toBeGreaterThan((catwalk.bottom ?? 0) - 0.5);
      expect(c.to[1]).toBeLessThanOrEqual(catwalk.bottom ?? 0);
      expect(
        cross.some(
          (m) =>
            Math.abs(m.from[2] - c.from[2]) < 0.01 &&
            Math.min(m.from[0], m.to[0]) <= c.from[0] + 0.01 &&
            Math.max(m.from[0], m.to[0]) >= c.from[0] - 0.01,
        ),
      ).toBe(true);
    }

    // Knees up from both walls, under both stringers.
    expect(knees).toHaveLength(4);
    expect(
      knees
        .filter((m) => m.id.includes("knee-s-"))
        .every((m) => m.from[2] < catwalk.minZ + 0.2),
    ).toBe(true);
    expect(
      knees
        .filter((m) => m.id.includes("knee-n-"))
        .every((m) => m.from[2] > catwalk.maxZ - 0.2),
    ).toBe(true);
  });
});

describe("Shots and throws stop at what was added", () => {
  const stops = (
    from: [number, number, number],
    to: [number, number, number],
  ): boolean => world.segmentClearFraction(...from, ...to) < 1;

  it("the bridge's steel: stringers, cross beams, braces, knees and columns all block, and the air between them does not", () => {
    // A cross beam (z -5.25, under the stringers), crossing the bridge's width.
    expect(stops([24, 7.72, -5.25], [30, 7.72, -5.25])).toBe(true);
    // A stringer, along its length at x 26.55.
    expect(stops([26.55, 7.7, -12], [26.55, 7.7, -8])).toBe(true);
    // The X brace of the portal at z -7: through its middle, along z.
    expect(stops([27.2, 6.0, -8.5], [27.2, 6.0, -5.5])).toBe(true);
    // A portal column.
    expect(stops([24, 5.5, -7], [26.5, 5.5, -7])).toBe(true);
    // The open air in the portal (above the diagonals, under the beam) is open.
    expect(stops([26.3, 5.8, -8], [26.3, 5.8, -6])).toBe(false);
    // A knee brace at the south end.
    expect(stops([26.55, 7.1, -11], [26.55, 7.1, -9])).toBe(true);
  });

  it("the Server room's overhead beams, duct and trays block", () => {
    const blocks = layout.shotSolids!.filter((b) =>
      b.id.startsWith("fittings-server-trays-shot"),
    );

    expect(blocks.length).toBeGreaterThan(10);

    for (const b of blocks) {
      // Inside the room, under its ceiling.
      expect(b.minX).toBeGreaterThanOrEqual(room.minX);
      expect(b.maxX).toBeLessThanOrEqual(room.maxX);
      expect(b.minZ).toBeGreaterThanOrEqual(room.minZ);
      expect(b.maxZ).toBeLessThanOrEqual(room.maxZ);
      expect(b.height).toBeLessThanOrEqual(10.6);
    }

    // A shot along the room at the height of the beams is stopped by one.
    const beam = blocks.find((b) => b.maxX - b.minX > 5)!;

    expect(beam).toBeDefined();
    expect(
      stops(
        [
          beam.minX - 1,
          (beam.bottom! + beam.height) / 2,
          (beam.minZ + beam.maxZ) / 2,
        ],
        [
          beam.maxX + 1,
          (beam.bottom! + beam.height) / 2,
          (beam.minZ + beam.maxZ) / 2,
        ],
      ),
    ).toBe(true);
  });

  it("the roof wall over the Server room's west edge stops a shot across it", () => {
    expect(stops([20, 11.5, -21.3], [25, 11.5, -21.3])).toBe(true);
  });

  it("the wall halogen's head stops a shot", () => {
    expect(stops([31.0, 9.6, -7], [31.0, 9.6, -9.9])).toBe(true);
  });
});

describe("The low work halogen on the deck is gone, and the bridge halogen is wired", () => {
  it("has no support-deck-1 left, in the layout or the lights", () => {
    expect(layout.piles.some((p) => p.id.startsWith("support-deck-1"))).toBe(
      false,
    );
    expect(layout.lights.some((l) => l.id === "light-support-deck-1")).toBe(
      false,
    );
  });

  it("has a lead from the deck's board to a junction, and a conduit climbing the wall to the lamp", () => {
    const service = layout.piles.find((p) => p.id === "deck-service")!;
    const conduit = service.elements.filter(
      (e) =>
        Math.abs(service.x + e.x - 31.0) < 0.05 &&
        Math.abs(service.z + e.z - -9.95) < 0.05 &&
        e.sx > 4,
    );

    expect(conduit.length).toBeGreaterThan(0);
    // It stands from near the deck to the lamp's bracket (y 9.6).
    const top = Math.max(...conduit.map((e) => service.baseY + e.y + e.sx / 2));
    const bottom = Math.min(
      ...conduit.map((e) => service.baseY + e.y - e.sx / 2),
    );

    expect(top).toBeGreaterThan(9.0);
    expect(bottom).toBeLessThan(4.8);
  });
});
