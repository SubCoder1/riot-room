import { describe, expect, it } from "vitest";

import { ArenaCollision, PLAYER_RADIUS } from "../../src/world/ArenaCollision";
import {
  ROOF_HIGH,
  ROOF_LOW,
  ROOF_MID,
  UPPER_FLOOR_Y,
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
const start = layout.spawnPoints[0];

/** Is the point inside one of the staircases (so a route can be forced onto the other)? */
function onStairs(id: string, x: number, z: number): boolean {
  const stairs = layout.stairs.find((s) => s.id === id)!;
  const steps = stairsToSteps(stairs);
  const lo = Math.min(...steps.map((s) => s.minZ));
  const hi = Math.max(...steps.map((s) => s.maxZ));

  return (
    x >= stairs.crossMin - 0.5 &&
    x <= stairs.crossMax + 0.5 &&
    z >= lo - 0.5 &&
    z <= hi + 0.5
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

function roofOf(room: { id: string }): BoxSolid {
  return layout.platforms.find((p) => p.id === `${room.id}-roof`)!;
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
      expect(room.doors.length, room.id).toBeGreaterThanOrEqual(1);
      expect(roofOf(room), room.id).toBeDefined();
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

  it("has two public staircases in opposite corners, climbing different ways", () => {
    const sw = layout.stairs.find((s) => s.id === "stairs-sw")!;
    const ne = layout.stairs.find((s) => s.id === "stairs-ne")!;

    expect(sw.crossMax).toBeLessThan(0);
    expect(sw.start).toBeGreaterThan(0);
    expect(sw.direction).toBe("-z");
    expect(ne.crossMin).toBeGreaterThan(0);
    expect(ne.start).toBeLessThan(0);
    expect(ne.direction).toBe("+z");
    expect(sw.crossMax - sw.crossMin).not.toBe(ne.crossMax - ne.crossMin);
    expect(sw.steps).not.toBe(ne.steps);
  });

  it("has many ladders: easy ones, roof ladders and four to seven secret ones", () => {
    expect(layout.ladders.length).toBeGreaterThanOrEqual(12);

    const secret = layout.ladders.filter((l) => l.secret);

    expect(secret.length).toBeGreaterThanOrEqual(4);
    expect(secret.length).toBeLessThanOrEqual(7);
    expect(layout.ladders.filter((l) => l.bottomY >= F).length).toBeGreaterThan(
      4,
    );
    expect(
      layout.ladders.filter((l) => l.bottomY === 0).length,
    ).toBeGreaterThan(4);
    expect(new Set(layout.ladders.map((l) => l.normal)).size).toBe(4);
  });

  it("has ten or more climbable ledges", () => {
    expect(layout.ledges.length).toBeGreaterThanOrEqual(10);

    for (const ledge of layout.ledges) {
      const rise = ledge.topY - ledge.fromY;

      expect(rise, ledge.id).toBeGreaterThanOrEqual(0.75 - 1e-9);
      expect(rise, ledge.id).toBeLessThanOrEqual(2.4 + 1e-9);
    }

    // Prioritised around balconies, roofs and the arena edges.
    const ids = layout.ledges.map((l) => l.id).join(" ");

    expect(ids).toMatch(/balcony/);
    expect(ids).toMatch(/roof/);
    expect(ids).toMatch(/maintenance/);
  });

  it("has three roof layers that can be walked on, with gaps between the roofs", () => {
    expect(layout.roofLevels).toEqual([ROOF_LOW, ROOF_MID, ROOF_HIGH]);

    const roofs = layout.platforms.filter((p) => p.role === "roof");

    for (const level of layout.roofLevels) {
      expect(
        roofs.filter((r) => r.height === level).length,
        `level ${level}`,
      ).toBeGreaterThanOrEqual(2);
    }

    // A skylight gap between the dock roofs.
    const dockA = roofs.find((r) => r.id === "roof-dock-a")!;
    const dockB = roofs.find((r) => r.id === "roof-dock-b")!;

    expect(dockB.minX - dockA.maxX).toBeGreaterThanOrEqual(2.5);

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
    expect(layout.pillars.length).toBeGreaterThanOrEqual(3); // tanks
    expect(
      layout.overheads.filter((o) => o.material === "pipe").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      layout.overheads.filter((o) => o.material === "duct").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      layout.overheads.filter((o) => o.material === "steel").length,
    ).toBeGreaterThanOrEqual(6);
  });

  it("has four to six hanging structure zones with clear space under each", () => {
    expect(layout.hangZones.length).toBeGreaterThanOrEqual(4);
    expect(layout.hangZones.length).toBeLessThanOrEqual(6);

    for (const zone of layout.hangZones) {
      expect(
        layout.overheads.some((o) => o.id === `${zone.id}-beam`),
        zone.id,
      ).toBe(true);
      // Above the highest jump and a head: nobody bumps into it.
      expect(zone.y, zone.id).toBeGreaterThanOrEqual(F + 2.8);
    }
  });

  it("does not design the ground level: only structure and the ways up stand on it", () => {
    expect(layout.ramps).toHaveLength(0);

    for (const platform of layout.platforms) {
      expect(platform.height, platform.id).toBeGreaterThanOrEqual(2.8);
    }

    for (const solid of [...layout.walls, ...layout.pillars]) {
      const base =
        solid.kind === "box"
          ? (solid.base ?? solid.bottom ?? 0)
          : (solid.bottom ?? 0);

      expect(base, solid.id).toBeGreaterThanOrEqual(2.8);
    }
  });
});

describe("The central arena", () => {
  it("is open: the middle 24 x 12 m is bare floor", () => {
    for (let x = -12; x <= 12; x++) {
      for (let z = -6; z <= 6; z++) {
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
    expect(sees(-20.5, 0, 0, 0)).toBe(true); // west
    expect(sees(20.5, 0, 0, 0)).toBe(true); // east
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

    for (const roof of layout.platforms.filter((p) => p.role === "roof")) {
      // A thin strip beside a hatch hole has no room for a body.
      if (roof.maxX - roof.minX < 1.2 || roof.maxZ - roof.minZ < 1.2) continue;

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

  it("the catwalk joins two roofs", () => {
    const catwalk = layout.platforms.find((p) => p.id === "catwalk-east")!;

    expect(
      freeCells(catwalk, ROOF_LOW).some(
        (c) => distanceAtHeight(all, c.x, c.z, ROOF_LOW) < Infinity,
      ),
    ).toBe(true);
  });

  it.each([
    ["stairs-ne", "the south-west staircase alone"],
    ["stairs-sw", "the north-east staircase alone"],
  ])("with %s closed off, %s still reaches every room", (closed) => {
    const field = walkField(start.x, start.z, 0, {
      ladders: false,
      forbid: (x, z) => onStairs(closed, x, z),
    });
    const missing = layout.rooms
      .filter((room) => {
        const cells = freeCells(room, room.floorY);

        return !cells.some(
          (c) => distanceAtHeight(field, c.x, c.z, room.floorY) < Infinity,
        );
      })
      .map((room) => room.id);

    expect(missing).toEqual([]);
  });

  it("the south-west stairs serve the west and north sides; the north-east stairs serve the east and south", () => {
    const fromSw = walkField(-15, 10.8, 0, { ladders: false });
    const fromNe = walkField(15.5, -10.8, 0, { ladders: false });
    const to = (field: ReturnType<typeof walkField>, id: string): number => {
      const room = layout.rooms.find((r) => r.id === id)!;
      const cells = freeCells(room, room.floorY);

      return Math.min(
        ...cells.map((c) => distanceAtHeight(field, c.x, c.z, room.floorY)),
      );
    };

    for (const id of ["room-barracks", "room-armory", "room-control"]) {
      expect(to(fromSw, id), id).toBeLessThan(to(fromNe, id));
    }

    for (const id of ["room-break", "room-warehouse", "room-server"]) {
      expect(to(fromNe, id), id).toBeLessThan(to(fromSw, id));
    }
  });

  it("there are always other routes: closing the middle of a route still leaves a way round", () => {
    const a = freeCells(
      layout.rooms.find((r) => r.id === "room-control")!,
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

    return rects;
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

      const ladder = layout.ladders.find((l) => l.id === hatch.ladderId)!;

      expect(ladder.hatch?.id).toBe(hatch.id);
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
      expect(share, name).toBeGreaterThan(0.005);
    }

    // The three real overlooks each see a good part of it.
    for (const [name, x, z, floor] of eyes.slice(0, 4)) {
      let seen = 0;

      for (const [px, pz] of points) {
        if (!world.segmentBlocked(x, floor + 1.6, z, px, 1.3, pz)) seen++;
      }

      expect(seen / points.length, name).toBeGreaterThan(0.2);
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

    expect(samples.length).toBeGreaterThan(100);
    expect(worst).toBeLessThan(0.85);
    expect(total / samples.length).toBeLessThan(0.65);
  });

  it("the high roofs need a specific route: the Warehouse roof is only reached by its ladder", () => {
    const warehouse = layout.platforms.find(
      (p) => p.id === "room-warehouse-roof",
    )!;
    const workshop = layout.platforms.find(
      (p) => p.id === "room-workshop-roof",
    )!;
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

    expect(reach(jumping)).toBe(false);
    expect(reach(climbing)).toBe(true);
  });

  it("every hanging zone rests on something: a wall, a post or the underside of a roof", () => {
    const solids = [...layout.platforms, ...layout.walls] as BoxSolid[];
    const loose: string[] = [];

    for (const zone of layout.hangZones) {
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
    expect(ids).toMatch(/crates-plaza/); // south: storage hiding a ladder
    expect(layout.ladders.some((l) => l.id === "ladder-roof-north")).toBe(true); // north: roof access
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
