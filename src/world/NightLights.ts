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
    z: -20.1,
    color: 0x4f86e8,
    intensity: 3,
    distance: 4.5,
  },
  {
    id: "halogen-wall-room-armory",
    // Bolted to the outside of the east wall over the shutter, lighting the
    // walkway and the way in.
    x: -19.84,
    y: 8.3,
    z: 8,
    // The warm yellow of the site's work halogens (the scaffold's).
    color: 0xffcf94,
    intensity: 75,
    distance: 15,
    target: { x: -18.6, y: 4.0, z: 8 },
    angle: 0.9,
    // Its beam stops at the Armory's wall: no light through it into the room.
    castShadow: true,
  },
  {
    id: "halogen-wall-spawn",
    // The spawn room's principal light: a caged halogen on a bracket bolted to
    // the yard's east wall, warm amber, aimed down at the worktable and the
    // site plan on the north wall.
    x: -21.38,
    y: 4.0,
    z: -20.8,
    color: 0xffc27a,
    intensity: 85,
    distance: 12,
    target: { x: -26.0, y: 0.8, z: -17.2 },
    angle: 0.72,
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
    id: "halogen-wall-storage",
    // Bolted to a short wall on the yard roof, beside the slanted glass cover
    // over the storage room, and turned to face it: its beam goes in through
    // the glass.
    x: -9.04,
    y: 9.3,
    z: 23,
    color: HALOGEN,
    intensity: 170,
    distance: 20,
    target: { x: -6.6, y: 6.6, z: 20.8 },
    angle: 0.75,
  },
];

/**
 * Lamps bolted to a wall, and the direction (x, z) of that wall from the lamp.
 * Each is held off the wall by a bracket (0.36 m) and has its own cable down
 * the wall.
 */
export const WALL_LAMPS: Record<string, [number, number]> = {
  "halogen-wall-storage": [-1, 0],
  // Outside the east wall, over the shutter.
  "halogen-wall-room-armory": [-1, 0],
  // On the spawn yard's east wall (the wall is toward +x).
  "halogen-wall-spawn": [1, 0],
};

/** Floodlights left off (nobody switched them on tonight). */
const OFF = new Set([
  "light-support-north-1",
  // The work lamp over the power room's generator has been taken down.
  "light-power-room-work",
]);

/** Fixtures that are on but weak, so their corner stays mostly dark. */
const DIM: Record<string, number> = {
  "light-support-south-1": 0.5,
  // The scaffold lamp lights the alley: bright enough to be seen from far up it.
  "light-site-scaffold": 2.6,
};

/**
 * How each room's own lamp is turned down for the night: a scale on its
 * intensity, a warmer or cooler colour, and a shorter reach so it stays in its
 * room (these point lights have no shadows).
 */
const ROOMS: Record<string, { scale: number; color?: number; reach?: number }> =
  {
    "light-room-warehouse-a": { scale: 0.88, color: 0xffc78a, reach: 1 },
    "light-room-warehouse-b": { scale: 0.8, color: 0xffc78a, reach: 1 },
    "bulb-junk-a": { scale: 0.88, color: 0xffb870, reach: 1 },
    "bulb-junk-b": { scale: 0.88, color: 0xffb870, reach: 1 },
    "bulb-power-a": { scale: 0.88, color: 0xffb870, reach: 1 },
    "light-room-server": { scale: 0.72, color: 0xc3d0e4, reach: 1 },
    "bulb-break-a": { scale: 0.96, reach: 1 },
    "light-room-barracks": { scale: 1.6, color: 0xffbe85, reach: 1 },
    "light-room-yard": { scale: 1.4, reach: 0.42 },
    // The scaffold lamp lights the alley; its tail is cut where it reached into rooms.
    "light-site-scaffold": { scale: 1, reach: 0.8 },
    "light-room-hall-b": { scale: 0.72, reach: 1 },
    "workshop-light-bench": { scale: 2.8, reach: 0.55 },
    "workshop-light-machines": { scale: 2.2 },
    "light-power-room-work": { scale: 1, reach: 1 },
  };

/** Work lights with a loose fitting: they stutter now and then. */
export const FLICKERING = new Set([
  "light-power-room-work",
  // The Armory's loose tube: the one fluorescent that stutters now and then.
  "tube-armory-3",
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
      light.y < r.floorY + 6.6,
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

/** The floodlights and work lamps (the halogens). */
function isHalogen(id: string): boolean {
  return id.startsWith("halogen-") || id.startsWith("light-support-");
}

/** A halogen's colour, a little further toward orange (its lens and beam follow). */
function warmed(hex: number): number {
  const amber = [0xff, 0x9a, 0x4a];
  const mix = 0.28;
  const channel = (shift: number, i: number): number =>
    Math.round(((hex >> shift) & 255) * (1 - mix) + amber[i] * mix);

  return (channel(16, 0) << 16) | (channel(8, 1) << 8) | channel(0, 2);
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
    color: dimmed(isHalogen(l.id) ? warmed(l.color) : l.color),
    intensity: l.target ? l.intensity * 1.2 : l.intensity,
  }));
}

/** The floodlight knocked over at the collapsed entrance: on two seconds, off two seconds. */
export const BLINKING_LAMP = { id: "halogen-scene-1", period: 2 } as const;
