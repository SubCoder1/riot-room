import * as THREE from "three";

import type {
  ArenaLayout,
  LightDefinition,
  RoomDefinition,
} from "./ArenaLayout";

/**
 * Room-aware lighting. A lamp with no shadow lights whatever is in its range,
 * walls or not; shadows for every lamp would cost a render pass and a texture
 * slot each. Instead the lighting shader finds out once per pixel which room
 * the pixel is inside (or beside the door of), and each lamp, tagged with the
 * room it belongs to (or "outdoors"), only lights pixels that are in its room,
 * at its room's doors, or, for an outdoor lamp, not inside any room. Each lamp's
 * test is one comparison of whole numbers: no loops, no arrays, no texture, no
 * extra pass, so it costs next to nothing however many lamps there are.
 *
 * A lamp's tag is a tiny change to its `decay` (2 plus a number of 0.0004s: a
 * few per cent dimmer far away, and nothing else reads it). The rooms' boxes
 * are constants written into the shader text, so every ordinary lit material
 * picks them up without being touched. Lights that come and go while the game
 * runs (a fire, a blast) are tagged again every frame with `dynamicDecayAt`.
 */

/** How much each region adds to a lamp's decay (so the shader can tell it which). */
const STEP = 0.0004;
/** The tag of a light that is outdoors (room -1; the tag is room + 2). */
export const OUTDOORS_DECAY = 2 + 1 * STEP;
/** The tag a moving light starts with (it is tagged again every frame). */
export const DYNAMIC_DECAY = OUTDOORS_DECAY;
/** How far a light is let through a door, each way (m). */
const PORTAL = 3.5;
/**
 * How far a room's inside begins from its bounds. The walls are centred on the
 * bounds (0.15 m each side of them), so their inside faces are 0.15 m in: the
 * inside must begin just short of that, or the walls' inner faces and the strip
 * of floor along them count as outdoors and an outdoor lamp lights them (a thin
 * bright line along every wall's foot and edges). The outer faces, 0.15 m the
 * other way, stay outside.
 */
const WALL = 0.12;
/** The Ruins' walls (the north wing's slab on its west, the pit walls) have their faces outside its room box: its regions reach out past them. */
const wallOf = (room: RoomDefinition): number =>
  room.id === "room-server" ? -0.35 : WALL;
/** Lamps whose light is meant to cross a wall (a glass cover over a room). */
const THROUGH_GLASS = new Set(["halogen-wall-storage", "halogen-roof-east"]);

interface Box {
  min: [number, number, number];
  max: [number, number, number];
}

export interface LightRegions {
  /** Each region's lamp, and the decay that marks it. */
  decays: Map<string, number>;
  /** Shader text: the constants and the function that is asked. */
  glsl: string;
}

/**
 * Rooms whose lit volume reaches below their floor: the Ruins' north half has
 * no floor and the ground is its lower level (y 0), so its lamps light that too.
 */
const LOWER_FLOOR: Record<string, number> = { "room-server": 0 };

const floorOf = (room: RoomDefinition): number =>
  LOWER_FLOOR[room.id] ?? room.floorY;

/**
 * Rooms of two levels with a floor between them: a lamp down below must not
 * light the level above through it, nor one up above the level below. A shadowless
 * lamp lights whatever faces it inside its region, solid floor or not, so such
 * a room is two regions, split at this height (the middle of its upper
 * floor's thickness: the underside of the floor belongs to the lower level,
 * its top to the upper). The Ruins: its lower floor (y 0) lies under the
 * walkway (a slab 0.5 m thick at y 3.5 to 4), and the lamps in the pit lit the
 * walls, crates and ceiling of the walkway level through it.
 */
const SPLIT_AT: Record<string, number> = { "room-server": 3.75 };

/**
 * Above this height the walkway level's roof space belongs to the lower region
 * too: a lamp hung from the roof over the opening lights the whole of the roof
 * and the walls up there, with no hard edge where the floor below begins.
 */
const HIGH_AT = 7.5;

/**
 * Where the floor between the levels is missing (open over the lower level,
 * so its lamps do light the walls and roof above there): the part of a split
 * room's upper level that belongs to the lower region. The Ruins' walkway
 * floor has broken away north of z -17.4 (every slice ends south of it).
 */
const OPEN_ABOVE: Record<string, { minZ: number; maxZ: number }> = {
  "room-server": { minZ: -24, maxZ: -17.4 },
};

/** Where a room's ceiling is: the top of its tallest wall. */
function ceilingOf(layout: ArenaLayout, room: RoomDefinition): number {
  let top = room.floorY + 3.8;

  for (const wall of layout.walls) {
    if (wall.id.startsWith(`${room.id}-wall`)) {
      top = Math.max(top, wall.height);
    }
  }

  return Math.min(top, room.floorY + 8);
}

