import { describe, expect, it } from "vitest";

import {
  VENT_FLOOR_Y,
  findGrate,
  inTunnel,
  ventBlocks,
  ventBlocksNear,
} from "../../src/world/Vents";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";
import { createVents } from "../../src/world/ArenaBuilder";
import { NORTH, spawnPlayer, world, yawFor } from "./playerHarness";
import * as THREE from "three";

const vents = ARENA_LAYOUT.vents;
const west = vents.grates.find((g) => g.id === "vent-grate-west")!;
const long = vents.grates.find((g) => g.id === "vent-grate-long")!;
// A spot on the long tunnel's grating, on bare floor: where the thugs cross.
const spot = { x: 6, z: -9 };

describe("The ventilation network", () => {
  it("has three gratings covering the whole path, each over a tunnel, all joined", () => {
    expect(vents.grates).toHaveLength(3);

    for (const grate of vents.grates) {
      // The middle of every grate is in a tunnel, and its whole footprint is.
      expect(inTunnel(vents, grate.x, grate.z), grate.id).toBe(true);
      expect(
        inTunnel(
          vents,
          grate.x - grate.halfX + 0.05,
          grate.z - grate.halfZ + 0.05,
        ),
        grate.id,
      ).toBe(true);
      expect(
        inTunnel(
          vents,
          grate.x + grate.halfX - 0.05,
          grate.z + grate.halfZ - 0.05,
        ),
        grate.id,
      ).toBe(true);
    }

    // Connected: from the west grate a body can crawl to each of the others.
    const p = spawnPlayer(west.x, 0, west.z);

    p.player.enterVent();
    p.step(1);
    expect(p.player.isUnderground).toBe(true);
    expect(p.feet()).toBeCloseTo(VENT_FLOOR_Y, 1);
  });

  it("the grating is real bars with gaps, in 1.2 m blocks that cover the whole path", () => {
    const group = createVents(ARENA_LAYOUT);
    const blocks = ventBlocks(vents);

    // Blocks tile every tunnel except the spots left as plain floor at a ladder's
    // foot: the blocks plus the shut part make up the tunnels.
    const tunnelArea = vents.tunnels
      .filter((t) => t.grated !== false)
      .reduce((n, t) => n + (t.maxX - t.minX) * (t.maxZ - t.minZ), 0);
    const blockArea = blocks
      .filter((b) => b.y === 0)
      .reduce((n, b) => n + (b.maxX - b.minX) * (b.maxZ - b.minZ), 0);

    expect(blockArea).toBeLessThanOrEqual(tunnelArea + 1e-6);
    expect(blockArea).toBeGreaterThan(tunnelArea * 0.85);

    for (const block of blocks) {
      expect(block.maxX - block.minX).toBeLessThanOrEqual(1.25);
      expect(block.maxZ - block.minZ).toBeLessThanOrEqual(1.25);

      const holder = group.getObjectByName(`ventblock:${block.id}`);

      expect(holder, block.id).toBeDefined();

      const mesh = holder!.children[0] as THREE.Mesh;
      const positions = mesh.geometry.getAttribute("position");

      // Thin bars: a frame and many small boxes (24 vertices each), not a panel.
      expect(positions.count / 24, block.id).toBeGreaterThan(8);

      const box = new THREE.Box3().setFromObject(holder!);

      expect(box.max.y - box.min.y).toBeLessThan(0.1);
      expect(box.max.x - box.min.x).toBeCloseTo(block.maxX - block.minX, 2);
    }
  });
});

describe("A ladder's foot is not a vent", () => {
  it("has no grating or way in at the foot of any ladder over the tunnels, so E there is the ladder's", () => {
    expect(vents.closed.length).toBeGreaterThan(0);

    for (const ladder of ARENA_LAYOUT.ladders) {
      const over = vents.closed.some(
        (c) =>
          ladder.approach.x > c.minX &&
          ladder.approach.x < c.maxX &&
          ladder.approach.z > c.minZ &&
          ladder.approach.z < c.maxZ,
      );

      if (!over) continue;

      expect(
        findGrate(vents, ladder.approach.x, ladder.approach.z),
        ladder.id,
      ).toBeNull();

      const p = spawnPlayer(ladder.approach.x, 0, ladder.approach.z);

      expect(p.player.ventEntryInReach(), ladder.id).toBeNull();
      expect(p.player.enterVent(), ladder.id).toBe(false);
    }
  });
});

