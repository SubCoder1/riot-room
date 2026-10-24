import * as THREE from "three";

import type { FuelSpillDefinition } from "../world/ArenaLayout";
import type { CombatSystem } from "./CombatSystem";
import { zoneRadius, type FireSystem } from "./FireZones";
import { MOLOTOV_CONFIG as C } from "./MolotovConfig";

/** Fire started by the hazard itself is owned by whoever lit it; this marks none. */
export type FuelState = "intact" | "burning" | "spent";

/** How close to the spill a bottle may break and still light it (past its edge). */
const BOTTLE_REACH = C.MOLOTOV_START_RADIUS;
/** How close to the spill a grenade may go off and still light it (past its edge). */
const BLAST_REACH = 2.2;
/** A fire already burning this close to the spill's centre is the spill's fire. */
const SAME_FIRE = 0.8;
/** How close to the oil's trail a bottle breaks to light it (m). */
const TRAIL_REACH = 0.7;
/** Vertical reach: the event must be on the spill's floor. */
const FLOOR_REACH = 1.2;

/**
 * The designated fuel hazards (`ArenaLayout.fuelSpills`): pools of spilled
 * fuel, and nothing else. Pure logic over the combat events and the fire
 * system, with no rendering, so a server can run the same class and clients
 * only draw the states.
 *
 *   - A Molotov that breaks on a pool (its fire starts within the pool's
 *     radius) lights it: the pool burns with an ordinary fire zone at its
 *     centre, so its damage, radius and seven seconds are the Molotov's own.
 *   - A grenade that goes off close to a pool lights it the same way.
 *   - Each pool burns once a round: `intact` to `burning` to `spent` (when its
 *     fire has gone out). A burning or spent pool ignores everything, and
 *     the hazard starts no explosion of its own, so nothing can chain.
 */
/** The patches a spill lies in: the pool, its lobes, and a few along its trail. */
function poolShape(
  spill: FuelSpillDefinition,
): Array<{ x: number; z: number; r: number }> {
  return [
    { x: spill.x, z: spill.z, r: spill.radius * 0.8 },
    ...(spill.lobes ?? []),
    ...(spill.path ?? []).map((p) => ({ x: p.x, z: p.z, r: 0.5 })),
  ];
}

/** How far (x, z) is from the spill's trail (Infinity if it has none). */
function trailDistance(
  spill: FuelSpillDefinition,
  x: number,
  z: number,
): number {
  const path = spill.path ?? [];
  let best = Infinity;

  for (let i = 1; i < path.length; i++) {
    const ax = path[i - 1].x;
    const az = path[i - 1].z;
    const dx = path[i].x - ax;
    const dz = path[i].z - az;
    const t = Math.min(
      Math.max(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0),
      1,
    );

    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }

  return best;
}

export class FuelHazard {
  private readonly states = new Map<
    string,
    { state: FuelState; zoneId: number }
  >();
  private lighting = false;
  private readonly unsubscribe: () => void;

  private readonly spills: readonly FuelSpillDefinition[];
  private readonly fires: FireSystem;

  constructor(
    spills: readonly FuelSpillDefinition[],
    combat: CombatSystem,
    fires: FireSystem,
  ) {
    this.spills = spills;
    this.fires = fires;

    for (const spill of spills) {
      this.states.set(spill.id, { state: "intact", zoneId: -1 });
    }

    this.unsubscribe = combat.events.subscribe((event) => {
      if (this.lighting) {
        // The fire this class started: never a trigger.
        return;
      }

      if (event.type === "fire-started") {
        for (const spill of this.spills) {
          const d = Math.hypot(event.x - spill.x, event.z - spill.z);
          const onTrail =
            trailDistance(spill, event.x, event.z) <= TRAIL_REACH ||
            (spill.lobes ?? []).some(
              (l) =>
                Math.hypot(event.x - l.x, event.z - l.z) <= l.r + BOTTLE_REACH,
            );

          if (
            (d <= spill.radius + BOTTLE_REACH || onTrail) &&
            this.onFloor(spill, event.y)
          ) {
            this.light(spill, event.ownerId, event.zoneId, d);
          }
        }
      } else if (event.type === "explosion") {
        for (const spill of this.spills) {
          const d = Math.hypot(event.x - spill.x, event.z - spill.z);

          if (d <= spill.radius + BLAST_REACH && this.onFloor(spill, event.y)) {
            this.light(spill, event.ownerId, -1, d);
          }
        }
      } else if (event.type === "fire-ended") {
        for (const entry of this.states.values()) {
          if (entry.state === "burning" && entry.zoneId === event.zoneId) {
            entry.state = "spent";
          }
        }
      }
    });
  }

