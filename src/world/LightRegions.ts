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
/** How far the walls' inside faces are from a room's bounds (the walls stand inside them). */
const WALL = 0.27;
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

/** The inside of a room: what its lamp may light. */
function inside(layout: ArenaLayout, room: RoomDefinition): Box {
  return {
    min: [room.minX + WALL, room.floorY - 0.05, room.minZ + WALL],
    max: [room.maxX - WALL, ceilingOf(layout, room) + 0.02, room.maxZ - WALL],
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

/**
 * The tag for a light at (x, y, z) that moves (a fire, a blast): the room it is
 * in, or outdoors (a fire in an alley does not light the room beside it).
 */
export function dynamicDecayAt(x: number, y: number, z: number): number {
  for (let r = 0; r < dynamicRooms.length; r++) {
    if (distanceTo(dynamicRooms[r], x, y, z) === 0) {
      return 2 + (r + 2) * STEP;
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
  const doorBoxes: Box[] = [];
  const doorRoom: number[] = [];

  layout.rooms.forEach((r, i) => {
    for (const box of portals(r)) {
      doorBoxes.push(box);
      doorRoom.push(i);
    }
  });

  dynamicRooms = rooms;

  for (const light of lights) {
    if (light.castShadow === true || THROUGH_GLASS.has(light.id)) {
      continue;
    }

    const home = layout.rooms.findIndex(
      (r) =>
        light.x > r.minX &&
        light.x < r.maxX &&
        light.z > r.minZ &&
        light.z < r.maxZ &&
        light.y > r.floorY &&
        light.y < ceilingOf(layout, r),
    );

    decays.set(light.id, home >= 0 ? 2 + (home + 2) * STEP : OUTDOORS_DECAY);
  }

  const rn = Math.max(rooms.length, 1);
  const dn = Math.max(doorBoxes.length, 1);
  const rl = (items: Box[], pick: "min" | "max"): string =>
    items.length ? list(items, pick) : "vec3(0.0)";

  const glsl = /* glsl */ `
    const int LR_ROOMS = ${rooms.length};
    const int LR_DOORS = ${doorBoxes.length};
    const vec3 RM_MIN[${rn}] = vec3[${rn}](${rl(rooms, "min")});
    const vec3 RM_MAX[${rn}] = vec3[${rn}](${rl(rooms, "max")});
    const vec3 DR_MIN[${dn}] = vec3[${dn}](${rl(doorBoxes, "min")});
    const vec3 DR_MAX[${dn}] = vec3[${dn}](${rl(doorBoxes, "max")});
    const int DR_ROOM[${dn}] = int[${dn}](${doorRoom.length ? doorRoom.join(", ") : "0"});

    // Once per pixel: the room it is inside (-1 if none), and the room whose
    // door it is beside (-1 if none).
    void lrLocate( vec3 viewPosition, out int inRoom, out int atDoor ) {
      vec3 p = ( ( vec4( viewPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;

      inRoom = -1;
      atDoor = -1;

      for ( int r = 0; r < LR_ROOMS; r ++ ) {
        if ( all( greaterThanEqual( p, RM_MIN[ r ] ) ) && all( lessThanEqual( p, RM_MAX[ r ] ) ) ) {
          inRoom = r;
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

    // Per lamp: 1 where it may light the pixel, 0 where not. The lamp's tag
    // is its room plus 2 (outdoors is 1); an ordinary light has none.
    float lrAllow( float decay, int inRoom, int atDoor ) {
      int tag = int( floor( ( decay - 2.0 ) / ${STEP} + 0.5 ) );

      if ( tag <= 0 ) {
        return 1.0;
      }

      int room = tag - 2;
      // (An outdoor lamp has no room: "no door here" must not count as its
      // room, or it would light every interior away from the doors.)
      bool ok = inRoom == room || ( room >= 0 && atDoor == room ) || ( room < 0 && atDoor >= 0 && atDoor == inRoom );

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
		directLight.color *= lrAllow( ${light}.decay, lrInRoom, lrAtDoor );`,
      );
    }
  }

  chunks.lights_fragment_begin = begin;
}
