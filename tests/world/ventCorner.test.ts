import { describe, expect, it } from "vitest";

import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";
import { spawnPlayer } from "./playerHarness";

const F = 4;
// The Archive route: west along the north walkway tunnel (z -13.6 to -12.4),
// then north up the branch at x -8.6 to -7.4 into the Archive.
const grate = ARENA_LAYOUT.upperVents.grates.find(
  (g) => g.id === "vent-upper-2",
)!;

function crawler(x: number, z: number, yaw: number) {
  const p = spawnPlayer(grate.x, F, grate.z);

  p.player.enterVent();
  p.step(1);
  p.player.position.x = x;
  p.player.position.z = z;
  p.input.yaw = yaw;

  return p;
}

describe("Turning the corner into the Archive's branch of the vents", () => {
  it("is in the vent network with the branch where expected", () => {
    const p = crawler(-5, -13, 0);

    expect(p.player.isUnderground).toBe(true);
    expect(ARENA_LAYOUT.upperVents.tunnels.some((t) => t.minX === -8.6)).toBe(
      true,
    );
  });

  it("carries a body that is not lined up with the branch round the corner in one move", () => {
    // From several places along the walkway tunnel, then turning north.
    for (const x of [-8.55, -8.45, -8.3, -8.0, -7.7, -7.5, -7.3]) {
      const p = crawler(x, -13, 0);
      let last = p.player.position.z;
      let stalled = 0;

      p.input.keys.add("KeyW");

      for (let f = 0; f < 120; f++) {
        p.step(1 / 60);

        if (Math.abs(p.player.position.z - last) < 1e-5) {
          stalled++;
        }

        last = p.player.position.z;
      }

      expect(p.player.position.z, `from x ${x}`).toBeLessThan(-16);
      // It never stops dead at the mouth of the branch for more than a few frames.
      expect(stalled, `from x ${x}`).toBeLessThan(20);
    }
  });

  it("still cannot leave the tunnels", () => {
    const p = crawler(-8.0, -13, 0);

    p.input.keys.add("KeyW");
    p.step(4);

    // Up the branch, at most to its end, and always inside it.
    expect(p.player.position.x).toBeGreaterThan(-8.6 + 0.39);
    expect(p.player.position.x).toBeLessThan(-7.4 - 0.39);

    p.input.keys.clear();
    p.input.keys.add("KeyD");
    p.step(2);
    expect(p.player.position.x).toBeLessThan(-7.4 - 0.39 + 1e-6);
  });
});