/** The inside of a room: what its lamp may light (its lower level, if it is split). */
function inside(layout: ArenaLayout, room: RoomDefinition): Box {
  const split = SPLIT_AT[room.id];

  return {
    min: [
      room.minX + wallOf(room),
      floorOf(room) - 0.05,
      room.minZ + wallOf(room),
    ],
    max: [
      room.maxX - wallOf(room),
      split ?? ceilingOf(layout, room) + 0.02,
      room.maxZ - wallOf(room),
    ],
  };
}

/** The upper level of a split room: over its floor, and over the opening in it. */
function upperInside(
  layout: ArenaLayout,
  room: RoomDefinition,
): { over: Box; open: Box | null; high: Box } {
  const open = OPEN_ABOVE[room.id];
  const top = ceilingOf(layout, room) + 0.02;
  const minZ = room.minZ + wallOf(room);
  const maxZ = room.maxZ - wallOf(room);

  return {
    over: {
      min: [
        room.minX + wallOf(room),
        SPLIT_AT[room.id],
        open ? open.maxZ : minZ,
      ],
      max: [room.maxX - wallOf(room), Math.min(top, HIGH_AT), maxZ],
    },
    open: open
      ? {
          min: [
            room.minX + wallOf(room),
            SPLIT_AT[room.id],
            Math.max(open.minZ, minZ),
          ],
          max: [room.maxX - wallOf(room), top, open.maxZ],
        }
      : null,
    high: {
      min: [room.minX + wallOf(room), HIGH_AT, minZ],
      max: [room.maxX - wallOf(room), top, maxZ],
    },
  };
}

/** The light that goes through each of a room's doors, both ways. */
function portals(room: RoomDefinition): Box[] {
  return room.doors.map((door) => {
    const half = door.width / 2 + 0.2;
    const y: [number, number] = [room.floorY - 0.05, room.floorY + 3.6];

    if (door.side === "e" || door.side === "w") {
      const x = door.side === "e" ? room.maxX : room.minX;

      return {
        min: [x - PORTAL, y[0], door.at - half],
        max: [x + PORTAL, y[1], door.at + half],
      };
    }

    const z = door.side === "n" ? room.minZ : room.maxZ;

    return {
      min: [door.at - half, y[0], z - PORTAL],
      max: [door.at + half, y[1], z + PORTAL],
    };
  });
}

const f = (n: number): string => n.toFixed(3);
const vec = (v: readonly number[]): string => `vec3(${v.map(f).join(", ")})`;
const list = (items: Box[], pick: "min" | "max"): string =>
  items.map((b) => vec(b[pick])).join(", ");

/** The distance from a point to a box (0 inside it). */
function distanceTo(box: Box, x: number, y: number, z: number): number {
  return Math.hypot(
    Math.max(box.min[0] - x, 0, x - box.max[0]),
    Math.max(box.min[1] - y, 0, y - box.max[1]),
    Math.max(box.min[2] - z, 0, z - box.max[2]),
  );
}

/** Every room's inside, in layout order, once the regions are built. */
let dynamicRooms: Box[] = [];
/** The region each of those boxes belongs to. */
let dynamicIds: number[] = [];

/**
 * The tag for a light at (x, y, z) that moves (a fire, a blast): the room it is
 * in, or outdoors (a fire in an alley does not light the room beside it).
 */
export function dynamicDecayAt(x: number, y: number, z: number): number {
  for (let r = 0; r < dynamicRooms.length; r++) {
    if (distanceTo(dynamicRooms[r], x, y, z) === 0) {
      return 2 + (dynamicIds[r] + 2) * STEP;
    }
  }

  return OUTDOORS_DECAY;
}

