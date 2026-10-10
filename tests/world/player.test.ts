import { describe, expect, it } from "vitest";

import { ArenaCollision } from "../../src/world/ArenaCollision";
import { ARENA_HALF_X, ARENA_HALF_Z } from "../../src/world/ArenaLayout";
import { MapBuilder } from "../../src/world/MapParts";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";
import { EAST, NORTH, SOUTH, WEST, spawnPlayer, yawFor } from "./playerHarness";

const layout = ARENA_LAYOUT;
const UPPER = 4;

/** Holds W (and optionally Shift) for `seconds`. */
function walk(
  p: ReturnType<typeof spawnPlayer>,
  seconds: number,
  sprint = false,
  onFrame?: () => void,
): void {
  p.input.keys.add("KeyW");

  if (sprint) {
    p.input.keys.add("ShiftLeft");
  }

  p.step(seconds, onFrame);
}

describe("Player on the map", () => {
  it("stands on the ground floor and stays grounded", () => {
    const { player, step, feet } = spawnPlayer(0, 0, 0);

    step(1);

    expect(player.isGrounded).toBe(true);
    expect(feet()).toBeCloseTo(0);
  });

  it("walks up the south-west staircase to the landing, grounded the whole way", () => {
    // In the pocket at the foot of the stairs (low end), facing north.
    const p = spawnPlayer(-16, 0, 10.6, NORTH);
    let airborne = 0;

    walk(p, 6, false, () => {
      if (!p.player.isGrounded) airborne++;
    });

    expect(p.feet()).toBeCloseTo(UPPER, 2);
    expect(p.player.isGrounded).toBe(true);
    expect(p.player.position.z).toBeLessThan(-3.2); // on the landing
    expect(airborne).toBeLessThan(6);
  });

  it("sprints up the north-east staircase to the landing, grounded the whole way", () => {
    const p = spawnPlayer(15.5, 0, -10.8, SOUTH);
    let airborne = 0;

    walk(p, 6, true, () => {
      if (!p.player.isGrounded) airborne++;
    });

    expect(p.feet()).toBeCloseTo(UPPER, 2);
    expect(p.player.isGrounded).toBe(true);
    expect(p.player.position.z).toBeGreaterThan(2.4);
    expect(airborne).toBeLessThan(6);
  });

  it("walks back down a staircase without a fall", () => {
    const p = spawnPlayer(-16, UPPER, -5, SOUTH);
    let airborne = 0;

    walk(p, 6, false, () => {
      if (!p.player.isGrounded) airborne++;
    });

    expect(p.feet()).toBeCloseTo(0, 2);
    expect(airborne).toBeLessThan(6);
  });

  it("goes through a doorway into a room and stops at its far wall", () => {
    // On the north walkway in front of the archive's doorway (x = -8), facing north.
    const p = spawnPlayer(-8, UPPER, -13.5, NORTH);

    walk(p, 3);

    expect(p.feet()).toBeCloseTo(UPPER, 2);
    expect(p.player.position.z).toBeLessThan(-16.5); // inside the room
    expect(p.player.position.z).toBeGreaterThan(-24);
  });

  it("is stopped by a room wall away from the doorway", () => {
    const p = spawnPlayer(-4, UPPER, -13.5, NORTH);

    walk(p, 3, true);

    expect(p.player.position.z).toBeGreaterThan(-16); // the archive's south wall
  });

  it("a balcony railing stops a sprint and a plain jump, but W and Space vault over it", () => {
    const run = spawnPlayer(0, UPPER, -10, SOUTH);

    walk(run, 2, true);
    expect(run.player.position.z).toBeLessThan(-8);
    expect(run.feet()).toBeCloseTo(UPPER, 2);

    // Standing and jumping (no W): still behind the rail.
    const hop = spawnPlayer(0, UPPER, -9, SOUTH);

    hop.input.jumpQueued = true;
    hop.step(1.2);
    expect(hop.player.position.z).toBeLessThan(-8);
    expect(hop.feet()).toBeCloseTo(UPPER, 2);

    // W and Space at the rail: over it, and down into the arena.
    const vault = spawnPlayer(0, UPPER, -8.9, SOUTH);

    vault.input.keys.add("KeyW");
    vault.step(0.05);
    vault.input.jumpQueued = true;
    vault.step(0.1);
    expect(vault.player.isVaulting).toBe(true);
    vault.step(2);
    expect(vault.player.isVaulting).toBe(false);
    expect(vault.player.position.z).toBeGreaterThan(-7.5);
    expect(vault.feet()).toBeLessThan(UPPER - 0.5);
  });

  it("A or D and Space at a railing beside you vaults sideways over it, whichever way you face", () => {
    // The west walkway's railing is a line at x = -18.1, the arena beyond it.
    const vault = spawnPlayer(-18.9, UPPER, 5, NORTH);

    vault.input.keys.add("KeyD");
    vault.step(0.05);
    vault.input.jumpQueued = true;
    vault.step(0.1);
    expect(vault.player.isVaulting).toBe(true);
    // The pose is told which way it travels: east, while the body faced north.
    expect(vault.player.vaultPose!.dirX).toBeGreaterThan(0.9);
    vault.step(2);
    expect(vault.player.isVaulting).toBe(false);
    expect(vault.player.position.x).toBeGreaterThan(-17.4);
    expect(vault.feet()).toBeLessThan(UPPER - 0.5);

    // With no rail beside you, A and Space is just a jump.
    const open = spawnPlayer(-25, UPPER, 0, NORTH);

    open.input.keys.add("KeyA");
    open.step(0.05);
    open.input.jumpQueued = true;
    open.step(0.1);
    expect(open.player.isVaulting).toBe(false);
  });

  it("jumping in a doorway bumps the head on the wall above it, and still walks under it", () => {
    // The Warehouse's north door at x = 20 (a 2 m opening, wall above 2.6 m).
    const door = spawnPlayer(20, UPPER, 13.6, NORTH);

    door.input.keys.add("KeyW");
    door.step(0.6);
    expect(door.player.position.z).toBeLessThan(12);
    expect(door.feet()).toBeCloseTo(UPPER, 2);

    // Standing in the doorway and jumping: the head stops at the lintel (2.6 m).
    const jump = spawnPlayer(20, UPPER, 12.15, NORTH);
    let highest = 0;

    jump.input.jumpQueued = true;

    for (let t = 0; t < 1; t += 1 / 60) {
      jump.step(1 / 60);
      highest = Math.max(highest, jump.feet() - UPPER);
    }

    expect(highest).toBeGreaterThan(0.3);
    expect(highest).toBeLessThan(0.82);
  });

  it("a medium box is vaulted: over it and onto the floor beyond, never inside it", () => {
    const map = new MapBuilder(20, 20);

    map.createFloorSection(
      "floor",
      { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      4,
    );
    map.createIndustrialProp("crate", "box", 0, 0, 4, "x");

    const world = new ArenaCollision(map.build());
    const plan = world.findVault(0, 1.6, 0, -1, 4);

    expect(plan).not.toBeNull();
    expect(plan?.topY).toBeCloseTo(5);
    // Landing past the far face (z = -0.55) and clear of it.
    expect((plan?.distance ?? 0) + 0).toBeGreaterThan(2.1);
    expect(world.findVault(0, 1.6, 0, 1, 4)).toBeNull();
    // Too high to vault (a tall stack) or not there at all.
    expect(world.findVault(8, 8, 0, -1, 4)).toBeNull();
  });

  it("drops onto the lower balcony through the opening in the south railing, and climbs back up the ledge", () => {
    const down = spawnPlayer(0, UPPER, 13.5, NORTH);

    walk(down, 1.2);
    down.input.keys.clear();
    down.step(1);
    expect(down.feet()).toBeCloseTo(2.8, 2);
    expect(down.player.position.z).toBeLessThan(12);

    // Back up: face south from the lower balcony and jump the 1.2 m ledge.
    const up = spawnPlayer(0, 2.8, 10.6, SOUTH);

    up.input.keys.add("KeyW");
    up.step(0.15);
    up.input.jumpQueued = true;
    up.step(0.8);
    up.input.keys.clear();
    up.step(1);
    expect(up.feet()).toBeCloseTo(UPPER, 1);
  });

  it("a 1.2 m ledge can be jumped onto from the floor", () => {
    // East deck ledge (x 29..32, z -4..0): run east at it and jump.
    const p = spawnPlayer(25.5, UPPER, -2, EAST);

    p.input.keys.add("KeyW");
    p.step(0.45);
    p.input.jumpQueued = true;
    p.step(0.7);
    p.input.keys.clear();
    p.step(1);

    expect(p.feet()).toBeCloseTo(UPPER + 1.2, 1);
  });

  it("the 2.4 m ledge is out of reach from the floor, but not from the 1.2 m one beside it", () => {
    // Floor side: in front of the tall ledge (x 15..18, z -22..-19), from the south.
    const floorSide = spawnPlayer(16.5, UPPER, -16, NORTH);

    floorSide.input.keys.add("KeyW");
    floorSide.step(0.3);
    floorSide.input.jumpQueued = true;
    floorSide.step(1);
    floorSide.input.keys.clear();
    floorSide.step(1);
    expect(floorSide.feet()).toBeLessThan(UPPER + 1.2);

    // From the top of the low ledge (x 12..15), face east into the tall one.
    const stacked = spawnPlayer(13, UPPER + 1.2, -20.5, EAST);

    stacked.input.keys.add("KeyW");
    stacked.step(0.1);
    stacked.input.jumpQueued = true;
    stacked.step(0.45);
    stacked.input.keys.clear();
    stacked.step(1);
    expect(stacked.feet()).toBeCloseTo(UPPER + 2.4, 1);
  });

  it("a jump onto the upper floor from the ground is out of reach", () => {
    const p = spawnPlayer(-8, 0, -9, NORTH);

    p.input.keys.add("KeyW");
    p.step(0.2);
    p.input.jumpQueued = true;
    p.step(1.2);

    expect(p.feet()).toBeLessThan(2);
  });

  it("walks on the ground right under a balcony and a roof edge (they hang over open ground)", () => {
    // North overlook is 4 m up over x -7..5, z -12..-7.5.
    const p = spawnPlayer(-1.5, 0, -3, NORTH);

    walk(p, 3);

    expect(p.feet()).toBeCloseTo(0, 2);
    expect(p.player.isGrounded).toBe(true);
    expect(p.player.position.z).toBeLessThan(-11); // right up to the wall, under the balcony
  });

  it("climbs to a roof and crosses the catwalk to the next roof", () => {
    const ladder = layout.ladders.find((l) => l.id === "ladder-roof-east")!;
    const up = spawnPlayer(
      ladder.approach.x,
      ladder.bottomY,
      ladder.approach.z,
      EAST,
    );

    up.step(0.05);
    expect(up.player.grabLadder()).toBe(true);

    up.input.keys.add("KeyW");

    for (let t = 0; t < 10 && up.player.isClimbing; t += 1 / 60) {
      up.step(1 / 60);
    }

    up.input.keys.clear();
    up.step(0.3);

    // On the Server room's roof (8.1 m).
    expect(up.feet()).toBeCloseTo(ladder.topY, 2);

    // East to the catwalk's line, then south along it onto the Break room's roof.
    up.input.yaw = EAST;
    up.input.keys.add("KeyW");
    up.step(0.75);
    up.input.keys.clear();
    up.step(0.4);
    up.input.yaw = SOUTH;
    up.input.keys.add("KeyW");
    up.step(2.4);

    expect(up.player.isGrounded).toBe(true);
    expect(up.feet()).toBeCloseTo(ladder.topY, 1);
    expect(up.player.position.z).toBeGreaterThan(3);
  });

  it.each(["west", "east", "north", "south"])(
    "stands, crouches and walks along the %s perch, and drops off its outer edge to a lower surface",
    (name) => {
      const deck = layout.platforms.find(
        (p) => p.id === `hang-perch-${name}-deck`,
      )!;
      const cx = (deck.minX + deck.maxX) / 2;
      const cz = (deck.minZ + deck.maxZ) / 2;
      const zone = layout.hangZones.find((z) => z.id === `hang-perch-${name}`)!;
      // Put the character on the ledge (it is reached by grapple, not walked to).
      const p = spawnPlayer(cx, deck.height, cz, yawFor(0, 1));

      p.step(0.5);
      expect(p.player.isGrounded, name).toBe(true);
      expect(p.feet(), name).toBeCloseTo(deck.height, 2);

      // Crouching on it keeps the character on it.
      p.input.keys.add("KeyC");
      p.step(0.6);
      expect(p.player.isGrounded, name).toBe(true);
      expect(p.feet(), name).toBeCloseTo(deck.height, 2);
      p.input.keys.clear();
      p.step(0.4);

      // Walking out to the outer edge, then off it, drops to the arena floor.
      const outX = zone.x - cx;
      const outZ = zone.z - cz;

      p.input.yaw = yawFor(outX, outZ);
      p.input.keys.add("KeyW");
      p.step(3);
      p.input.keys.clear();
      p.step(3);
      expect(p.player.isGrounded, name).toBe(true);
      // It drops to a lower surface (a walkway, a roof or the floor).
      expect(p.feet(), name).toBeLessThan(deck.height - 1.5);
    },
  );

  it("can never leave the map, even sprinting into a wall for a long time", () => {
    for (const yaw of [NORTH, SOUTH, EAST, WEST, yawFor(1, 1), yawFor(-1, 1)]) {
      const p = spawnPlayer(1, 0, 1, yaw);

      walk(p, 8, true);

      expect(Math.abs(p.player.position.x)).toBeLessThanOrEqual(ARENA_HALF_X);
      expect(Math.abs(p.player.position.z)).toBeLessThanOrEqual(ARENA_HALF_Z);
    }
  });

  it("every spawn point lets the player stand and move", () => {
    for (const point of layout.spawnPoints) {
      const p = spawnPlayer(point.x, point.y, point.z, point.yaw);

      walk(p, 0.5);

      expect(p.player.isGrounded, point.id).toBe(true);
    }
  });
});

describe("Jumping under a roof", () => {
  it("standing on a prop under a low roof, a jump bumps the head and stays in the room", () => {
    const room = layout.rooms.find((r) => r.id === "room-archive")!;
    const shelf = layout.walls.find((w) => w.id === "shelf-archive-1")!;
    const x = (shelf.minX + shelf.maxX) / 2;
    const z = (shelf.minZ + shelf.maxZ) / 2;
    const p = spawnPlayer(x, shelf.height, z, NORTH);

    p.step(0.3);
    p.input.jumpQueued = true;
    p.step(0.2);
    p.input.jumpQueued = true;
    p.step(1.5);

    // Never pushed out of the room, never up onto the roof.
    expect(p.player.position.x).toBeGreaterThan(room.minX);
    expect(p.player.position.x).toBeLessThan(room.maxX);
    expect(p.player.position.z).toBeGreaterThan(room.minZ);
    expect(p.player.position.z).toBeLessThan(room.maxZ);
    expect(p.feet()).toBeLessThan(shelf.height + 0.05);
  });

  it("rising never carries the head through the roof", () => {
    const room = layout.rooms.find((r) => r.id === "room-archive")!;
    // A shelf under a piece of the Archive's roof (not under its opening).
    const roofPieces = layout.platforms.filter((r) =>
      r.id.startsWith("room-archive-roof"),
    );
    const roofAbove = (w: {
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    }) =>
      roofPieces.find(
        (r) =>
          (w.minX + w.maxX) / 2 > r.minX &&
          (w.minX + w.maxX) / 2 < r.maxX &&
          (w.minZ + w.maxZ) / 2 > r.minZ &&
          (w.minZ + w.maxZ) / 2 < r.maxZ,
      );
    const shelf = layout.walls.find(
      (w) => w.id.startsWith("shelf-archive") && roofAbove(w),
    )!;
    const roof = roofAbove(shelf)!;
    const p = spawnPlayer(
      (shelf.minX + shelf.maxX) / 2,
      shelf.height,
      (shelf.minZ + shelf.maxZ) / 2,
      NORTH,
    );
    let highest = 0;

    p.step(0.3);
    p.input.jumpQueued = true;
    p.step(0.9, () => {
      highest = Math.max(highest, p.player.position.y + 0.1);
    });

    expect(room).toBeDefined();
    expect(highest).toBeLessThanOrEqual((roof.bottom ?? 0) + 0.001);
  });
});

describe("Thin tops", () => {
  it("nobody can stand on a wall, a railing or a post", () => {
    const wall = layout.walls.find((w) => w.id === "room-archive-wall-s-2")!;
    const rail = layout.walls.find((w) => w.id === "rail-bn-front-1")!;

    for (const solid of [wall, rail]) {
      const x = (solid.minX + solid.maxX) / 2;
      const z = (solid.minZ + solid.maxZ) / 2;
      const p = spawnPlayer(x, solid.height, z, NORTH);

      p.step(2);

      // It slid off and fell, or landed beside it; it is not standing on the top.
      expect(Math.abs(p.feet() - solid.height), solid.id).toBeGreaterThan(0.5);
    }
  });

  it("wide things, like a prop or a ledge, still can be stood on", () => {
    const crate = layout.walls.find((w) => w.id === "stack-wh-1")!;
    const x = (crate.minX + crate.maxX) / 2;
    const z = (crate.minZ + crate.maxZ) / 2;
    const p = spawnPlayer(x, crate.height, z, NORTH);

    p.step(1);

    expect(p.feet()).toBeCloseTo(crate.height, 1);
  });
});

describe("Props you can step up on", () => {
  it("low boxes can be stood on however narrow (a console, a maintenance box), tall posts cannot", () => {
    const low = layout.walls.find((w) => w.id === "box-server")!; // 1.1 m, 0.8 m wide
    const lx = (low.minX + low.maxX) / 2;
    const lz = (low.minZ + low.maxZ) / 2;
    const onLow = spawnPlayer(lx, low.height, lz, NORTH);

    onLow.step(1);
    expect(onLow.feet()).toBeCloseTo(low.height, 1);

    // A tall steel post (a thin column) is no floor: nobody stands on its top.
    const map = new MapBuilder(20, 20);

    map.createFloorSection(
      "floor",
      { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      4,
    );
    map.createSteelColumn("post", 0, 0, 4, 7);

    const posts = new ArenaCollision(map.build());

    expect(posts.isBlocked(0.3, 0, 4, 0.2)).toBe(true);
    expect(posts.groundHeight(0, 0, 7)).toBe(4);
  });

  it("a crate can be jumped onto from the floor, a 2 m rack cannot", () => {
    const jumpOnto = (x: number, z: number, feet: number, yaw: number) => {
      const p = spawnPlayer(x, feet, z, yaw);

      p.input.keys.add("KeyW");
      p.step(0.4);
      p.input.jumpQueued = true;
      p.step(0.7);
      p.input.keys.clear();
      p.step(0.8);

      return p.feet();
    };
    // The Cargo office's crate (1 m) from the west, and a Server room rack (2 m).
    const crate = layout.walls.find((w) => w.id === "crate-cargo-d")!;
    const rack = layout.walls.find((w) => w.id === "rack-server-3")!;
    const crateTop = crate.height;
    const rackTop = rack.height;

    expect(
      jumpOnto(crate.minX - 1.4, (crate.minZ + crate.maxZ) / 2, UPPER, EAST),
    ).toBeCloseTo(crateTop, 1);
    expect(
      jumpOnto((rack.minX + rack.maxX) / 2, rack.maxZ + 1.4, UPPER, NORTH),
    ).toBeLessThan(rackTop - 0.5);
  });
});

describe("Low walls on the roofs", () => {
  it("a waist-high roof parapet stops a body like a wall: no jumping over, no sinking into it", () => {
    const parapet = layout.walls.find(
      (w) => w.id === "parapet-warehouse-north-1",
    )!;
    const top = parapet.base ?? parapet.bottom ?? 0;

    for (const wait of [0.2, 0.35, 0.5]) {
      // On the Warehouse roof, running north at the parapet along its north edge.
      const p = spawnPlayer(26, top, parapet.maxZ + 3, NORTH);

      p.input.keys.add("KeyW");
      p.input.keys.add("ShiftLeft");
      p.step(wait);
      p.input.jumpQueued = true;
      p.step(1.5);

      expect(p.player.position.z, `wait ${wait}`).toBeGreaterThan(parapet.maxZ);
      expect(p.feet(), `wait ${wait}`).toBeCloseTo(top, 1);
    }
  });
});

describe("Crashing into things", () => {
  it("a low thin wall is solid: a body cannot wade into it", () => {
    const map = new MapBuilder(20, 20);

    map.createFloorSection(
      "floor",
      { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      4,
    );
    // 0.4 m high and 0.3 m thick: under the step-up height, but nothing to stand on.
    map.createWall("low", "x", 0, -3, 3, 4, 0.3, 0.4);

    const world = new ArenaCollision(map.build());

    expect(world.isBlocked(0, 0.15, 4, 0.2)).toBe(true);
    expect(world.isBlocked(0, 1, 4, 0.2)).toBe(false);
    // A body walking at it is stopped, not let in.
    let z = 3;

    for (let i = 0; i < 60; i++) {
      z = world.moveHorizontal(0, z, 0, -0.1, 4).z;
    }

    expect(z).toBeGreaterThan(0.3);
  });

  it("a low step is climbed as the feet meet it, not with the legs inside it", () => {
    const map = new MapBuilder(20, 20);

    map.createFloorSection(
      "floor",
      { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      4,
    );
    map.createLedge("step", { minX: -3, maxX: 3, minZ: -2, maxZ: 2 }, 4, 0.3);

    const world = new ArenaCollision(map.build());

    // 0.3 m from the edge: the centre is off the block, the feet are at it.
    expect(world.groundHeight(0, 2.3, 4)).toBe(4);
    expect(world.groundHeight(0, 2.3, 4, 0.3)).toBeCloseTo(4.3);
    // Standing on it, stepping off does not hold you up.
    expect(world.groundHeight(0, 2.3, 4.3, 0.3)).toBe(4);
  });

  it("jumping into a wall stops the run: the jump does not carry on through or along it", () => {
    // From the north walkway at the Archive's south wall (z = -16), sprint and jump.
    const p = spawnPlayer(-4, UPPER, -13.6, NORTH);

    p.input.keys.add("KeyW");
    p.input.keys.add("ShiftLeft");
    p.step(0.25);
    p.input.jumpQueued = true;

    let crashedSpeed = Infinity;

    for (let t = 0; t < 1; t += 1 / 60) {
      p.step(1 / 60);

      if (!p.player.isGrounded && p.player.position.z < -15.4) {
        crashedSpeed = Math.min(
          crashedSpeed,
          Math.hypot(p.player.velocity.x, p.player.velocity.z),
        );
      }
    }

    expect(p.player.position.z).toBeGreaterThan(-16);
    expect(crashedSpeed).toBeLessThan(1);
  });
});
