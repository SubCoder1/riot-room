import type { ArenaLayout, DecalDefinition } from "./ArenaLayout";

/**
 * Where the floors are dirtier than the rest: the worn patch in front of every
 * doorway (everyone walks through it), the oil under machinery and a drift of
 * dust round each pile of building material. Pure data, worked out from the
 * layout the same way every run; it only becomes soft marks on the floor.
 *
 * Marks are never put over a vent grating (the opening stays plainly open) and
 * are kept small and low in contrast: dirt, not a pattern.
 */

// Only machinery out on the open decks: what stands in a room is left to the
// rooms' own dressing.
const MACHINE_ID = /^generator-/;

const DUST_COLORS: Record<string, { color: number; alpha: number }> = {
  cement: { color: 0xd2c9b2, alpha: 0.4 },
  bricks: { color: 0x7d4a3a, alpha: 0.32 },
  rubble: { color: 0x8c8d90, alpha: 0.3 },
  wood: { color: 0xb59a6e, alpha: 0.3 },
  bags: { color: 0xd2c9b2, alpha: 0.36 },
  bagwall: { color: 0xd2c9b2, alpha: 0.36 },
  pipes: { color: 0x6d6f72, alpha: 0.24 },
  barricade: { color: 0x7d4a3a, alpha: 0.3 },
};

function hashId(id: string): number {
  let hash = 2166136261;

  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  }

  return hash >>> 0;
}

/** A repeatable number in [0, 1) from an id and a salt. */
function unit(id: string, salt: number): number {
  return (hashId(`${id}#${salt}`) % 10000) / 10000;
}

export function addWeathering(layout: ArenaLayout): void {
  const decals: DecalDefinition[] = [];
  const openings = [...layout.vents.tunnels, ...layout.upperVents.tunnels];
  const overVent = (x: number, z: number, y: number): boolean =>
    openings.some((t, index) => {
      const surface =
        index < layout.vents.tunnels.length
          ? layout.vents.surfaceY
          : layout.upperVents.surfaceY;

      return (
        Math.abs(surface - y) < 0.1 &&
        x > t.minX - 0.4 &&
        x < t.maxX + 0.4 &&
        z > t.minZ - 0.4 &&
        z < t.maxZ + 0.4
      );
    });
  // A mark is never put inside a room (a doorway between two rooms leads
  // into the other one): the rooms are dressed separately.
  const inRoom = (x: number, z: number, y: number): boolean =>
    layout.rooms.some(
      (r) =>
        Math.abs(r.floorY - y) < 0.5 &&
        x > r.minX - 0.4 &&
        x < r.maxX + 0.4 &&
        z > r.minZ - 0.4 &&
        z < r.maxZ + 0.4 &&
        // (the wall's own thickness is outside)
        x > r.minX + 0.05 &&
        x < r.maxX - 0.05 &&
        z > r.minZ + 0.05 &&
        z < r.maxZ - 0.05,
    );
  const add = (decal: DecalDefinition): void => {
    if (
      !overVent(decal.x, decal.z, decal.y) &&
      !inRoom(decal.x, decal.z, decal.y)
    ) {
      decals.push(decal);
    }
  };

  // Worn dirt where people walk: just outside every doorway.
  for (const room of layout.rooms) {
    room.doors.forEach((door, index) => {
      const id = `wear-${room.id}-${index + 1}`;
      const alongX = door.side === "n" || door.side === "s";
      const wallZ = door.side === "n" ? room.minZ : room.maxZ;
      const wallX = door.side === "w" ? room.minX : room.maxX;
      const along = door.width + 0.7 + unit(id, 1) * 0.4;
      const across = 1.7 + unit(id, 2) * 0.4;
      // Outside the doorway only: the room's own floor is left to its dressing.
      const out = across / 2 + 0.05;
      const dx = door.side === "e" ? out : door.side === "w" ? -out : 0;
      const dz = door.side === "s" ? out : door.side === "n" ? -out : 0;

      add({
        id,
        kind: "wear",
        x: (alongX ? door.at : wallX) + dx,
        z: (alongX ? wallZ : door.at) + dz,
        y: room.floorY,
        width: alongX ? along : across,
        depth: alongX ? across : along,
        rotation: (unit(id, 3) - 0.5) * 0.12,
        color: 0x0b0b0d,
        alpha: 0.42,
      });
    });
  }

  // Oil and grime under machinery.
  for (const solid of layout.walls) {
    if (solid.role !== "machinery" || !MACHINE_ID.test(solid.id)) {
      continue;
    }

    const width = solid.maxX - solid.minX;
    const depth = solid.maxZ - solid.minZ;

    add({
      id: `stain-${solid.id}`,
      kind: "stain",
      x: (solid.minX + solid.maxX) / 2,
      z: (solid.minZ + solid.maxZ) / 2,
      y: solid.bottom ?? 0,
      width: width + 1.3,
      depth: depth + 1.3,
      rotation: unit(solid.id, 1) * Math.PI,
      color: 0x060607,
      alpha: 0.38,
    });
  }

  // A drift of dust round each pile.
  for (const pile of layout.piles) {
    // A railing re-dressed as pipes or brick is not a pile: no drift of dust.
    if (/-(pipes|brick)$/.test(pile.id)) {
      continue;
    }

    const boxes = layout.walls.filter((w) => pile.solids.includes(w.id));

    if (boxes.length === 0) {
      continue;
    }

    const minX = Math.min(...boxes.map((b) => b.minX));
    const maxX = Math.max(...boxes.map((b) => b.maxX));
    const minZ = Math.min(...boxes.map((b) => b.minZ));
    const maxZ = Math.max(...boxes.map((b) => b.maxZ));
    const look = DUST_COLORS[pile.kind];

    add({
      id: `dust-${pile.id}`,
      kind: "dust",
      x: (minX + maxX) / 2,
      z: (minZ + maxZ) / 2,
      y: pile.baseY,
      width: maxX - minX + 1.1,
      depth: maxZ - minZ + 1.1,
      rotation: unit(pile.id, 1) * 0.5,
      color: look.color,
      alpha: look.alpha,
    });
  }

  layout.decals.push(...decals);
}
