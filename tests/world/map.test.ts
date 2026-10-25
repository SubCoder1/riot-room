import { describe, expect, it } from "vitest";

import { ArenaCollision, PLAYER_RADIUS } from "../../src/world/ArenaCollision";
import {
  ROOF_HIGH,
  ROOF_LOW,
  HANG_DROP,
  ROOF_MID,
  UPPER_FLOOR_Y,
  allSolids,
  stairsToSteps,
  type BoxSolid,
  type CylinderSolid,
  type Zone,
} from "../../src/world/ArenaLayout";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";
import {
  CELL,
  cellX,
  cellZ,
  COLS,
  ROWS,
  distanceAtHeight,
  distanceTo,
  pathLength,
  pathTo,
  walkField,
  world,
} from "./nav";

const layout = ARENA_LAYOUT;
const F = UPPER_FLOOR_Y;
// The people who walk the map start in a spawn area, on the ground floor of
// the north-west corner (the staircases are the way up from there).
const start = { x: -26.5, z: -20.5 };

/** Is the point inside one of the staircases (so a route can be forced onto the other)? */
function onStairs(id: string, x: number, z: number): boolean {
  const stairs = layout.stairs.find((s) => s.id === id)!;
  const steps = stairsToSteps(stairs);
  const along = stairs.direction.endsWith("x");
  const lo = Math.min(...steps.map((s) => (along ? s.minX : s.minZ)));
  const hi = Math.max(...steps.map((s) => (along ? s.maxX : s.maxZ)));
  const u = along ? x : z;
  const v = along ? z : x;

  return (
    v >= stairs.crossMin - 0.5 &&
    v <= stairs.crossMax + 0.5 &&
    u >= lo - 0.5 &&
    u <= hi + 0.5
  );
}

/** Cells inside a rectangle that a body can stand on at `feet`. */
function freeCells(
  area: { minX: number; maxX: number; minZ: number; maxZ: number },
  feet: number,
): Array<{ x: number; z: number }> {
  const cells: Array<{ x: number; z: number }> = [];

  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const x = cellX(i);
      const z = cellZ(j);

      if (
        x > area.minX &&
        x < area.maxX &&
        z > area.minZ &&
        z < area.maxZ &&
        !world.isBlocked(x, z, feet, PLAYER_RADIUS) &&
        Math.abs(world.groundHeight(x, z, feet) - feet) < 0.01
      ) {
        cells.push({ x, z });
      }
    }
  }

  return cells;
}

/** The rooms deliberately left open to the sky (under the main roof) for entry from above. */
const OPEN_TOP = ["room-spawn-nw", "room-hall", "room-spawn-ne"];

function roofOf(room: { id: string }): BoxSolid {
  // (A roof with a hole in it is in pieces: `-roof-1`, `-roof-2`...)
  return layout.platforms.find(
    (p) => p.id === `${room.id}-roof` || p.id.startsWith(`${room.id}-roof-`),
  )!;
}