describe("Only the block being climbed through opens", () => {
  it("a body overlaps at most four blocks, a tiny share of the path", () => {
    const blocks = ventBlocks(vents);

    for (const [x, z] of [
      [0, -9],
      [-12, 0],
      [-12.0, -7.8],
      [6.6, -9.6],
    ]) {
      const near = ventBlocksNear(blocks, x, z, 0.45);

      expect(near.length, `${x},${z}`).toBeGreaterThanOrEqual(1);
      expect(near.length, `${x},${z}`).toBeLessThanOrEqual(4);
      expect(near.length).toBeLessThan(blocks.length / 10);
    }
  });
});

describe("The vigilante's way in and out", () => {
  it("climbs down through a grate with E and crawls about under the floor", () => {
    const p = spawnPlayer(west.x, 0, west.z, NORTH);

    p.step(0.2);
    expect(p.player.ventEntryInReach()).toBe(west.id);
    expect(p.player.enterVent()).toBe(true);
    expect(p.player.isInVent).toBe(true);
    // Smoothly: halfway through, feet are between the floor and the vent.
    p.step(0.14);
    expect(p.feet()).toBeLessThan(-0.2);
    expect(p.feet()).toBeGreaterThan(VENT_FLOOR_Y + 0.2);
    expect(p.player.ventTransitionPoint).not.toBeNull();
    p.step(0.6);
    expect(p.player.isUnderground).toBe(true);
    expect(p.feet()).toBeCloseTo(VENT_FLOOR_Y, 2);

    // Crawling north up the branch, and never out of the tunnel.
    p.input.keys.add("KeyW");
    p.step(8);
    p.input.keys.clear();
    expect(inTunnel(vents, p.player.position.x, p.player.position.z)).toBe(
      true,
    );
    expect(p.player.position.z).toBeLessThan(-7.8);
    expect(p.feet()).toBeCloseTo(VENT_FLOOR_Y, 2);

    // Walking into a wall of the tunnel goes nowhere.
    p.input.yaw = yawFor(-1, 0);
    p.input.keys.add("KeyW");
    p.step(3);
    p.input.keys.clear();
    expect(p.player.position.x).toBeGreaterThan(-13.2);
  });

  it("can come out through a different grate, and from anywhere along the path", () => {
    const p = spawnPlayer(west.x, 0, west.z);

    p.player.enterVent();
    p.step(1);

    // Up the west branch, then east along the long tunnel.
    p.input.yaw = yawFor(0, -1);
    p.input.keys.add("KeyW");
    p.step(4.5);
    p.input.yaw = yawFor(1, 0);
    p.step(2.2);
    p.input.keys.clear();
    p.step(0.2);

    const here = findGrate(vents, p.player.position.x, p.player.position.z);

    expect(here?.id).toBe(long.id);
    expect(here?.id).not.toBe(west.id);
    expect(p.player.ventExitInReach()).toBe(long.id);
    expect(p.player.leaveVent()).toBe(true);
    p.step(1);
    expect(p.player.isInVent).toBe(false);
    expect(p.feet()).toBeCloseTo(0, 2);
    expect(p.player.isGrounded).toBe(true);
    // Up on the floor, well away from where they went in.
    expect(
      Math.hypot(p.player.position.x - west.x, p.player.position.z - west.z),
    ).toBeGreaterThan(5);
  });

  it("the whole path is grated: a way out at every point along it", () => {
    // Walk the whole length of the long tunnel and the west branch underground.
    const p = spawnPlayer(west.x, 0, west.z);

    p.player.enterVent();
    p.step(1);
    p.input.yaw = yawFor(0, -1);
    p.input.keys.add("KeyW");

    let checked = 0;

    for (let t = 0; t < 4.5; t += 0.25) {
      p.step(0.25);
      expect(p.player.ventExitInReach(), `at ${t}`).not.toBeNull();
      checked++;
    }

    expect(checked).toBeGreaterThan(10);
  });

  it("is not available away from a grate, in the air, or on a roof", () => {
    const off = spawnPlayer(0, 0, 0);

    expect(off.player.ventEntryInReach()).toBeNull();
    expect(off.player.enterVent()).toBe(false);

    const roof = spawnPlayer(west.x, 4, west.z);

    expect(roof.player.enterVent()).toBe(false);
  });
});