  public stateOf(id: string): FuelState {
    return this.states.get(id)?.state ?? "intact";
  }

  /**
   * Call every frame: an ordinary fire whose spreading edge has reached an
   * intact pool (over the pool's floor, with no wall between) lights it, so a
   * Molotov thrown beside the oil sets it off as the fire grows.
   */
  public update(): void {
    if (this.fires.zones.length === 0) {
      return;
    }

    for (const spill of this.spills) {
      const entry = this.states.get(spill.id);

      if (!entry || entry.state !== "intact") {
        continue;
      }

      for (const zone of this.fires.zones) {
        if (zone.fuel || !this.onFloor(spill, zone.position.y)) {
          continue;
        }

        const radius = zoneRadius(zone);

        for (const patch of poolShape(spill)) {
          const d = Math.hypot(
            zone.position.x - patch.x,
            zone.position.z - patch.z,
          );

          if (d > radius + patch.r) {
            continue;
          }

          // The patch's edge nearest the fire (or the fire's heart if inside it).
          const t = d > 0 ? Math.min(patch.r, d) / d : 0;
          const ex = patch.x + (zone.position.x - patch.x) * t;
          const ez = patch.z + (zone.position.z - patch.z) * t;

          if (this.fires.reachesPoint(zone, ex, ez)) {
            this.light(spill, zone.ownerId, -1, d);

            break;
          }
        }

        if (entry.state !== "intact") {
          break;
        }
      }
    }
  }

  /** A new round: every pool is full again (call after the fires are cleared). */
  public reset(): void {
    for (const entry of this.states.values()) {
      entry.state = "intact";
      entry.zoneId = -1;
    }
  }

  public dispose(): void {
    this.unsubscribe();
  }

  private onFloor(spill: FuelSpillDefinition, y: number): boolean {
    return Math.abs(y - spill.y) <= FLOOR_REACH;
  }

  private light(
    spill: FuelSpillDefinition,
    ownerId: string,
    bottleZoneId: number,
    distance: number,
  ): void {
    const entry = this.states.get(spill.id);

    if (!entry || entry.state !== "intact") {
      return;
    }

    entry.state = "burning";

    // A bottle that broke at the pool's heart already made its fire.
    if (bottleZoneId >= 0 && distance <= SAME_FIRE) {
      const zone = this.fires.zones.find((z) => z.id === bottleZoneId);

      // The bottle's own fire becomes the fuel fire, at the heart of the pool.
      if (zone) {
        zone.fuel = true;
        zone.shape = poolShape(spill);
        zone.position.set(
          spill.fire?.x ?? spill.x,
          zone.position.y,
          spill.fire?.z ?? spill.z,
        );
      }

      entry.zoneId = bottleZoneId;

      return;
    }

    this.lighting = true;

    try {
      const lit = this.fires.ignite(
        ownerId,
        new THREE.Vector3(
          spill.fire?.x ?? spill.x,
          spill.y,
          spill.fire?.z ?? spill.z,
        ),
        { fuel: true },
      );

      lit.shape = poolShape(spill);
      entry.zoneId = lit.id;
    } finally {
      this.lighting = false;
    }
  }
}