describe("What was built", () => {
  it("has twelve rooms of different sizes and shapes", () => {
    expect(layout.rooms).toHaveLength(12);

    const areas = new Set(
      layout.rooms.map((r) =>
        Math.round((r.maxX - r.minX) * (r.maxZ - r.minZ)),
      ),
    );

    expect(areas.size).toBeGreaterThanOrEqual(9);
    expect(
      layout.rooms.some((r) => (r.maxX - r.minX) * (r.maxZ - r.minZ) >= 140),
    ).toBe(true);
    expect(
      layout.rooms.some((r) => (r.maxX - r.minX) * (r.maxZ - r.minZ) <= 60),
    ).toBe(true);
  });

  it("every room has an entrance, a roof and space to fight in", () => {
    for (const room of layout.rooms) {
      // (A spawn area on the ground floor has its staircase as the way out.)
      if (!room.id.startsWith("room-spawn-")) {
        expect(room.doors.length, room.id).toBeGreaterThanOrEqual(1);
      }

      if (!OPEN_TOP.includes(room.id)) {
        expect(roofOf(room), room.id).toBeDefined();
      }
      expect(room.maxX - room.minX - 0.6, room.id).toBeGreaterThanOrEqual(5);
      expect(room.maxZ - room.minZ - 0.6, room.id).toBeGreaterThanOrEqual(5);
    }
  });

  it("no room is an empty box: each one holds its own props", () => {
    const solids = [...layout.walls, ...layout.platforms];

    for (const room of layout.rooms) {
      const inside = solids.filter(
        (s) =>
          (s.role === "prop" ||
            s.role === "machinery" ||
            s.id.startsWith("dais") ||
            s.id.startsWith("podium")) &&
          s.minX >= room.minX &&
          s.maxX <= room.maxX &&
          s.minZ >= room.minZ &&
          s.maxZ <= room.maxZ &&
          (s.bottom ?? room.floorY) <= room.floorY + 0.5 &&
          s.height < room.floorY + 4,
      );

      expect(inside.length, room.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("rooms are connected to each other as well as to the walkways", () => {
    // A doorway whose far side is inside another room.
    const links = new Set<string>();

    for (const room of layout.rooms) {
      for (const door of room.doors) {
        const horizontal = door.side === "n" || door.side === "s";
        const edge =
          door.side === "n"
            ? room.minZ
            : door.side === "s"
              ? room.maxZ
              : door.side === "w"
                ? room.minX
                : room.maxX;
        const out = door.side === "n" || door.side === "w" ? -1 : 1;
        const x = horizontal ? door.at : edge + out * 0.6;
        const z = horizontal ? edge + out * 0.6 : door.at;
        const other = layout.rooms.find(
          (r) =>
            r !== room && x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ,
        );

        if (other) {
          links.add([room.id, other.id].sort().join("|"));
        }
      }
    }

    expect(links.size).toBeGreaterThanOrEqual(5);
  });

  it("has four major balconies that differ in size, height and reach", () => {
    const major = layout.zones.filter(
      (z) => z.kind === "balcony" && z.id.startsWith("balcony-"),
    );

    expect(major).toHaveLength(4);
    expect(
      new Set(major.map((b) => `${b.maxX - b.minX}x${b.maxZ - b.minZ}`)).size,
    ).toBe(4);
    expect(major.some((b) => b.floorY < F)).toBe(true);
    expect(major.some((b) => b.floorY > F)).toBe(true);

    // They hang in the air: the ground under them is open.
    for (const balcony of major) {
      const slab = layout.platforms.find((p) => p.id === balcony.id)!;

      expect(slab.bottom, balcony.id).toBeLessThan(slab.height - 0.4);
    }

    // One reaches far out, and a recessed one sits back in the building.
    expect(
      major.some((b) => b.maxZ - b.minZ >= 4 || b.maxX - b.minX >= 7),
    ).toBe(true);
    expect(layout.zones.some((z) => z.id === "recess-north")).toBe(true);
  });

  it("walkways come in wide, medium and narrow widths", () => {
    const strips = layout.zones.filter(
      (z) => z.kind === "walkway" || z.kind === "corridor",
    );
    const widths = strips.map((w) =>
      Math.min(w.maxX - w.minX, w.maxZ - w.minZ),
    );

    expect(widths.some((w) => w >= 3 && w <= 4.2)).toBe(true);
    expect(widths.some((w) => w >= 2 && w <= 2.5)).toBe(true);
    expect(widths.some((w) => w >= 1.2 && w <= 1.6)).toBe(true);
    expect(
      layout.zones.filter((z) => z.kind === "deck").length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("has exactly two staircases, one out of each spawn area, and none in the central arena", () => {
    expect(layout.stairs.map((s) => s.id).sort()).toEqual([
      "stairs-spawn-ne",
      "stairs-spawn-nw",
    ]);

    for (const stairs of layout.stairs) {
      for (const step of stairsToSteps(stairs)) {
        // Entirely outside the central arena (x -18..18, z -12..12).
        expect(
          step.maxX <= -18 ||
            step.minX >= 18 ||
            step.maxZ <= -12 ||
            step.minZ >= 12,
          `${stairs.id} step at ${step.minX},${step.minZ}`,
        ).toBe(true);
      }
    }

    const nw = layout.stairs.find((s) => s.id === "stairs-spawn-nw")!;
    const ne = layout.stairs.find((s) => s.id === "stairs-spawn-ne")!;
    const room = (id: string) => layout.rooms.find((r) => r.id === id)!;

    // Each starts on the ground floor inside its own spawn area and tops out
    // at the first floor beyond its edge.
    for (const [stairs, spawnArea] of [
      [nw, room("room-spawn-nw")],
      [ne, room("room-spawn-ne")],
    ] as const) {
      const steps = stairsToSteps(stairs);

      expect(spawnArea.floorY).toBe(0);
      expect(steps[0].height).toBeLessThan(0.5);
      expect(steps[steps.length - 1].height).toBeCloseTo(F, 9);
      expect(steps[0].minX).toBeGreaterThanOrEqual(spawnArea.minX - 1e-9);
      expect(steps[0].maxX).toBeLessThanOrEqual(spawnArea.maxX + 1e-9);
      expect(steps[0].minZ).toBeGreaterThanOrEqual(spawnArea.minZ - 1e-9);
      expect(steps[0].maxZ).toBeLessThanOrEqual(spawnArea.maxZ + 1e-9);
    }

    // On opposite sides, climbing toward each other's side of the map.
    expect(nw.direction).toBe("+x");
    expect(ne.direction).toBe("-x");
  });

  it("has a few deliberate ladders: one from the arena, roof ladders and a few secret ones", () => {
    expect(layout.ladders.length).toBeGreaterThanOrEqual(6);
    expect(layout.ladders.length).toBeLessThanOrEqual(9);

    const secret = layout.ladders.filter((l) => l.secret);

    expect(secret.length).toBeGreaterThanOrEqual(2);
    expect(secret.length).toBeLessThanOrEqual(7);
    expect(
      layout.ladders.filter((l) => l.bottomY >= F).length,
    ).toBeGreaterThanOrEqual(4);
    expect(
      layout.ladders.filter((l) => l.bottomY === 0).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      new Set(layout.ladders.map((l) => l.normal)).size,
    ).toBeGreaterThanOrEqual(3);
  });

  it("has eight or more climbable ledges", () => {
    expect(layout.ledges.length).toBeGreaterThanOrEqual(8);

    for (const ledge of layout.ledges) {
      const rise = ledge.topY - ledge.fromY;

      expect(rise, ledge.id).toBeGreaterThanOrEqual(0.75 - 1e-9);
      expect(rise, ledge.id).toBeLessThanOrEqual(2.4 + 1e-9);
    }

    // Prioritised around balconies, roofs and the arena edges.
    const ids = layout.ledges.map((l) => l.id).join(" ");

    expect(ids).toMatch(/balcony/);
    expect(ids).toMatch(/maintenance/);
  });

  it("has two roof layers that can be walked on (the dock is an open yard)", () => {
    // (The one building-wide roof over everything is not a level you walk on.)
    expect(layout.roofLevels.filter((l) => l < 12)).toEqual([
      ROOF_LOW,
      ROOF_HIGH,
    ]);

    const roofs = layout.platforms.filter((p) => p.role === "roof");

    for (const level of layout.roofLevels.filter((l) => l < 12)) {
      expect(
        roofs.filter((r) => r.height === level).length,
        `level ${level}`,
      ).toBeGreaterThanOrEqual(1);
    }

    // The dock has no roof over it.
    expect(roofs.some((r) => r.id.startsWith("roof-dock"))).toBe(false);

    // A roof is a real slab with air beneath it.
    for (const roof of roofs) {
      expect(roof.bottom, roof.id).toBeCloseTo(roof.height - 0.3, 5);
    }
  });

  it("has rooftop machinery and industrial structure", () => {
    const onRoofs = [...layout.walls, ...layout.pillars].filter(
      (s) => (s.bottom ?? 0) >= ROOF_LOW - 0.01,
    );

    expect(onRoofs.length).toBeGreaterThanOrEqual(10);
    expect(layout.pillars.length).toBeGreaterThanOrEqual(2); // tanks
    // Steel beams: the overhead ones and the structural steel members.
    expect(
      layout.overheads.filter((o) => o.material === "steel").length +
        layout.steel.length,
    ).toBeGreaterThanOrEqual(6);
  });

  it("has a single hang point, the plaza's skylight beam: no perches or rails stand over the arena", () => {
    expect(layout.hangZones).toHaveLength(1);

    const zone = layout.hangZones[0];

    expect(
      layout.overheads.some((o) => o.id === `${zone.id}-beam`),
      zone.id,
    ).toBe(true);
    expect(
      layout.steel.some((m) => m.id === `${zone.id}-plate`),
      zone.id,
    ).toBe(true);

    const feet = zone.y - HANG_DROP - zone.floorY;

    expect(feet, zone.id).toBeGreaterThanOrEqual(2.9);
    expect(feet, zone.id).toBeLessThanOrEqual(5.2);

    // Nothing of the old perches remains.
    expect(layout.platforms.some((p) => /perch/.test(p.id))).toBe(false);
    expect(layout.walls.some((w) => /perch/.test(w.id))).toBe(false);
    expect(layout.steel.some((m) => /perch/.test(m.id))).toBe(false);
  });

  it("the arena is open to the sky: no roof over it, and nothing above the perimeter wall", () => {
    expect(layout.platforms.some((p) => p.id === "roof-main")).toBe(false);

    // Nothing stands higher than the perimeter wall's top (13.2 m) and the lamp masts.
    for (const solid of allSolids(layout)) {
      expect(solid.height, solid.id).toBeLessThanOrEqual(17);
    }

    // The sky is open over the arena floor, the walkways and every open-top room
    for (const [x, z] of [
      [-8, 2],
      [-6, -3.5],
      [0, 8],
      [-20, 0],
      [20, 0],
      [3, -9],
    ]) {
      expect(world.ceilingHeight(x, z, 6, 0.3), `${x},${z}`).toBe(
        Number.POSITIVE_INFINITY,
      );
    }
  });

  it("the perimeter wall carries no rails: floodlight supports stand on the first floor instead, with their own lamps", () => {
    expect(layout.platforms.some((p) => p.id.startsWith("hang-wall-"))).toBe(
      false,
    );
    expect(layout.hangZones.some((z) => z.id.startsWith("hang-wall"))).toBe(
      false,
    );

    const masts = layout.walls.filter((w) =>
      /^support-[a-z]+-\d-1$/.test(w.id),
    );

    expect(masts.length).toBeGreaterThanOrEqual(5);
    expect(masts.length).toBeLessThanOrEqual(8);

    for (const mast of masts) {
      const cx = (mast.minX + mast.maxX) / 2;
      const cz = (mast.minZ + mast.maxZ) / 2;

      // On the first floor.
      expect(mast.bottom, mast.id).toBe(F);
      expect(world.groundHeight(cx, cz, F + 0.5), mast.id).toBe(F);
    }

    // One light per support, short range, no shadows (plain point lights).
    const lamps = layout.lights.filter((l) =>
      l.id.startsWith("light-support-"),
    );

    expect(lamps.length).toBeGreaterThanOrEqual(masts.length);

    // Every head is a focused spotlight aimed down at the walkway, and only
    // a couple cast shadows (they are real-time).
    for (const lamp of lamps) {
      expect(lamp.target, lamp.id).toBeDefined();
      expect(lamp.target!.y, lamp.id).toBeLessThan(lamp.y - 2);
    }

    expect(lamps.filter((l) => l.castShadow).length).toBeLessThanOrEqual(2);

    // The service platforms are solid 1.2 m up (a jump), 1.2 x 0.9 m.
    const platforms = layout.walls.filter((w) => /-platform/.test(w.id));

    expect(platforms.length).toBeGreaterThanOrEqual(1);

    for (const platform of platforms) {
      expect(platform.height - F, platform.id).toBeCloseTo(1.2, 5);
      expect(
        Math.max(platform.maxX - platform.minX, platform.maxZ - platform.minZ),
        platform.id,
      ).toBeGreaterThanOrEqual(1.1);
    }
  });

  it("the generator stands in the power room (the Switch room) beside its cabinets", () => {
    const generator = layout.walls.find((w) => w.id === "fittings-generator")!;
    const room = layout.rooms.find((r) => r.id === "room-switch")!;

    expect(generator).toBeDefined();
    expect(generator.minX).toBeGreaterThanOrEqual(room.minX);
    expect(generator.maxX).toBeLessThanOrEqual(room.maxX);
    expect(generator.minZ).toBeGreaterThanOrEqual(room.minZ);
    expect(generator.maxZ).toBeLessThanOrEqual(room.maxZ);
    expect(layout.walls.some((w) => w.id === "fittings-main-panel")).toBe(true);
  });

  it("the open-top rooms have no roof above them, in the drawing or the collision", () => {
    for (const id of OPEN_TOP) {
      const room = layout.rooms.find((r) => r.id === id)!;

      expect(roofOf(room), id).toBeUndefined();

      // Nothing at all between the room's floor and the open sky.
      for (let x = room.minX + 1; x < room.maxX; x += 3) {
        for (let z = room.minZ + 1; z < room.maxZ; z += 3) {
          const ceiling = world.ceilingHeight(x, z, room.floorY + 1.8, 0.3);

          expect(ceiling, `${id} ${x},${z}`).toBe(Number.POSITIVE_INFINITY);
        }
      }
    }

    // The other rooms keep theirs.
    expect(
      layout.rooms.filter((r) => !OPEN_TOP.includes(r.id) && !roofOf(r)),
    ).toHaveLength(0);
  });

  it("the skylight gaps are glazed level with the roofs beside them, and the glass barriers match their collision", () => {
    for (const id of ["glass-plaza"]) {
      const pane = layout.platforms.find((p) => p.id === id)!;

      expect(pane.glass, id).toBe(true);
      expect(pane.role, id).toBe("roof");
      expect(pane.height, id).toBeCloseTo(
        id === "glass-plaza" ? ROOF_HIGH : ROOF_MID,
      );
      // A steel frame all round.
      expect(
        layout.steel.filter((m) => m.id.startsWith(`${id}-frame`)).length,
        id,
      ).toBeGreaterThanOrEqual(4);
    }

    const glassWalls = layout.walls.filter((w) => w.glass);

    // (The barrier along the Warehouse's roof edge and the slanted cover over
    // the yard's wall are gone or drawn only: no glass stands in anyone's way.)
    expect(glassWalls).toHaveLength(0);

    for (const wall of glassWalls) {
      // Stops a body like a railing, however see-through.
      expect(wall.role, wall.id).toBe("railing");
      expect(wall.blockTop, wall.id).toBeGreaterThan(wall.height);
    }

    // The ladder up to the Warehouse roof keeps its opening.
    expect(
      glassWalls.some(
        (w) =>
          w.id.startsWith("glass-barrier-warehouse-west") &&
          w.minZ < 15 &&
          w.maxZ > 15,
      ),
    ).toBe(false);
  });

  it("does not design the ground level: only structure and the ways up stand on it", () => {
    expect(layout.ramps).toHaveLength(0);

    for (const platform of layout.platforms) {
      expect(platform.height, platform.id).toBeGreaterThanOrEqual(2.8);
    }

    // The two spawn areas are on the ground floor: their walls and cover do too.
    const pits = layout.rooms.filter((r) => r.id.startsWith("room-spawn-"));

    for (const solid of [...layout.walls, ...layout.pillars]) {
      if (
        solid.kind === "box" &&
        pits.some(
          (r) =>
            solid.minX >= r.minX - 1e-6 &&
            solid.maxX <= r.maxX + 1e-6 &&
            solid.minZ >= r.minZ - 1e-6 &&
            solid.maxZ <= r.maxZ + 1e-6,
        )
      ) {
        continue;
      }

      const base =
        solid.kind === "box"
          ? (solid.base ?? solid.bottom ?? 0)
          : (solid.bottom ?? 0);

      expect(base, solid.id).toBeGreaterThanOrEqual(2.8);
    }
  });
});

describe("The central arena", () => {
  it("is open: the middle 24 x 8 m is bare floor", () => {
    for (let x = -12; x <= 12; x++) {
      for (let z = -4; z <= 4; z++) {
        expect(world.isBlocked(x, z, 0, PLAYER_RADIUS), `${x},${z}`).toBe(
          false,
        );
      }
    }
  });

  it("is mostly open overall; the balconies float, so only the stairs and landings take floor", () => {
    let open = 0;
    let total = 0;

    for (let x = -17; x <= 17; x++) {
      for (let z = -11; z <= 11; z++) {
        total++;

        if (!world.isBlocked(x, z, 0, 0.2)) open++;
      }
    }

    expect(open / total).toBeGreaterThan(0.75);
  });

  it("can be seen into from the upper floor on all four sides and from the balconies", () => {
    const eye = F + 1.6;
    const sees = (x: number, z: number, toX: number, toZ: number): boolean =>
      !world.segmentBlocked(x, eye, z, toX, 1.3, toZ);

    expect(sees(-7.6, -13.5, -7.6, 0)).toBe(true); // north
    expect(sees(10, 13.5, 8, 0)).toBe(true); // south
    // (The whole west edge is a 1.35 m brick barricade: it is looked over from
    // a vault, not through, so there is no line through it to test.)
    expect(sees(20.5, 0, 0, 3)).toBe(true); // east (the east pillar is in the way of the middle)
    expect(sees(3.5, -8.5, 3.5, 0)).toBe(true); // north overlook
    expect(sees(11.8, 10.8, 0, 6)).toBe(true); // east corner balcony
  });

  it("every spawn point is on the bare ground", () => {
    for (const spawn of layout.spawnPoints) {
      expect(spawn.y).toBe(0);
      expect(world.groundHeight(spawn.x, spawn.z, 0)).toBe(0);
    }
  });
});

describe("Getting around", () => {
  const all = walkField(start.x, start.z, 0, { hop: true });
  const onFoot = walkField(start.x, start.z, 0, { ladders: false });

  it("every room can be walked into and all of it can be reached (no sealed corners)", () => {
    const sealed: string[] = [];

    for (const room of layout.rooms) {
      const cells = freeCells(room, room.floorY);
      const unreachable = cells.filter(
        (c) => distanceAtHeight(onFoot, c.x, c.z, room.floorY) === Infinity,
      );

      expect(cells.length, room.id).toBeGreaterThan(20);

      if (unreachable.length > 0) sealed.push(room.id);
    }

    expect(sealed).toEqual([]);
  });

  it("the stairs alone reach every walkway, deck, balcony and the corridor", () => {
    const missing: string[] = [];

    for (const zone of layout.zones as Zone[]) {
      // The raised balcony is a jump away; everything else is on foot.
      if (zone.floorY > F) continue;

      const cells = freeCells(zone, zone.floorY);

      if (
        !cells.some(
          (c) => distanceAtHeight(onFoot, c.x, c.z, zone.floorY) < Infinity,
        )
      ) {
        missing.push(zone.id);
      }
    }

    expect(missing).toEqual([]);
  });

  it("with ladders and jumps, every roof and the raised balcony can be reached", () => {
    const missing: string[] = [];

    // The Barracks roof and the service corridor's roof have no ladder or ledge
    // any more: they are for the grapple, like the perches.
    // The Server and Break room roofs and the catwalk between them lost
    // their ladder (the east wall's) and are for the grapple too.
    const grappleOnly = new Set([
      "room-barracks-roof",
      "roof-corridor-nw",
      "room-server-roof",
      "room-break-roof",
    ]);

    for (const roof of layout.platforms.filter((p) => p.role === "roof")) {
      // A thin strip beside a hatch hole has no room for a body.
      if (roof.maxX - roof.minX < 1.2 || roof.maxZ - roof.minZ < 1.2) continue;
      if (grappleOnly.has(roof.id)) continue;

      const cells = freeCells(roof, roof.height);

      if (
        !cells.some(
          (c) => distanceAtHeight(all, c.x, c.z, roof.height) < Infinity,
        )
      ) {
        missing.push(roof.id);
      }
    }

    const nw = layout.zones.find((z) => z.id === "balcony-nw")!;

    if (
      !freeCells(nw, nw.floorY).some(
        (c) => distanceAtHeight(all, c.x, c.z, nw.floorY) < Infinity,
      )
    ) {
      missing.push(nw.id);
    }

    expect(missing).toEqual([]);
  });

  it("the catwalk joins two roofs, which only the grapple reaches now (no east ladder)", () => {
    const catwalk = layout.platforms.find((p) => p.id === "catwalk-east")!;

    expect(
      freeCells(catwalk, ROOF_LOW).some(
        (c) => distanceAtHeight(all, c.x, c.z, ROOF_LOW) < Infinity,
      ),
    ).toBe(false);
  });

  it("from either spawn area its own staircase is the only way out, and it leads to every room and to the other spawn area", () => {
    const rooms = (field: ReturnType<typeof walkField>): string[] =>
      layout.rooms
        .filter(
          (room) =>
            !freeCells(room, room.floorY).some(
              (c) => distanceAtHeight(field, c.x, c.z, room.floorY) < Infinity,
            ),
        )
        .map((room) => room.id);

    for (const [from, own, other] of [
      [{ x: -26.5, z: -20.5 }, "stairs-spawn-nw", "stairs-spawn-ne"],
      [{ x: 27, z: -20 }, "stairs-spawn-ne", "stairs-spawn-nw"],
    ] as const) {
      // With its own staircase shut, the spawn area is sealed.
      const shut = walkField(from.x, from.z, 0, {
        ladders: false,
        forbid: (x, z) => onStairs(own, x, z),
      });
      const open = walkField(from.x, from.z, 0, { ladders: false });

      expect(distanceAtHeight(shut, 0, 0, 0), own).toBe(Infinity);
      expect(rooms(open), own).toEqual([]);
      // ... and the other spawn area is reached, down its own staircase.
      expect(onStairs(other, 0, 0)).toBe(false);
    }
  });

  it("the north-west staircase serves the west and north-west; the north-east staircase serves the east", () => {
    const fromNw = walkField(-26.5, -20.5, 0, { ladders: false });
    const fromNe = walkField(27, -20, 0, { ladders: false });
    const to = (field: ReturnType<typeof walkField>, id: string): number => {
      const room = layout.rooms.find((r) => r.id === id)!;
      const cells = freeCells(room, room.floorY);

      return Math.min(
        ...cells.map((c) => distanceAtHeight(field, c.x, c.z, room.floorY)),
      );
    };

    for (const id of ["room-barracks", "room-armory", "room-archive"]) {
      expect(to(fromNw, id), id).toBeLessThan(to(fromNe, id));
    }

    for (const id of ["room-server", "room-break", "room-warehouse"]) {
      expect(to(fromNe, id), id).toBeLessThan(to(fromNw, id));
    }
  });

  it("there are always other routes: closing the middle of a route still leaves a way round", () => {
    const a = freeCells(
      layout.rooms.find((r) => r.id === "room-spawn-nw")!,
      F,
    )[0];
    const b = freeCells(
      layout.rooms.find((r) => r.id === "room-warehouse")!,
      F,
    ).slice(-1)[0];
    const field = walkField(a.x, a.z, F, { ladders: false });
    const direct = pathTo(field, b.x, b.z);
    const length = pathLength(direct);

    expect(length).toBeGreaterThan(0);

    const mid = direct[Math.floor(direct.length / 2)];
    const detour = walkField(a.x, a.z, F, {
      ladders: false,
      forbid: (x, z) => Math.hypot(x - mid.x, z - mid.z) < 3,
    });
    const around = distanceTo(detour, b.x, b.z);

    expect(around).toBeLessThan(Infinity);
    expect(around).toBeLessThan(length * 2.5);
  });

  it("the outer ring is broken: it cannot be walked all the way round without going through a room", () => {
    const insideRoom = (x: number, z: number): boolean =>
      layout.rooms.some(
        (r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ,
      );
    // The west walkway's south end and the south walkway's west end are two
    // metres apart, but a railing and the Hall's walls are between them.
    const field = walkField(-19, 10, F, {
      ladders: false,
      forbid: insideRoom,
    });
    const round = distanceAtHeight(field, -16, 13.5, F);

    expect(round).toBeGreaterThan(40);
  });
});

describe("Ladders", () => {
  it.each(layout.ladders.map((l) => [l.id, l] as const))(
    "%s: a free spot to start on its floor and a free spot to finish on top",
    (_id, ladder) => {
      expect(
        world.isBlocked(
          ladder.approach.x,
          ladder.approach.z,
          ladder.bottomY,
          0.5,
        ),
      ).toBe(false);
      expect(
        world.groundHeight(
          ladder.approach.x,
          ladder.approach.z,
          ladder.bottomY,
        ),
      ).toBe(ladder.bottomY);

      expect(
        world.isBlocked(ladder.exit.x, ladder.exit.z, ladder.topY, 0.5),
      ).toBe(false);
      expect(
        world.groundHeight(ladder.exit.x, ladder.exit.z, ladder.topY),
      ).toBe(ladder.topY);

      const reach = Math.hypot(
        ladder.x - ladder.approach.x,
        ladder.z - ladder.approach.z,
      );

      expect(reach).toBeGreaterThan(0.5);
      expect(reach).toBeLessThan(1.2);
    },
  );

  it("every ladder is on the walkable network, at both ends", () => {
    const all = walkField(start.x, start.z, 0, { hop: true });
    const bad: string[] = [];

    for (const ladder of layout.ladders) {
      // (The catwalk's ladder is on the grapple-only roofs: see above.)
      if (ladder.id === "ladder-catwalk-east") continue;

      if (
        distanceAtHeight(
          all,
          ladder.approach.x,
          ladder.approach.z,
          ladder.bottomY,
        ) === Infinity
      ) {
        bad.push(`${ladder.id} foot`);
      }

      if (
        distanceAtHeight(all, ladder.exit.x, ladder.exit.z, ladder.topY) ===
        Infinity
      ) {
        bad.push(`${ladder.id} top`);
      }
    }

    expect(bad).toEqual([]);
  });

  it("the opening at a ladder's top is a proper gap: a body can walk through it side to side", () => {
    for (const ladder of layout.ladders.filter((l) => l.topY <= F)) {
      const alongX = ladder.normal.endsWith("z");

      for (const offset of [-0.6, 0, 0.6]) {
        const x = alongX ? ladder.x + offset : ladder.exit.x;
        const z = alongX ? ladder.exit.z : ladder.z + offset;

        expect(
          world.isBlocked(x, z, ladder.topY, 0.4),
          `${ladder.id} at ${offset}`,
        ).toBe(false);
      }
    }
  });

  it("a railing leaves a gap where a ladder tops out", () => {
    for (const ladder of layout.ladders.filter((l) => l.topY <= F)) {
      const edgeX = ladder.x - (ladder.exit.x - ladder.x) * 0.1;
      const edgeZ = ladder.z - (ladder.exit.z - ladder.z) * 0.1;

      expect(world.isBlocked(edgeX, edgeZ, ladder.topY, 0.2), ladder.id).toBe(
        false,
      );
    }
  });
});

describe("Ledges", () => {
  it("each solid ledge can be climbed onto (reached with a jump)", () => {
    const hop = walkField(start.x, start.z, 0, { hop: true });

    for (const ledge of layout.ledges) {
      // Edge ledges mark an existing drop and have no area of their own.
      if (ledge.maxX - ledge.minX < 0.1 || ledge.maxZ - ledge.minZ < 0.1) {
        continue;
      }

      expect(
        world.groundHeight(
          (ledge.minX + ledge.maxX) / 2,
          (ledge.minZ + ledge.maxZ) / 2,
          ledge.topY,
        ),
        ledge.id,
      ).toBe(ledge.topY);

      const cells = freeCells(
        {
          minX: ledge.minX - 0.1,
          maxX: ledge.maxX + 0.1,
          minZ: ledge.minZ - 0.1,
          maxZ: ledge.maxZ + 0.1,
        },
        ledge.topY,
      );

      // A ledge narrower than a body has no free cell; its top is still a solid.
      if (cells.length > 0) {
        expect(
          cells.some(
            (c) => distanceAtHeight(hop, c.x, c.z, ledge.topY) < Infinity,
          ),
          ledge.id,
        ).toBe(true);
      }
    }
  });

  it("the 1.2 m ledges are not walked up on foot (they need the jump)", () => {
    const walk = walkField(start.x, start.z, 0, { ladders: false });
    const ledge = layout.ledges.find((l) => l.id === "ledge-east-deck")!;

    expect(
      distanceAtHeight(walk, (ledge.minX + ledge.maxX) / 2, -1, ledge.topY),
    ).toBe(Infinity);
  });
});

describe("Scale and traps", () => {
  interface Rect {
    id: string;
    level: number;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  }

  function obstacles(): Rect[] {
    const rects: Rect[] = [];

    for (const s of [...layout.walls, ...layout.platforms] as BoxSolid[]) {
      const level = s.base ?? s.bottom ?? 0;

      // Only things standing on a floor that are taller than a step.
      if (level === 0 || s.height - level <= 0.46) continue;
      if (s.role === "floor" || s.role === "roof" || s.role === "catwalk") {
        continue;
      }

      rects.push({
        id: s.id,
        level,
        minX: s.minX,
        maxX: s.maxX,
        minZ: s.minZ,
        maxZ: s.maxZ,
      });
    }

    for (const c of layout.pillars as CylinderSolid[]) {
      rects.push({
        id: c.id,
        level: c.bottom ?? 0,
        minX: c.x - c.radius,
        maxX: c.x + c.radius,
        minZ: c.z - c.radius,
        maxZ: c.z + c.radius,
      });
    }

    // A broken wall is one wall (its slices touch end to end), and a pile of
    // several collision boxes is one pile: a gap is judged on the whole.
    const owner = new Map<string, string>();

    for (const pile of layout.piles) {
      for (const id of pile.solids) {
        owner.set(id, pile.id);
      }
    }

    const whole = new Map<string, Rect>();

    for (const r of rects) {
      const key = owner.get(r.id) ?? r.id.split("~")[0];
      const known = whole.get(key);

      if (known && Math.abs(known.level - r.level) < 0.01) {
        known.minX = Math.min(known.minX, r.minX);
        known.maxX = Math.max(known.maxX, r.maxX);
        known.minZ = Math.min(known.minZ, r.minZ);
        known.maxZ = Math.max(known.maxZ, r.maxZ);
      } else {
        whole.set(known ? `${key}@${r.level}` : key, { ...r, id: key });
      }
    }

    return [...whole.values()];
  }

  const gap = (a: Rect, b: Rect): number =>
    Math.hypot(
      Math.max(a.minX - b.maxX, b.minX - a.maxX, 0),
      Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ, 0),
    );

  it("no two solids on one floor leave a gap a body cannot use (between 5 cm and 1.4 m)", () => {
    const rects = obstacles();
    const bad: string[] = [];

    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];

        if (Math.abs(a.level - b.level) > 0.01) continue;

        const d = gap(a, b);

        // Under 0.9 m a body cannot enter at all; the gap that traps is in between.
        if (d > 0.9 && d < 1.4 - 1e-6) {
          // Two solids with a third filling the gap between them are one block.
          const filled = rects.some(
            (c) =>
              c !== a &&
              c !== b &&
              Math.abs(c.level - a.level) < 0.01 &&
              gap(a, c) < 0.02 &&
              gap(b, c) < 0.02,
          );

          if (!filled) bad.push(`${a.id} / ${b.id}: ${d.toFixed(2)} m`);
        }
      }
    }

    expect(bad).toEqual([]);
  });

  it("nothing stands 1 m from the outer wall, where a body would be wedged", () => {
    const bad: string[] = [];

    for (const r of obstacles()) {
      const gaps = [
        ARENA_LAYOUT.width / 2 - r.maxX,
        r.minX + ARENA_LAYOUT.width / 2,
        ARENA_LAYOUT.depth / 2 - r.maxZ,
        r.minZ + ARENA_LAYOUT.depth / 2,
      ];

      for (const d of gaps) {
        if (d > 0.9 && d < 1.4 - 1e-6) bad.push(`${r.id}: ${d.toFixed(2)} m`);
      }
    }

    expect(bad).toEqual([]);
  });

  it("anything overhead leaves at least 1.9 m of headroom above the surface below it", () => {
    const bad: string[] = [];
    const blockers = obstacles();
    const floating = (
      [...layout.platforms, ...layout.walls] as BoxSolid[]
    ).filter(
      (s) =>
        (s.bottom ?? 0) > 2 &&
        (s.role === "roof" ||
          s.role === "catwalk" ||
          (s.role === "floor" && (s.bottom ?? 0) < s.height - 0.4)),
    );

    for (const s of floating) {
      for (let x = s.minX + 0.25; x < s.maxX; x += 0.5) {
        for (let z = s.minZ + 0.25; z < s.maxZ; z += 0.5) {
          // The top of a shelf or a crate is not a floor.
          if (
            blockers.some(
              (r) =>
                x > r.minX &&
                x < r.maxX &&
                z > r.minZ &&
                z < r.maxZ &&
                r.level < (s.bottom ?? 0),
            )
          ) {
            continue;
          }

          const below = world.groundHeight(x, z, (s.bottom ?? 0) - 0.5);
          const room = (s.bottom ?? 0) - below;

          // A surface right under it (a roof on a wall) is the thing itself.
          if (room > 0.35 && room < 1.9 - 1e-6) {
            bad.push(
              `${s.id} at ${x.toFixed(1)},${z.toFixed(1)}: ${room.toFixed(2)} m`,
            );
          }
        }
      }
    }

    expect(bad.slice(0, 10)).toEqual([]);
  });

  it("the cell grid is as fine as the checks assume", () => {
    expect(CELL).toBe(0.5);
  });
});

describe("Hatches", () => {
  it("no ladder climbs through a roof or a floor, except through a hatch", () => {
    const bad: string[] = [];
    const solids = [...layout.platforms, ...layout.walls] as BoxSolid[];

    for (const ladder of layout.ladders) {
      const n = ladder.normal;
      const sign = n.startsWith("+") ? 1 : -1;
      const x = ladder.x + (n.endsWith("x") ? sign * 0.5 : 0);
      const z = ladder.z + (n.endsWith("z") ? sign * 0.5 : 0);

      for (const s of solids) {
        if (
          x >= s.minX - 0.3 &&
          x <= s.maxX + 0.3 &&
          z >= s.minZ - 0.3 &&
          z <= s.maxZ + 0.3 &&
          (s.bottom ?? 0) > ladder.bottomY + 0.25 &&
          (s.bottom ?? 0) < ladder.topY - 0.25 &&
          s.role !== "hatch"
        ) {
          bad.push(`${ladder.id} through ${s.id}`);
        }
      }
    }

    expect(bad).toEqual([]);
  });

  it("every hatch is a solid that fits its roof, and the roof around it has a hole", () => {
    expect(layout.hatches.length).toBeGreaterThanOrEqual(1);

    for (const hatch of layout.hatches) {
      const panel = layout.platforms.find((p) => p.id === hatch.id)!;

      expect(panel.role).toBe("hatch");
      expect(panel.bottom).toBeCloseTo(hatch.bottom, 5);
      expect(panel.height).toBeCloseTo(hatch.top, 5);

      // Shut it holds you up; open it is a hole.
      const x = (hatch.minX + hatch.maxX) / 2;
      const z = (hatch.minZ + hatch.maxZ) / 2;
      const fresh = new ArenaCollision();

      expect(fresh.groundHeight(x, z, hatch.top)).toBe(hatch.top);
      expect(fresh.setOpen(hatch.id, true)).toBe(true);
      expect(fresh.groundHeight(x, z, hatch.top)).toBeLessThan(hatch.bottom);
      expect(fresh.isBlocked(x, z, hatch.bottom - 2, 0.3)).toBe(false);
      fresh.setOpen(hatch.id, false);
      expect(fresh.groundHeight(x, z, hatch.top)).toBe(hatch.top);

      // (A hatch opened from the roof, like the Armory's vent, has no ladder.)
      if (hatch.ladderId !== "none") {
        const ladder = layout.ladders.find((l) => l.id === hatch.ladderId)!;

        expect(ladder.hatch?.id).toBe(hatch.id);
      }
    }
  });
});

describe("An opened hatch", () => {
  it("its lid stands up as a solid, and is gone again when the hatch is shut", () => {
    const hatch = layout.hatches[0];
    const x = hatch.minX;
    const z = (hatch.minZ + hatch.maxZ) / 2;
    const fresh = new ArenaCollision();

    expect(fresh.isBlocked(x, z, hatch.top, PLAYER_RADIUS - 0.1)).toBe(false);

    fresh.setOpen(hatch.id, true);
    // Standing on the roof beside the hole, the lid is in the way.
    expect(fresh.isBlocked(x, z, hatch.top, 0.2)).toBe(true);
    expect(
      fresh.segmentBlocked(
        x - 1,
        hatch.top + 0.6,
        z,
        x + 1,
        hatch.top + 0.6,
        z,
      ),
    ).toBe(true);

    fresh.setOpen(hatch.id, false);
    expect(fresh.isBlocked(x, z, hatch.top, 0.2)).toBe(false);
  });
});

describe("Sightlines and anchors", () => {
  it("no upper-floor position sees the whole arena, but each sees a real part of it", () => {
    const points: Array<[number, number]> = [];

    for (let x = -17; x <= 17; x += 2) {
      for (let z = -11; z <= 11; z += 2) {
        if (!world.isBlocked(x, z, 0, 0.3)) points.push([x, z]);
      }
    }

    const eyes: Array<[string, number, number, number]> = [
      ["north overlook", 0, -9.5, F],
      ["south balcony", 0, 10.5, 2.8],
      ["east corner balcony", 14.5, 10, F],
      ["north-west balcony", -13, -10.8, 5.2],
      ["north walkway", -3, -13.5, F],
      ["south walkway", 0, 13.5, F],
      ["east walkway", 20, 0, F],
      ["west walkway", -19.5, 0, F],
      ["maintenance platform", 10, -11.2, 2.8],
    ];

    for (const [name, x, z, floor] of eyes) {
      let seen = 0;

      for (const [px, pz] of points) {
        if (!world.segmentBlocked(x, floor + 1.6, z, px, 1.3, pz)) seen++;
      }

      const share = seen / points.length;

      expect(share, name).toBeLessThan(0.8);
      // (The arena is open now: a walkway behind its rail may see just a cell.)
      expect(share, name).toBeGreaterThan(0);
    }

    // The three real overlooks each see a good part of it.
    for (const [name, x, z, floor] of eyes.slice(0, 4)) {
      let seen = 0;

      for (const [px, pz] of points) {
        if (!world.segmentBlocked(x, floor + 1.6, z, px, 1.3, pz)) seen++;
      }

      expect(seen / points.length, name).toBeGreaterThan(0.12);
    }
  });

  it("no roof dominates the map: from any roof, a good share of the other roofs is hidden", () => {
    const roofs = layout.platforms.filter(
      (p) =>
        p.role === "roof" && p.maxX - p.minX > 1.5 && p.maxZ - p.minZ > 1.5,
    );
    const samples: Array<{ x: number; z: number; y: number }> = [];

    for (const r of roofs) {
      for (let x = r.minX + 1; x < r.maxX; x += 3) {
        for (let z = r.minZ + 1; z < r.maxZ; z += 3) {
          if (!world.isBlocked(x, z, r.height, 0.5)) {
            samples.push({ x, z, y: r.height });
          }
        }
      }
    }

    let worst = 0;
    let total = 0;

    for (const a of samples) {
      let seen = 0;

      for (const b of samples) {
        if (
          a !== b &&
          !world.segmentBlocked(a.x, a.y + 1.6, a.z, b.x, b.y + 1.3, b.z)
        ) {
          seen++;
        }
      }

      const share = seen / (samples.length - 1);

      worst = Math.max(worst, share);
      total += share;
    }

    expect(samples.length).toBeGreaterThan(90);
    expect(worst).toBeLessThan(0.85);
    expect(total / samples.length).toBeLessThan(0.65);
  }, 30000);

  it("the hall roof and the Warehouse roof are one level, joined through the gap in the glass barrier", () => {
    const warehouse = layout.platforms
      .filter((p) => p.id.startsWith("room-warehouse-roof"))
      .sort(
        (a, b) =>
          (b.maxX - b.minX) * (b.maxZ - b.minZ) -
          (a.maxX - a.minX) * (a.maxZ - a.minZ),
      )[0];
    const workshop = layout.platforms
      .filter((p) => p.id.startsWith("room-workshop-roof"))
      .sort(
        (a, b) =>
          (b.maxX - b.minX) * (b.maxZ - b.minZ) -
          (a.maxX - a.minX) * (a.maxZ - a.minZ),
      )[0];
    const start = freeCells(workshop, workshop.height)[0];
    const jumping = walkField(start.x, start.z, workshop.height, {
      hop: true,
      ladders: false,
    });
    const climbing = walkField(start.x, start.z, workshop.height, {
      hop: true,
    });
    const reach = (field: ReturnType<typeof walkField>): boolean =>
      freeCells(warehouse, warehouse.height).some(
        (c) => distanceAtHeight(field, c.x, c.z, warehouse.height) < Infinity,
      );

    // Level with each other, they are walked between at the barrier's gap.
    expect(reach(jumping)).toBe(true);
    expect(reach(climbing)).toBe(true);
  });

  it("every hanging zone rests on something: a wall, a post or the underside of a roof", () => {
    const solids = [
      ...layout.platforms,
      ...layout.walls,
      ...layout.steel.flatMap((m) => (m.solid ? [m.solid] : [])),
    ] as BoxSolid[];
    const loose: string[] = [];

    for (const zone of layout.hangZones) {
      // A gargoyle rod holds its own hang point (checked in its own test).
      if (zone.id.startsWith("hang-gargoyle")) continue;

      const ends =
        zone.axis === "x"
          ? [
              [zone.x - zone.length / 2, zone.z],
              [zone.x + zone.length / 2, zone.z],
            ]
          : [
              [zone.x, zone.z - zone.length / 2],
              [zone.x, zone.z + zone.length / 2],
            ];

      for (const [x, z] of ends) {
        const held = solids.some(
          (s) =>
            x >= s.minX - 0.4 &&
            x <= s.maxX + 0.4 &&
            z >= s.minZ - 0.4 &&
            z <= s.maxZ + 0.4 &&
            (s.bottom ?? 0) <= zone.y + 0.85 &&
            s.height >= zone.y - 0.05,
        );

        if (!held) loose.push(`${zone.id} at ${x.toFixed(1)},${z.toFixed(1)}`);
      }
    }

    expect(loose).toEqual([]);
  });

  it("the sides of the map have their own identity", () => {
    const ids = layout.walls.map((w) => w.id).join(" ");

    expect(ids).toMatch(/nook-west/); // west: a service nook round a secret ladder
    expect(ids).toMatch(/generator-east-deck/); // east: machinery
    expect(ids).toMatch(/fittings-storage|crates-plaza/); // south: storage
    expect(layout.ladders.some((l) => l.id === "ladder-north")).toBe(true); // north: the arena ladder
  });
});

describe("Ladders and the roofs above them", () => {
  it("a climber's head never runs into a roof or a floor: there is a gap or a hatch", () => {
    const bad: string[] = [];
    const solids = [...layout.platforms, ...layout.walls] as BoxSolid[];

    for (const ladder of layout.ladders) {
      const n = ladder.normal;
      const sign = n.startsWith("+") ? 1 : -1;
      // Where the body hangs: 0.65 m off the ladder.
      const x = ladder.x + (n.endsWith("x") ? sign * 0.65 : 0);
      const z = ladder.z + (n.endsWith("z") ? sign * 0.65 : 0);

      for (const s of solids) {
        const bottom = s.bottom ?? 0;

        if (
          x >= s.minX - 0.3 &&
          x <= s.maxX + 0.3 &&
          z >= s.minZ - 0.3 &&
          z <= s.maxZ + 0.3 &&
          bottom > ladder.bottomY + 1.7 &&
          bottom < ladder.topY + 1.75 &&
          s.height > bottom &&
          s.role !== "hatch"
        ) {
          bad.push(`${ladder.id} head hits ${s.id}`);
        }
      }
    }

    expect(bad).toEqual([]);
  });
});