describe("Thugs", () => {
  const sides: Array<[string, number, number]> = [
    ["north", 0, -1],
    ["south", 0, 1],
    ["east", 1, 0],
    ["west", -1, 0],
    ["north-east", 1, -1],
    ["north-west", -1, -1],
  ];

  it.each(sides)(
    "can cross a grate from the %s but never get into the vents",
    (_name, dx, dz) => {
      const p = spawnPlayer(
        spot.x - dx * 4,
        0,
        spot.z - dz * 4,
        yawFor(dx, dz),
      );

      p.player.role = "thug";
      p.input.keys.add("KeyW");

      let closest = Infinity;

      for (let t = 0; t < 2.5; t += 1 / 60) {
        p.step(1 / 60);
        p.player.enterVent();

        closest = Math.min(
          closest,
          Math.hypot(
            p.player.position.x - spot.x,
            p.player.position.z - spot.z,
          ),
        );

        // Never below the floor, never in the vents.
        expect(p.player.isInVent).toBe(false);
        expect(p.feet()).toBeGreaterThanOrEqual(-0.001);
      }

      // They walked right across the grate.
      expect(closest).toBeLessThan(1.2);
    },
  );

  it("cannot enter standing on a grate, jumping, crouching or sprinting", () => {
    const p = spawnPlayer(spot.x, 0, spot.z);

    p.player.role = "thug";

    for (const keys of [[], ["KeyC"], ["ShiftLeft", "KeyW"], ["KeyS"]]) {
      p.input.keys.clear();
      keys.forEach((k) => p.input.keys.add(k));
      p.input.jumpQueued = true;
      p.step(0.3);

      expect(p.player.ventEntryInReach()).toBeNull();
      expect(p.player.enterVent()).toBe(false);
      expect(p.player.isInVent).toBe(false);
      expect(p.feet()).toBeGreaterThanOrEqual(-0.001);
    }
  });

  it("the floor is solid under a thug: walking, falling and landing on a grate stay on top", () => {
    const p = spawnPlayer(spot.x, 3, spot.z);

    p.player.role = "thug";
    p.step(2);
    expect(p.player.isGrounded).toBe(true);
    expect(p.feet()).toBeCloseTo(0, 2);
  });
});

