import type { ArenaLayout, LightDefinition } from "./ArenaLayout";

/**
 * The night's lighting plan. The map's own fixtures are mostly on the first
 * floor, so the central arena would be black; a few halogen lamps hang from the
 * undersides of the overlooks to give it isolated pools, and a few of the
 * existing floodlights are left off or turned down so some places stay dark.
 */

const HALOGEN = 0xfff0d6;

export const EXTRA_LAMPS: LightDefinition[] = [
  // The server racks' status lights: a small cool pool, not a blue room.
  {
    id: "indicator-server-racks",
    x: 27,
    y: 5.3,
    z: -8.4,
    color: 0x4f86e8,
    intensity: 3,
    distance: 4.5,
  },
  {
    id: "halogen-roof-east",
    x: 12,
    y: 15.3,
    z: 21.5,
    color: HALOGEN,
    intensity: 90,
    distance: 18,
    target: { x: 11, y: 10.8, z: 18.2 },
    angle: 0.62,
  },
  {
    id: "halogen-roof-storage",
    // Moved to the yard roof, beside the slanted glass cover over the storage
    // room, and turned to face it: its beam goes in through the glass.
    x: -13,
    y: 12.6,
    z: 22,
    color: HALOGEN,
    intensity: 95,
    distance: 18,
    target: { x: -8, y: 8.1, z: 20.2 },
    angle: 0.7,
  },
];

/** Floodlights left off (nobody switched them on tonight). */
const OFF = new Set([
  "light-support-north-1",
  "light-support-deck-1",
  // The work lamp over the power room's generator has been taken down.
  "light-power-room-work",
]);

/** Fixtures that are on but weak, so their corner stays mostly dark. */
const DIM: Record<string, number> = {
  "light-support-south-1": 0.5,
  "light-site-scaffold": 0.5,
};

/**
 * How each room's own lamp is turned down for the night: a scale on its
 * intensity, a warmer or cooler colour, and a shorter reach so it stays in its
 * room (these point lights have no shadows).
 */
const ROOMS: Record<string, { scale: number; color?: number; reach?: number }> =
  {
    "light-room-warehouse-a": { scale: 0.55, color: 0xffc78a, reach: 0.85 },
    "light-room-warehouse-b": { scale: 0.5, color: 0xffc78a, reach: 0.85 },
    "light-room-archive": { scale: 0.55, color: 0xffb870, reach: 0.85 },
    "light-room-server": { scale: 0.45, color: 0xc3d0e4, reach: 0.8 },
    "light-room-break": { scale: 0.6, reach: 0.85 },
    "light-room-barracks": { scale: 0.6, reach: 0.85 },
    "light-room-armory": { scale: 0.85 },
    "light-room-yard": { scale: 0.65, reach: 0.85 },
    "light-room-hall-a": { scale: 0.6, reach: 0.85 },
    "light-room-hall-b": { scale: 0.45, reach: 0.85 },
    "light-power-room-work": { scale: 1, reach: 0.8 },
    // The room's centre lamp: a dim, yellowish bulb, a little stronger than before.
    "light-power-room-pendant": { scale: 2.4, color: 0xffc766, reach: 1.0 },
  };

/** Work lights with a loose fitting: they stutter now and then. */
export const FLICKERING = new Set([
  "light-power-room-work",
  "light-power-room-pendant",
]);

/**
 * A lamp inside a room must not light the next room through the wall (point
 * lights have no shadows): its range stops a little past the nearest wall (a
 * floodlight, which points one way, past the farthest).
 */
function keepInRoom(
  layout: ArenaLayout,
  light: LightDefinition,
  distance: number,
): number {
  const room = layout.rooms.find(
    (r) =>
      light.x > r.minX &&
      light.x < r.maxX &&
      light.z > r.minZ &&
      light.z < r.maxZ &&
      light.y > r.floorY &&
      light.y < r.floorY + 4.2,
  );

  if (!room) {
    return distance;
  }

  const walls = [
    light.x - room.minX,
    room.maxX - light.x,
    light.z - room.minZ,
    room.maxZ - light.z,
  ];
  const reach = light.target
    ? Math.max(...walls) + 0.5
    : Math.min(...walls) + 1.8;

  return Math.min(distance, Math.max(reach, 4.5));
}

/** A colour at 80% brightness. */
function dimmed(hex: number): number {
  const r = Math.round(((hex >> 16) & 255) * 0.8);
  const g = Math.round(((hex >> 8) & 255) * 0.8);
  const b = Math.round((hex & 255) * 0.8);

  return (r << 16) | (g << 8) | b;
}

/** Every light that is actually on tonight. */
export function nightLights(layout: ArenaLayout): LightDefinition[] {
  const lights: LightDefinition[] = [];

  for (const light of layout.lights) {
    if (OFF.has(light.id)) {
      continue;
    }

    const room = ROOMS[light.id];

    lights.push({
      ...light,
      intensity: light.intensity * (DIM[light.id] ?? 1) * (room?.scale ?? 1),
      color: room?.color ?? light.color,
      distance: keepInRoom(layout, light, light.distance * (room?.reach ?? 1)),
    });
  }

  const all = [
    ...lights,
    ...EXTRA_LAMPS.map((l) => ({
      ...l,
      distance: keepInRoom(layout, l, l.distance),
    })),
  ];

  // Every lamp is a little dimmer in colour; the halogens (floodlights) are a
  // little stronger so they still carry the night.
  return all.map((l) => ({
    ...l,
    color: dimmed(l.color),
    intensity: l.target ? l.intensity * 1.2 : l.intensity,
  }));
}
