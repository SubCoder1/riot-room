import { beforeEach, describe, expect, it } from "vitest";

import { BREACH_TIMING, Breach } from "../../src/mission/Breach";
import { ARENA_LAYOUT, VAULT_BREACH } from "../../src/world/UpperFloorMap";
import { ArenaCollision } from "../../src/world/ArenaCollision";
import {
  CORE_HALF_WIDTH,
  CORE_HEIGHT,
  CORE_PILE_ID,
} from "../../src/world/CollapsedEntrance";

const DT = 1 / 60;

function run(breach: Breach, seconds: number): string[] {
  const events: string[] = [];

  for (let t = 0; t < seconds; t += DT) {
    events.push(...breach.update(DT));
  }

  return events;
}

describe("Breach (plant, light, fuse, blast)", () => {
  let breach: Breach;

  beforeEach(() => {
    breach = new Breach();
  });

  it("starts idle: nothing can be lit before it is planted", () => {
    expect(breach.phase).toBe("idle");
    expect(breach.startIgnition()).toBe(false);
    expect(run(breach, 30)).toEqual([]);
    expect(breach.phase).toBe("idle");
  });

  it("plants once, and a second plant changes nothing", () => {
    expect(breach.plant()).toBe(true);
    expect(breach.plant()).toBe(false);
    expect(breach.phase).toBe("planted");
    expect(breach.isPlanted).toBe(true);
    // Planted does not go off by itself.
    expect(run(breach, 30)).toEqual([]);
    expect(breach.phase).toBe("planted");
  });

  it("lights once, then the animation runs its length and the fuse starts", () => {
    breach.plant();
    expect(breach.startIgnition()).toBe(true);
    expect(breach.startIgnition()).toBe(false);
    expect(breach.isIgniting).toBe(true);

    run(breach, BREACH_TIMING.IGNITE_SECONDS / 2);
    expect(breach.ignitionProgress).toBeGreaterThan(0.4);
    expect(breach.ignitionProgress).toBeLessThan(0.6);

    const events = run(breach, BREACH_TIMING.IGNITE_SECONDS / 2 + 0.1);

    expect(events).toEqual(["ignited"]);
    expect(breach.phase).toBe("fuse");
    expect(breach.isIgniting).toBe(false);
    expect(breach.fuseLeft).toBeGreaterThan(0);
  });

  it("stops if let go before the wire is lit, and cannot be stopped after", () => {
    breach.plant();
    breach.startIgnition();
    run(breach, BREACH_TIMING.IGNITE_SECONDS * (BREACH_TIMING.SPARK_AT - 0.1));
    expect(breach.isCommitted).toBe(false);
    expect(breach.cancel()).toBe(true);
    expect(breach.phase).toBe("idle");
    expect(run(breach, 30)).toEqual([]);

    // It can be started again, and once lit there is no stopping it.
    expect(breach.plant()).toBe(true);
    expect(breach.startIgnition()).toBe(true);
    run(breach, BREACH_TIMING.IGNITE_SECONDS * (BREACH_TIMING.SPARK_AT + 0.05));
    expect(breach.isCommitted).toBe(true);
    expect(breach.cancel()).toBe(false);
    expect(breach.phase).toBe("igniting");
  });

  it("goes off exactly once, a readable time after the flame, and never again", () => {
    breach.plant();
    breach.startIgnition();

    const events = run(
      breach,
      BREACH_TIMING.IGNITE_SECONDS + BREACH_TIMING.FUSE_SECONDS + 1,
    );

    expect(events).toEqual(["ignited", "blown"]);
    expect(breach.phase).toBe("blown");
    expect(BREACH_TIMING.FUSE_SECONDS).toBeGreaterThanOrEqual(4);

    // Nothing more happens, whatever is asked.
    expect(run(breach, 30)).toEqual([]);
    expect(breach.plant()).toBe(false);
    expect(breach.startIgnition()).toBe(false);
  });

  it("a very long frame still gives the events in order, once each", () => {
    breach.plant();
    breach.startIgnition();

    expect(breach.update(100)).toEqual(["ignited", "blown"]);
    expect(breach.update(100)).toEqual([]);
  });

  it("a reset puts everything back, and the whole thing can be done again", () => {
    breach.plant();
    breach.startIgnition();
    run(breach, 20);
    expect(breach.phase).toBe("blown");

    breach.reset();
    expect(breach.phase).toBe("idle");
    expect(breach.plant()).toBe(true);
  });
});