describe("The upper-floor vents", () => {
  const upper = ARENA_LAYOUT.upperVents;
  const blocks = ventBlocks(upper);
  const room = (id: string) => ARENA_LAYOUT.rooms.find((r) => r.id === id)!;
  const inRoom = (id: string) => {
    const r = room(id);

    return blocks.filter(
      (b) =>
        (b.minX + b.maxX) / 2 > r.minX &&
        (b.minX + b.maxX) / 2 < r.maxX &&
        (b.minZ + b.maxZ) / 2 > r.minZ &&
        (b.minZ + b.maxZ) / 2 < r.maxZ,
    );
  };
  const centre = (b: (typeof blocks)[number]) => ({
    x: (b.minX + b.maxX) / 2,
    z: (b.minZ + b.maxZ) / 2,
  });
  const crawler =
    (p: ReturnType<typeof spawnPlayer>) =>
    (x: number, z: number): void => {
      for (let t = 0; t < 30; t += 1 / 60) {
        const dx = x - p.player.position.x;
        const dz = z - p.player.position.z;

        if (Math.hypot(dx, dz) < 0.15) break;

        p.input.yaw = yawFor(dx, dz);
        p.input.keys.add("KeyW");
        p.step(1 / 60);
      }

      p.input.keys.clear();
    };

  it("are a single narrow block wide (1.2 m), grated flush in the 4 m floor", () => {
    expect(upper.surfaceY).toBe(4);

    for (const t of upper.tunnels) {
      expect(Math.min(t.maxX - t.minX, t.maxZ - t.minZ)).toBeCloseTo(1.2, 5);
    }

    for (const b of blocks) {
      const c = centre(b);

      expect(world.isBlocked(c.x, c.z, 4, 0.2), b.id).toBe(false);
      expect(world.groundHeight(c.x, c.z, 4), b.id).toBe(4);
    }
  });

  it("south: runs from inside the Store straight out to the south walkway", () => {
    expect(inRoom("room-store").length).toBeGreaterThan(0);
    // On the walkway between the arena and the Store (z 12 to 15).
    expect(
      blocks.some((b) => b.minZ >= 12 && b.maxZ <= 15 && b.maxX < -9),
    ).toBe(true);
  });

  it("north: an L from the north walkway into the Archive", () => {
    expect(inRoom("room-archive").length).toBeGreaterThan(0);
    // The long leg is on the walkway (z -16 to -12) ...
    expect(
      blocks.some((b) => b.minZ >= -14 && b.maxZ <= -12 && b.minX > -7),
    ).toBe(true);
    // ... and it turns north through the Archive's door.
    const door = room("room-archive").doors.find((d) => d.side === "s")!;

    expect(
      blocks.some(
        (b) => b.minX <= door.at && b.maxX >= door.at && b.maxZ < -16,
      ),
    ).toBe(true);
  });

  it("south: the vent runs along the walkway east to where you stand, and you can drop in there", () => {
    expect(
      blocks.some((b) => b.minZ >= 12.9 && b.maxZ <= 14.3 && b.minX > -6),
    ).toBe(true);

    const p = spawnPlayer(-4.5, 4, 13.6);

    p.step(0.3);
    expect(p.player.enterVent()).toBe(true);
    p.step(0.8);
    expect(p.player.isUnderground).toBe(true);
    crawler(p)(-13, 13.6);
    crawler(p)(-13, 18);
    expect(p.player.position.z).toBeGreaterThan(17);
  });

  it("the south route: the vigilante goes down in the Store and comes up on the walkway", () => {
    const from = centre(inRoom("room-store").slice(-1)[0]);
    const p = spawnPlayer(from.x, 4, from.z);

    p.step(0.3);
    expect(p.player.enterVent()).toBe(true);
    p.step(0.6);
    expect(p.player.isUnderground).toBe(true);

    const go = crawler(p);

    go(-13, from.z);
    go(-13, 13.5);
    p.step(0.2);
    expect(p.player.ventExitInReach()).not.toBeNull();
    expect(p.player.leaveVent()).toBe(true);
    p.step(1);
    expect(p.player.isGrounded).toBe(true);
    expect(p.feet()).toBeCloseTo(4, 2);
    expect(p.player.position.z).toBeLessThan(15);
  });

  it("the north route: down on the north walkway, along the L, up inside the Archive", () => {
    const start = centre(
      blocks.find((b) => b.minZ >= -14 && b.maxZ <= -12 && b.minX > 3)!,
    );
    const to = centre(inRoom("room-archive")[0]);
    const p = spawnPlayer(start.x, 4, start.z);

    p.step(0.3);
    expect(p.player.enterVent()).toBe(true);
    p.step(0.6);

    const go = crawler(p);

    go(-8, -13);
    go(-8, to.z);
    p.step(0.2);
    expect(p.player.ventExitInReach()).not.toBeNull();
    expect(p.player.leaveVent()).toBe(true);
    p.step(1);
    expect(p.player.isGrounded).toBe(true);
    expect(p.player.position.z).toBeLessThan(-16.3);
  });

  it("a thug cannot enter from any block of them", () => {
    for (const b of blocks) {
      const c = centre(b);
      const thug = spawnPlayer(c.x, 4, c.z);

      thug.player.role = "thug";
      thug.step(0.2);
      expect(thug.player.enterVent(), b.id).toBe(false);
      expect(thug.player.isInVent, b.id).toBe(false);
    }
  });
});

describe("Entering from the edge of the grating", () => {
  it("never leaves the body where it cannot move: it ends up inside the tunnel and can crawl", () => {
    const blocks = ventBlocks(ARENA_LAYOUT.upperVents);
    const b = blocks.find((k) => k.minZ >= -14 && k.maxZ <= -12 && k.minX > 3)!;
    // 0.2 m outside the tunnel's edge, still within reach of it.
    const p = spawnPlayer((b.minX + b.maxX) / 2, 4, b.maxZ + 0.2);

    p.step(0.3);
    expect(p.player.enterVent()).toBe(true);
    p.step(0.8);
    expect(p.player.isUnderground).toBe(true);
    expect(
      inTunnel(
        ARENA_LAYOUT.upperVents,
        p.player.position.x,
        p.player.position.z,
      ),
    ).toBe(true);

    const x0 = p.player.position.x;

    p.input.yaw = yawFor(-1, 0);
    p.input.keys.add("KeyW");
    p.step(1);
    expect(x0 - p.player.position.x).toBeGreaterThan(1.5);
  });
});