/** Works out each lamp's tag and writes the shader text for the rooms. */
export function buildLightRegions(
  layout: ArenaLayout,
  lights: readonly LightDefinition[],
): LightRegions {
  const decays = new Map<string, number>();
  const rooms = layout.rooms.map((r) => inside(layout, r));
  // Which region each box belongs to (a room's own box is its own region).
  const regionOf: number[] = rooms.map((_, i) => i);
  // The upper level of each split room is a region of its own, after the
  // rooms; the part of it over the opening in the floor between the levels
  // belongs to the lower region.
  const upper = new Map<number, number>();

  layout.rooms.forEach((r, i) => {
    if (SPLIT_AT[r.id] !== undefined) {
      const levels = upperInside(layout, r);

      upper.set(i, rooms.length);
      rooms.push(levels.over);
      regionOf.push(rooms.length - 1);

      // (The roof space belongs to the walkway level: a fire on it lights the
      // walls up to the roof, and the roof's own lamps light both levels.)
      rooms.push(levels.high);
      regionOf.push(upper.get(i) as number);

      if (levels.open) {
        rooms.push(levels.open);
        regionOf.push(i);
      }
    }
  });

  const doorBoxes: Box[] = [];
  const doorRoom: number[] = [];

  layout.rooms.forEach((r, i) => {
    for (const box of portals(r)) {
      doorBoxes.push(box);
      // (A split room's doors are on its upper level.)
      doorRoom.push(upper.get(i) ?? i);
    }
  });

  dynamicRooms = rooms;
  dynamicIds = regionOf;

  for (const light of lights) {
    if (light.castShadow === true || THROUGH_GLASS.has(light.id)) {
      continue;
    }

    let home = layout.rooms.findIndex(
      (r) =>
        light.x > r.minX &&
        light.x < r.maxX &&
        light.z > r.minZ &&
        light.z < r.maxZ &&
        light.y > floorOf(r) &&
        light.y < ceilingOf(layout, r),
    );

    // A lamp in the upper level of a split room lights that level only.
    if (
      home >= 0 &&
      upper.has(home) &&
      light.y >= SPLIT_AT[layout.rooms[home].id] &&
      // (A lamp over the opening in the floor lights the lower level too.)
      !(
        OPEN_ABOVE[layout.rooms[home].id] &&
        light.z < OPEN_ABOVE[layout.rooms[home].id].maxZ
      )
    ) {
      home = upper.get(home) as number;
    }

    decays.set(light.id, home >= 0 ? 2 + (home + 2) * STEP : OUTDOORS_DECAY);
  }

  const rn = Math.max(rooms.length, 1);
  // Rooms that are open to the sky (the lightning's sky light may reach them);
  // in every other room it is kept out, so a flash cannot show at a corner.
  const OPEN_SKY = new Set(["room-spawn-nw", "room-hall", "room-server"]);
  // How much of the hemisphere (ambient) light each region gets, per colour: a
  // deep underground chamber gets a fifth of it and none of its blue, so the
  // red tubes are what is seen and the shadows are black, not blue.
  const ambList =
    rooms
      .map((_, r) =>
        layout.rooms[r]?.id === "room-ruins-chamber"
          ? "vec3( 0.3, 0.17, 0.15 )"
          : "vec3( 1.0 )",
      )
      .join(", ") || "vec3( 1.0 )";
  const skyList =
    rooms
      .map((_, r) => {
        const own = layout.rooms.findIndex(
          (room, i) => i === r && OPEN_SKY.has(room.id),
        );

        return own >= 0 ? 1 : 0;
      })
      .join(", ") || "0";
  const dn = Math.max(doorBoxes.length, 1);
  const rl = (items: Box[], pick: "min" | "max"): string =>
    items.length ? list(items, pick) : "vec3(0.0)";

  // For each region: the upper region of the same room (or -1). A lamp hung
  // from the roof (above 8 m) lights both levels of its room, so no edge shows.
  const upList = rooms.map((_, r) => upper.get(r) ?? -1).join(", ") || "-1";

  const glsl = /* glsl */ `
    const int LR_ROOMS = ${rooms.length};
    const int LR_DOORS = ${doorBoxes.length};
    const vec3 RM_MIN[${rn}] = vec3[${rn}](${rl(rooms, "min")});
    const vec3 RM_MAX[${rn}] = vec3[${rn}](${rl(rooms, "max")});
    const vec3 AMB[${rn}] = vec3[${rn}](${ambList});
    const int SKY_OK[${rn}] = int[${rn}](${skyList});
    const int UP_OF[${rn}] = int[${rn}](${upList});
    const int RM_ID[${rn}] = int[${rn}](${regionOf.length ? regionOf.join(", ") : "0"});
    const vec3 DR_MIN[${dn}] = vec3[${dn}](${rl(doorBoxes, "min")});
    const vec3 DR_MAX[${dn}] = vec3[${dn}](${rl(doorBoxes, "max")});
    const int DR_ROOM[${dn}] = int[${dn}](${doorRoom.length ? doorRoom.join(", ") : "0"});

    // Once per pixel: the room it is inside (-1 if none), and the room whose
    // door it is beside (-1 if none).
    vec3 lrWorld;
    void lrLocate( vec3 viewPosition, out int inRoom, out int atDoor ) {
      vec3 p = ( ( vec4( viewPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
      lrWorld = p;

      inRoom = -1;
      atDoor = -1;

      for ( int r = 0; r < LR_ROOMS; r ++ ) {
        if ( all( greaterThanEqual( p, RM_MIN[ r ] ) ) && all( lessThanEqual( p, RM_MAX[ r ] ) ) ) {
          inRoom = RM_ID[ r ];
          break;
        }
      }

      for ( int k = 0; k < LR_DOORS; k ++ ) {
        if ( all( greaterThanEqual( p, DR_MIN[ k ] ) ) && all( lessThanEqual( p, DR_MAX[ k ] ) ) ) {
          atDoor = DR_ROOM[ k ];
          break;
        }
      }
    }

    // The sky light: 1 outdoors and in rooms open to the sky, 0 in a roofed room.
    vec3 lrAmbient( int inRoom ) {
      return inRoom < 0 ? vec3( 1.0 ) : AMB[ inRoom ];
    }

    float lrSky( int inRoom ) {
      return ( inRoom < 0 || SKY_OK[ inRoom ] == 1 ) ? 1.0 : 0.0;
    }

    // Per lamp: 1 where it may light the pixel, 0 where not. The lamp's tag
    // is its room plus 2 (outdoors is 1); an ordinary light has none.
    float lrAllow( float decay, int inRoom, int atDoor, vec3 lampView ) {
      int tag = int( floor( ( decay - 2.0 ) / ${STEP} + 0.5 ) );
      int room = tag - 2;
      // (An outdoor lamp has no room: "no door here" must not count as its
      // room, or it would light every interior away from the doors.)
      float roofY = ( ( vec4( lampView, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).y;
      bool both = room >= 0 && roofY > 8.0 && inRoom >= 0 && UP_OF[ room ] == inRoom;
      bool ok = tag <= 0 || both || inRoom == room || ( room >= 0 && atDoor == room ) || ( room < 0 && atDoor >= 0 && atDoor == inRoom );

      // A lamp above a deck must not light the ground under it (nor one below
      // light the deck above), whatever its region: the decks are 4 m up, round
      // the open middle of the map (x -18 to 18, z -12 to 12), and a lamp with
      // no shadows (or the roof floodlights that shine through glass) ignores them.
      // (A lamp in a room of the ground floor, or the fires, are below 3.8 m.)
      if ( ok && ( tag <= 0 || room < 0 ) ) {
        float lampY = ( ( vec4( lampView, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).y;
        // (A lamp on the decks, 4 to 12 m up, never lights the ground at all,
        // the open middle included; the tall roof floodlights still do.)
        bool deckLamp = lampY > 4.1 && lampY < 12.0;
        bool under = deckLamp || abs( lrWorld.x ) > 18.0 || abs( lrWorld.z ) > 12.0;

        if ( under && ( ( lrWorld.y < 3.9 && lampY > 4.1 ) || ( lrWorld.y > 3.9 && lampY < 3.8 ) ) ) {
          ok = false;
        }
      }

      return ok ? 1.0 : 0.0;
    }
  `;

  return { decays, glsl };
}