describe("The vault entrance and its charge site", () => {
  it("has a charge site on the dock side of the heap, in the doorway", () => {
    const site = VAULT_BREACH.site!;

    expect(site).not.toBeNull();
    // The doorway is the Server room's west door: x 22, z -16.3 to -12.3.
    expect(site.z).toBeGreaterThan(-16.3);
    expect(site.z).toBeLessThan(-12.3);
    // Out in the dock (toward -x) from the wall face, facing away from it.
    expect(site.x).toBeLessThan(22);
    expect(site.x).toBeGreaterThan(19.5);
    expect(site.normal).toEqual([-1, 0]);
    expect(site.y).toBeGreaterThan(4.5);
    expect(site.y).toBeLessThan(5.5);
  });

  it("is shut by the heap until the breach: the doorway cannot be walked through", () => {
    const world = new ArenaCollision(ARENA_LAYOUT);
    const site = VAULT_BREACH.site!;
    const through = (): boolean =>
      world.isBlocked(site.x, site.z, 4.05, 0.3) ||
      world.isBlocked(21.4, site.z, 4.05, 0.3);

    expect(through()).toBe(true);
  });

  it("opens when the heap's solids are opened, and closes when they are put back", () => {
    const world = new ArenaCollision(ARENA_LAYOUT);
    const pile = ARENA_LAYOUT.piles.find((p) => p.id === CORE_PILE_ID)!;
    const site = VAULT_BREACH.site!;
    const blocked = (): boolean => world.isBlocked(21.2, site.z, 4.05, 0.3);

    expect(pile.solids.length).toBeGreaterThan(0);
    expect(pile.animated).toBe(true);
    expect(blocked()).toBe(true);

    for (const id of pile.solids) {
      world.setOpen(id, true);
    }

    expect(blocked()).toBe(false);
    // And a body can walk the whole way in along the doorway's middle.
    let x = 19.5;

    for (; x > 19.4 || x < 23; x += 0.1) {
      if (x >= 23) {
        break;
      }

      expect(world.isBlocked(x, site.z, 4.05, 0.25), `x ${x.toFixed(1)}`).toBe(
        false,
      );
    }

    for (const id of pile.solids) {
      world.setOpen(id, false);
    }

    expect(blocked()).toBe(true);
  });
});

describe("The vault entrance's tape and lamp once it is blown", () => {
  const tape = ARENA_LAYOUT.tapes!.find((t) => t.id === "tape-vault")!;

  it("has a few torn pieces of tape ready, short ones, near the entrance", () => {
    const torn = tape.torn!;
    const site = VAULT_BREACH.site!;

    expect(torn.length).toBeGreaterThanOrEqual(5);
    expect(torn.length).toBeLessThanOrEqual(9);

    for (const run of torn) {
      const length = Math.hypot(
        run.to[0] - run.from[0],
        run.to[1] - run.from[1],
        run.to[2] - run.from[2],
      );

      expect(length).toBeLessThan(1.6);
      expect(Math.abs(run.from[2] - site.z)).toBeLessThan(3.2);
      expect(Math.abs(run.from[0] - site.x)).toBeLessThan(4);
      // Never hung across the opened doorway at passing height.
      expect(
        Math.abs(run.from[2] - site.z) < 0.9 &&
          Math.abs(run.to[2] - site.z) < 0.9 &&
          run.from[1] > site.y &&
          run.from[1] < site.y + 1,
      ).toBe(false);
    }
  });

  it("has the wreck of the fallen floodlight as a group the blast shows (no collision)", () => {
    const wreck = ARENA_LAYOUT.piles.find(
      (p) => p.id === "fittings-vault-wreck",
    )!;

    expect(wreck.animated).toBe(true);
    expect(wreck.solids).toHaveLength(0);
    expect(wreck.elements.length).toBeGreaterThan(8);
  });
});

describe("The rubble obstruction", () => {
  const plan = VAULT_BREACH.obstruction;

  it("is a few heavy slabs, some lodged chunks, small debris and a few bars", () => {
    const kinds = (k: string): number =>
      plan.filter((p) => p.kind === k).length;

    // Three to five dominant fragments, and fewer medium ones than that and a bit.
    expect(kinds("slab")).toBeGreaterThanOrEqual(3);
    expect(kinds("slab")).toBeLessThanOrEqual(5);
    expect(kinds("rock")).toBeGreaterThanOrEqual(3);
    expect(kinds("rock")).toBeLessThanOrEqual(7);
    expect(kinds("bit")).toBeGreaterThanOrEqual(8);
    expect(kinds("rebar")).toBeGreaterThanOrEqual(2);
    // A controlled number of pieces, not a debris field.
    expect(plan.length).toBeLessThan(35);

    // No two slabs alike.
    const slabs = plan.filter((p) => p.kind === "slab");

    expect(new Set(slabs.map((p) => p.size.join())).size).toBe(slabs.length);
  });

  it("fills the blocked passage before the blast, as far up as the collision", () => {
    const site = VAULT_BREACH.site!;
    const floor = site.y - 1.0;
    const high = Math.max(
      ...plan
        .filter((p) => p.kind !== "bit")
        .map((p) => p.from.p[1] + p.size[1] / 2 - floor),
    );

    expect(high).toBeGreaterThan(CORE_HEIGHT - 0.35);

    // Nothing starts outside the passage's width by more than a piece's size.
    for (const p of plan) {
      expect(Math.abs(p.from.p[2] - site.z)).toBeLessThan(
        CORE_HALF_WIDTH + 0.6,
      );
    }
  });

  it("every piece comes to rest on the floor, in the dock, out of the middle of the way in", () => {
    const site = VAULT_BREACH.site!;
    const floor = site.y - 1.0;

    for (const p of plan) {
      // On the dock side of the doorway (dock is toward -x: out = -1).
      expect(p.to.p[0]).toBeLessThan(site.x + 1.0);
      // Resting: no higher than its own size above the floor.
      expect(p.to.p[1] - floor).toBeLessThan(Math.max(...p.size) * 0.7 + 0.1);
      expect(p.to.p[1] - floor).toBeGreaterThan(0);
      // Not left in the way of someone walking in (a clear lane down the middle).
      if (p.kind === "slab" || p.kind === "rock") {
        expect(Math.abs(p.to.p[2] - site.z)).toBeGreaterThan(0.4);
      }
    }
  });
});