const originals: { pars?: string; begin?: string } = {};

/**
 * Writes the regions into the lighting shader chunks every lit material shares.
 * Do it before anything is first drawn (a program is built from the chunks
 * once); doing it again replaces the regions.
 */
export function installLightRegions(glsl: string): void {
  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;

  originals.pars ??= chunks.lights_pars_begin;
  originals.begin ??= chunks.lights_fragment_begin;

  chunks.lights_pars_begin = `${originals.pars}
${glsl}`;

  let begin = originals.begin;
  const locate = "vec3 geometryPosition = - vViewPosition;";

  if (begin.includes(locate)) {
    begin = begin.replace(
      locate,
      `${locate}
	int lrInRoom;
	int lrAtDoor;
	lrLocate( geometryPosition, lrInRoom, lrAtDoor );`,
    );
  }

  const hemi =
    "irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );";

  if (begin.includes(hemi)) {
    begin = begin.replace(
      hemi,
      "irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal ) * lrAmbient( lrInRoom );",
    );
  }

  const sky = "getDirectionalLightInfo( directionalLight, directLight );";

  if (begin.includes(sky)) {
    begin = begin.replace(
      sky,
      `${sky}
		directLight.color *= lrSky( lrInRoom );`,
    );
  }

  for (const [info, light] of [
    [
      "getPointLightInfo( pointLight, geometryPosition, directLight );",
      "pointLight",
    ],
    [
      "getSpotLightInfo( spotLight, geometryPosition, directLight );",
      "spotLight",
    ],
  ] as const) {
    if (begin.includes(info)) {
      begin = begin.replace(
        info,
        `${info}
		directLight.color *= lrAllow( ${light}.decay, lrInRoom, lrAtDoor, ${light}.position );`,
      );
    }
  }

  chunks.lights_fragment_begin = begin;
}
