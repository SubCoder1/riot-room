import {
  ARENA_DEPTH,
  ARENA_HALF_X,
  ARENA_HALF_Z,
  ARENA_WIDTH,
  ROOF_HIGH,
  ROOF_LOW,
  ROOF_MID,
  ROOF_THICKNESS,
  UPPER_FLOOR_Y,
  spawn,
  type ArenaLayout,
} from "./ArenaLayout";
import { MapBuilder, bounds } from "./MapParts";

/**
 * STAGE ONE OF THE MAP, REVISED: THE UPPER FLOOR AND THE ROOFS
 * (north is -z, east is +x).
 *
 * A 64 x 48 m enclosed industrial complex. A dense ring of rooms, corridors,
 * walkways, balconies and covered yards surrounds a central open arena
 * (x -18..18, z -12..12) that every side looks down into. The upper floor is
 * 4 m up. Above it are three roof layers (8.1, 9.3 and 10.8 m) that can be
 * walked on, reached by ladders and by short climbable ledges. The ground level
 * is deliberately not designed yet: the arena is bare floor.
 *
 * Routes up, from easiest to hardest to find:
 *   - two public staircases (south-west and north-east),
 *   - five ladders on the arena faces and balconies,
 *   - three ladders to the roofs from the walkways,
 *   - six secret ladders in nooks (still usable by anyone),
 *   - low ledges (1.2 m, a jump) and ledge chains (2.4 m, a climb later),
 *   - the roof network: every roof can be reached from another.
 *
 * Measurements follow the character: a doorway is 2 m wide, a railing is 1.1 m
 * (drawn low to shoot over, but nobody jumps over it), a ledge of 1.2 m can be jumped onto,
 * steps are 0.2-0.25 m, a body needs 1.8 m of headroom. Two solids are either
 * touching or at least 1.4 m apart, so nobody can get wedged between them.
 *
 * Collision is a height field with undersides: balconies, roofs and catwalks
 * float, so the ground beneath them stays open for the next stage.
 */
const F = UPPER_FLOOR_Y;
/** The lower balcony and the maintenance platform: 1.2 m under the upper floor. */
const LOW = 2.8;
/** The north-west balcony: 1.2 m above the upper floor. */
const HIGH_BALCONY = 5.2;
/** Wall heights so each room's roof lands on a roof layer. */
const WALL_TO_MID = ROOF_MID - ROOF_THICKNESS - F;
const WALL_TO_HIGH = ROOF_HIGH - ROOF_THICKNESS - F;

function createUpperFloor(): ArenaLayout {
  const map = new MapBuilder(ARENA_WIDTH, ARENA_DEPTH);
  const X = ARENA_HALF_X;
  const Z = ARENA_HALF_Z;

  // --------------------------------------------------------------- floors
  map.createFloorSection("north-wing", bounds(-X, X, -Z, -12), F);
  map.createFloorSection("south-wing", bounds(-X, X, 12, Z), F);
  map.createFloorSection("west-wing", bounds(-X, -18, -12, 12), F);
  map.createFloorSection("east-wing", bounds(18, X, -12, 12), F);

  // ------------------------------------------------------------- walkways
  // Four widths: a wide east side, medium north and south, a narrower west
  // end, and a 1.5 m service corridor.
  map.createWalkway(
    "walk-north",
    "North walkway",
    bounds(-21, 22, -15, -12),
    F,
  );
  map.createWalkway(
    "walk-east",
    "East walkway (wide)",
    bounds(18, 22, -12, 12),
    F,
  );
  map.createWalkway("walk-south", "South walkway", bounds(-18, 18, 12, 15), F);
  map.createWalkway("walk-west", "West walkway", bounds(-21, -18, -12, 5), F);
  map.createWalkway(
    "walk-west-south",
    "West walkway (narrow)",
    bounds(-20.2, -18, 5, 12),
    F,
  );
  // Its walls are the Control room's and the Barracks'.
  map.createCorridor(
    "corridor-nw",
    "North-west service corridor",
    bounds(-X, -21, -13.5, -12),
    F,
    "x",
    { roof: false, walled: false },
  );

  // ------------------------------------------------- open decks and yards
  map.createDeck(
    "deck-dock",
    "Loading dock (covered yard)",
    bounds(7, 22, -24, -12),
    F,
  );
  map.createDeck(
    "deck-east",
    "East deck (open court)",
    bounds(22, X, -5, 3),
    F,
  );
  map.createDeck(
    "deck-south",
    "South plaza (covered yard)",
    bounds(-9, 6, 15, Z),
    F,
  );
  map.createDeck(
    "deck-west",
    "West terrace (open court)",
    bounds(-X, -22, -3, 5),
    F,
  );
  map.createRecess(
    "recess-north",
    "North alcove (recessed, roofed)",
    bounds(-21, -14, -24, -12),
    F,
  );

  // ----------------------------------------------------------- balconies
  // 1. North overlook: wide, 4.5 m out over the arena, with cover. Floating.
  map.createBalcony(
    "balcony-north",
    "North overlook (wide)",
    bounds(-7, 5, -12, -7.5),
    F,
    "balcony",
    true,
  );
  // 2. South balcony: lower, narrow; climb the 1.2 m ledge back to the floor.
  map.createBalcony(
    "balcony-south",
    "South balcony (lower)",
    bounds(-5, 5, 9, 12),
    LOW,
    "balcony",
    true,
  );
  map.declareLedge("ledge-south-balcony", bounds(-5, 5, 12, 12), LOW, F);
  // 3. East corner balcony: joins the east and the south walkways.
  map.createBalcony(
    "balcony-east",
    "East corner balcony",
    bounds(11, 18, 7.8, 12),
    F,
    "balcony",
    true,
  );
  // 4. North-west balcony: raised 1.2 m, narrow and long, reached by a ledge.
  map.createBalcony(
    "balcony-nw",
    "North-west balcony (raised)",
    bounds(-18, -9.8, -12, -9.6),
    HIGH_BALCONY,
    "balcony",
    true,
  );
  map.declareLedge(
    "ledge-nw-west",
    bounds(-18, -18, -12, -9.6),
    F,
    HIGH_BALCONY,
  );
  map.declareLedge(
    "ledge-nw-north",
    bounds(-18, -9.8, -12, -12),
    F,
    HIGH_BALCONY,
  );
  // A maintenance platform under the north edge: ground, ladder, platform,
  // ledge, walkway.
  map.createBalcony(
    "platform-maintenance",
    "Maintenance platform",
    bounds(7.5, 12.5, -12, -10.3),
    LOW,
    "balcony",
    true,
  );
  map.declareLedge("ledge-maintenance", bounds(7.5, 12.5, -12, -12), LOW, F);
  // Landings at the top of each staircase (solid: they stand on the stair mass).
  map.createBalcony(
    "landing-sw",
    "South-west landing",
    bounds(-18, -14, -7.2, -3.2),
    F,
    "landing",
  );
  map.createBalcony(
    "landing-ne",
    "North-east landing",
    bounds(13, 18, 2.4, 6.2),
    F,
    "landing",
  );

  // ------------------------------------------------------------ staircases
  // Bottom-left: starts at the south end of the arena's west side, climbs north.
  map.createStaircase({
    id: "stairs-sw",
    start: 9.6,
    direction: "-z",
    crossMin: -18,
    crossMax: -14,
    steps: 16,
    rise: 0.25,
    tread: 0.8,
  });
  // Top-right: starts at the north end of the arena's east side, climbs south.
  map.createStaircase({
    id: "stairs-ne",
    start: -9.6,
    direction: "+z",
    crossMin: 13,
    crossMax: 18,
    steps: 20,
    rise: 0.2,
    tread: 0.6,
  });

  // --------------------------------------------------------------- ladders
  // Added before the railings, which leave an opening where a ladder tops out.
  // On the arena faces and balconies (easy to see):
  map.createLadder({
    id: "ladder-north",
    normal: "+z",
    face: -12,
    along: -9,
    topY: F,
  });
  map.createLadder({
    id: "ladder-south",
    normal: "-z",
    face: 12,
    along: 8,
    topY: F,
  });
  map.createLadder({
    id: "ladder-west",
    normal: "+x",
    face: -18,
    along: -8.8,
    topY: F,
  });
  map.createLadder({
    id: "ladder-east-balcony",
    normal: "-x",
    face: 11,
    along: 10,
    topY: F,
  });
  map.createLadder({
    id: "ladder-north-balcony",
    normal: "+z",
    face: -7.5,
    along: 3.5,
    topY: F,
  });
  // To the roofs, from the walkways:
  map.createLadder({
    id: "ladder-roof-east",
    normal: "-x",
    face: 22,
    along: -6,
    bottomY: F,
    topY: ROOF_LOW,
  });
  map.createLadder({
    id: "ladder-roof-south",
    normal: "-z",
    face: 15,
    along: 8.5,
    bottomY: F,
    topY: ROOF_LOW,
  });
  map.createLadder({
    id: "ladder-roof-warehouse",
    normal: "-x",
    face: 18,
    along: 15,
    bottomY: ROOF_LOW,
    topY: ROOF_HIGH,
  });
  // From the alcove roof up to the Control room's taller roof, through the gap
  // left for it in the roof wall (this replaces the way up that used to be a
  // hole above the room's door).
  map.createLadder({
    id: "ladder-roof-control",
    normal: "+x",
    face: -21,
    along: -17.2,
    bottomY: ROOF_LOW,
    topY: ROOF_MID,
  });
  // Secret or semi-hidden (still usable by anyone):
  map.createLadder({
    id: "secret-alcove",
    normal: "-x",
    face: -14,
    along: -23,
    bottomY: F,
    topY: ROOF_LOW,
    secret: true,
  });
  map.createLadder({
    id: "secret-corridor",
    normal: "-z",
    face: -12,
    along: -23.5,
    bottomY: F,
    topY: ROOF_LOW,
    secret: true,
  });
  map.createLadder({
    id: "secret-plaza",
    normal: "+x",
    face: -9,
    along: 22.8,
    bottomY: F,
    topY: ROOF_LOW,
    secret: true,
  });
  map.createLadder({
    id: "secret-terrace",
    normal: "-z",
    face: 5,
    along: -29,
    bottomY: F,
    topY: ROOF_LOW,
    secret: true,
  });
  map.createLadder({
    id: "secret-rooftop",
    normal: "+z",
    face: -12,
    along: 30.5,
    bottomY: ROOF_LOW,
    topY: ROOF_HIGH,
    secret: true,
  });
  map.createLadder({
    id: "secret-maintenance",
    normal: "+z",
    face: -10.3,
    along: 10,
    topY: LOW,
    secret: true,
  });

  // -------------------------------------------------------------- railings
  // The edges of the upper floor that look into the arena.
  map.createRailing({
    id: "rail-edge-north",
    axis: "x",
    at: -12,
    from: -18,
    to: 18,
    floorY: F,
    inside: -1,
    gaps: [
      { from: -18, to: -9.8 },
      { from: -7, to: 5 },
      { from: 7.5, to: 12.5 },
    ],
  });
  map.createRailing({
    id: "rail-edge-south",
    axis: "x",
    at: 12,
    from: -18,
    to: 18,
    floorY: F,
    inside: 1,
    gaps: [
      { from: -3, to: 3 },
      { from: 11, to: 18 },
    ],
  });
  map.createRailing({
    id: "rail-edge-west",
    axis: "z",
    at: -18,
    from: -12,
    to: 12,
    floorY: F,
    inside: -1,
    gaps: [
      { from: -12, to: -9.6 },
      { from: -7.2, to: -3.2 },
    ],
  });
  map.createRailing({
    id: "rail-edge-east",
    axis: "z",
    at: 18,
    from: -12,
    to: 12,
    floorY: F,
    inside: 1,
    gaps: [
      { from: 2.4, to: 6.2 },
      { from: 7.8, to: 12 },
    ],
  });
  // North overlook.
  map.createRailing({
    id: "rail-bn-front",
    axis: "x",
    at: -7.5,
    from: -7,
    to: 5,
    floorY: F,
    inside: -1,
  });
  map.createRailing({
    id: "rail-bn-west",
    axis: "z",
    at: -7,
    from: -12,
    to: -7.5,
    floorY: F,
    inside: 1,
  });
  map.createRailing({
    id: "rail-bn-east",
    axis: "z",
    at: 5,
    from: -12,
    to: -7.5,
    floorY: F,
    inside: -1,
  });
  // South balcony.
  map.createRailing({
    id: "rail-bs-front",
    axis: "x",
    at: 9,
    from: -5,
    to: 5,
    floorY: LOW,
    inside: 1,
  });
  map.createRailing({
    id: "rail-bs-west",
    axis: "z",
    at: -5,
    from: 9,
    to: 12,
    floorY: LOW,
    inside: 1,
  });
  map.createRailing({
    id: "rail-bs-east",
    axis: "z",
    at: 5,
    from: 9,
    to: 12,
    floorY: LOW,
    inside: -1,
  });
  // East corner balcony: only the two sides that face the open arena.
  map.createRailing({
    id: "rail-be-front",
    axis: "z",
    at: 11,
    from: 7.8,
    to: 12,
    floorY: F,
    inside: 1,
  });
  map.createRailing({
    id: "rail-be-north",
    axis: "x",
    at: 7.8,
    from: 11,
    to: 18,
    floorY: F,
    inside: 1,
  });
  // North-west balcony: the front and the east end.
  map.createRailing({
    id: "rail-bw-front",
    axis: "x",
    at: -9.6,
    from: -18,
    to: -9.8,
    floorY: HIGH_BALCONY,
    inside: -1,
  });
  map.createRailing({
    id: "rail-bw-east",
    axis: "z",
    at: -9.8,
    from: -12,
    to: -9.6,
    floorY: HIGH_BALCONY,
    inside: -1,
  });
  // Maintenance platform.
  map.createRailing({
    id: "rail-mp-front",
    axis: "x",
    at: -10.3,
    from: 7.5,
    to: 12.5,
    floorY: LOW,
    inside: -1,
  });
  map.createRailing({
    id: "rail-mp-west",
    axis: "z",
    at: 7.5,
    from: -12,
    to: -10.3,
    floorY: LOW,
    inside: 1,
  });
  map.createRailing({
    id: "rail-mp-east",
    axis: "z",
    at: 12.5,
    from: -12,
    to: -10.3,
    floorY: LOW,
    inside: -1,
  });
  // Landings.
  map.createRailing({
    id: "rail-sw-landing-east",
    axis: "z",
    at: -14,
    from: -7.2,
    to: -3.2,
    floorY: F,
    inside: -1,
  });
  map.createRailing({
    id: "rail-sw-landing-north",
    axis: "x",
    at: -7.2,
    from: -18,
    to: -14,
    floorY: F,
    inside: 1,
  });
  map.createRailing({
    id: "rail-ne-landing-west",
    axis: "z",
    at: 13,
    from: 2.4,
    to: 6.2,
    floorY: F,
    inside: 1,
  });
  map.createRailing({
    id: "rail-ne-landing-south",
    axis: "x",
    at: 6.2,
    from: 13,
    to: 18,
    floorY: F,
    inside: -1,
  });

  // ----------------------------------------------------------------- rooms
  // NORTH SIDE, west to east.
  map.createRoom({
    id: "room-control",
    name: "Control room (large, raised roof)",
    bounds: bounds(-X, -21, -Z, -13.5),
    floorY: F,
    wallHeight: WALL_TO_MID,
    doors: [
      { side: "e", at: -19.5 },
      { side: "s", at: -26.5 },
    ],
  });
  map.createRoom({
    id: "room-archive",
    name: "Archive (shelf aisles)",
    bounds: bounds(-14, -1, -Z, -16),
    floorY: F,
    doors: [
      { side: "s", at: -8 },
      { side: "w", at: -21 },
      { side: "e", at: -20 },
    ],
  });
  map.createRoom({
    id: "room-switch",
    name: "Switch room (switchgear)",
    bounds: bounds(-1, 7, -Z, -17),
    floorY: F,
    walls: ["n", "s", "e"],
    doors: [
      { side: "s", at: 3 },
      { side: "e", at: -20.5 },
    ],
  });
  map.createRoom({
    id: "room-cargo",
    name: "Cargo office (crate lanes, high roof)",
    bounds: bounds(22, X, -Z, -12),
    floorY: F,
    wallHeight: WALL_TO_HIGH,
    doors: [
      { side: "w", at: -18 },
      { side: "s", at: 27 },
    ],
  });

  // EAST SIDE.
  map.createRoom({
    id: "room-server",
    name: "Server room (rack lanes)",
    bounds: bounds(22, X, -12, -5),
    floorY: F,
    walls: ["s", "e", "w"],
    doors: [{ side: "w", at: -8 }],
  });
  map.createRoom({
    id: "room-break",
    name: "Break room",
    bounds: bounds(22, X, 3, 12),
    floorY: F,
    walls: ["n", "e", "w"],
    doors: [
      { side: "w", at: 7.5 },
      { side: "n", at: 25 },
    ],
  });

  // SOUTH SIDE, east to west.
  map.createRoom({
    id: "room-warehouse",
    name: "Warehouse (crate stacks, high roof)",
    bounds: bounds(18, X, 12, Z),
    floorY: F,
    wallHeight: WALL_TO_HIGH,
    doors: [
      { side: "n", at: 20 },
      { side: "n", at: 27 },
      { side: "w", at: 19.5 },
    ],
  });
  map.createRoom({
    id: "room-workshop",
    name: "Workshop (benches and machines)",
    bounds: bounds(6, 18, 15, Z),
    floorY: F,
    walls: ["n", "s", "w"],
    doors: [
      { side: "n", at: 11.5 },
      { side: "w", at: 21 },
    ],
  });
  map.createRoom({
    id: "room-store",
    name: "Store (shelving)",
    bounds: bounds(-18, -9, 15, Z),
    floorY: F,
    walls: ["n", "s", "e"],
    doors: [
      { side: "n", at: -13 },
      { side: "e", at: 21 },
    ],
  });
  map.createRoom({
    id: "room-hall",
    name: "Hall (columns and a podium)",
    bounds: bounds(-X, -18, 12, Z),
    floorY: F,
    doors: [
      { side: "n", at: -26 },
      { side: "n", at: -19 },
      { side: "e", at: 13.5 },
      { side: "e", at: 19.5 },
    ],
  });

  // WEST SIDE.
  map.createRoom({
    id: "room-barracks",
    name: "Barracks (bunks and lockers)",
    bounds: bounds(-X, -21, -12, -3),
    floorY: F,
    doors: [
      { side: "e", at: -7 },
      { side: "n", at: -28 },
    ],
  });
  map.createRoom({
    id: "room-armory",
    name: "Armory (racks and a cage)",
    bounds: bounds(-X, -20.2, 5, 12),
    floorY: F,
    walls: ["n", "e", "w"],
    doors: [{ side: "e", at: 8 }],
  });

  // Partial cover on the balconies.
  map.createIndustrialProp("crate", "cover-overlook-a", -4, -9.7, F);
  map.createIndustrialProp("crate", "cover-overlook-b", 1.2, -9.7, F);
  map.createIndustrialProp("crate", "cover-corner-balcony", 13.5, 10.8, F);

  // ---------------------------------------------------------- room props
  const prop = map.createIndustrialProp.bind(map);

  // Control room: a raised console dais in the middle, monitor banks on the wall.
  map.createFloorSection(
    "dais-control",
    bounds(-29.5, -24.5, -21.2, -17.8),
    F + 0.4,
  );
  prop("console", "console-control-a", -28, -20.4, F + 0.4);
  prop("console", "console-control-b", -26.6, -20.4, F + 0.4);
  prop("console", "monitors-control-a", -29.2, -23.35, F, "x", {
    width: 2.2,
    depth: 0.7,
    height: 1.1,
  });
  prop("console", "monitors-control-b", -24.8, -23.35, F, "x", {
    width: 2.2,
    depth: 0.7,
    height: 1.1,
  });

  // Archive: shelf aisles with gaps to cross.
  [
    [-11.6, -8.6, -21.8],
    [-6.8, -3.2, -21.8],
    [-12.1, -9.6, -19.2],
    [-5.8, -3.0, -19.2],
  ].forEach(([x0, x1, z], i) => {
    prop("shelf", `shelf-archive-${i + 1}`, (x0 + x1) / 2, z, F, "x", {
      width: x1 - x0,
    });
  });

  // Switch room: switchgear along the wall and a machine in the middle.
  prop("cabinet", "cabinet-switch-a", 1.0, -23.35, F);
  prop("cabinet", "cabinet-switch-b", 2.2, -23.35, F);
  prop("cabinet", "cabinet-switch-c", 3.4, -23.35, F);
  prop("machine", "machine-switch", 1.7, -20.2, F);

  // Cargo office: crate lanes.
  prop("crateStack", "crates-cargo-a", 24.8, -21.2, F);
  prop("crateStack", "crates-cargo-b", 29, -21.2, F);
  prop("crateStack", "crates-cargo-c", 26.2, -15.2, F);
  prop("crate", "crate-cargo-d", 31.15, -17.95, F);

  // Server room: two rows of racks with gaps (narrow 1.5 m lanes).
  [
    [23.7, 26.2, -9.7],
    [27.9, 31.7, -9.7],
    [23.8, 27.0, -7.2],
    [28.6, 31.7, -7.2],
  ].forEach(([x0, x1, z], i) => {
    prop("rack", `rack-server-${i + 1}`, (x0 + x1) / 2, z, F, "x", {
      width: x1 - x0,
      depth: 1,
    });
  });

  // Break room: a table, lockers on the east wall, a counter.
  prop("table", "table-break", 27.2, 6.7, F);
  prop("locker", "lockers-break", 31.4, 6.75, F, "z", {
    width: 3.5,
    depth: 0.6,
  });
  prop("bench", "counter-break", 23.4, 11.55, F, "x", {
    width: 2.2,
    depth: 0.9,
  });

  // Warehouse: crate stacks with 2 m lanes between them.
  prop("crateStack", "stack-wh-1", 20.8, 16.8, F);
  prop("crateStack", "stack-wh-2", 25, 15.4, F);
  prop("crateStack", "stack-wh-3", 29.2, 15.8, F);
  prop("crateStack", "stack-wh-4", 22.6, 21, F);
  prop("crateStack", "stack-wh-5", 27.4, 20.6, F);
  prop("crate", "crates-wh-6", 31.05, 19.8, F, "z", {
    width: 2.4,
    depth: 1.3,
    height: 1.3,
  });

  // Workshop: benches along the north, machines to the south.
  prop("bench", "bench-ws-1", 9, 17.25, F);
  prop("bench", "bench-ws-2", 14.6, 17.25, F);
  prop("machine", "machine-ws-1", 9.3, 21.3, F);
  prop("machine", "press-ws-2", 14, 21.2, F, "x", {
    width: 2,
    depth: 2,
    height: 1.9,
  });

  // Store: shelving rows.
  prop("shelf", "shelf-store-1", -16.05, 18.3, F, "z", {
    width: 3,
    depth: 0.7,
  });
  prop("shelf", "shelf-store-2", -13.7, 20.45, F, "z", {
    width: 3.7,
    depth: 0.7,
  });
  prop("shelf", "shelf-store-3", -11.2, 18.2, F, "z", {
    width: 3,
    depth: 0.7,
  });

  // Hall: four columns, a raised podium on the west wall.
  [
    [-28, 16],
    [-23, 16],
    [-28, 20],
    [-23, 20],
  ].forEach(([x, z], i) => {
    map.createColumn(`column-hall-${i + 1}`, x, z, F, F + 3.2, 0.8);
  });
  map.createFloorSection("podium-hall", bounds(-31.7, -29.5, 17, 20), F + 0.4);

  // Barracks: bunks on the west wall, a locker wall splitting the room.
  prop("bed", "bunk-barracks-1", -31.25, -9, F, "z", { width: 2, depth: 0.9 });
  prop("bed", "bunk-barracks-2", -31.25, -4.3, F, "z", {
    width: 2,
    depth: 0.9,
  });
  prop("locker", "lockers-barracks-a", -27, -10.1, F, "z", {
    width: 3.2,
    depth: 0.8,
  });
  prop("locker", "lockers-barracks-b", -27, -4.4, F, "z", {
    width: 2.2,
    depth: 0.8,
  });

  // Armory: racks along the north wall, a table, a cage in the corner.
  prop("rack", "racks-armory", -29.2, 5.7, F, "x", { width: 5, depth: 0.8 });
  prop("table", "table-armory", -26.3, 8.6, F, "x", { width: 2.5, depth: 1.2 });
  prop("machine", "cage-armory", -21.95, 11, F, "x", {
    width: 2.9,
    depth: 2,
    height: 2.2,
  });

  // ----------------------------------------------------------------- roofs
  // Every room has a roof you can stand on (ROOF_LOW; the Control room's
  // is ROOF_MID; the Cargo office's and the Warehouse's are ROOF_HIGH). Over
  // the open yards go medium roofs with a skylight gap down the middle.
  // The alcove's roof has a hatch over the secret ladder in its corner.
  const alcoveHatch = bounds(-15.3, -14, -23.65, -22.35);

  map.createRoofSection(
    "roof-alcove",
    bounds(-21, -14, -24, -15),
    ROOF_LOW,
    ROOF_THICKNESS,
    alcoveHatch,
  );
  map.createHatch("hatch-alcove", "secret-alcove", alcoveHatch, ROOF_LOW);
  map.createRoofSection("roof-dock-a", bounds(7, 13, -24, -15), ROOF_MID);
  map.createRoofSection("roof-dock-b", bounds(16, 22, -24, -15), ROOF_MID);
  // The plaza's secret ladder climbs beside the roof: a gap in the roof lets it
  // pass instead of running into the underside.
  map.createRoofSection(
    "roof-plaza-a",
    bounds(-9, -1.5, 15.6, Z),
    ROOF_MID,
    ROOF_THICKNESS,
    bounds(-9, -7.5, 22.1, 23.5),
  );
  map.createRoofSection("roof-plaza-b", bounds(1.5, 6, 15.6, Z), ROOF_MID);
  (
    [
      ["column-dock-a", 10, -15.3],
      ["column-dock-b", 19, -15.3],
      ["column-plaza-a", -5, 15.9],
      ["column-plaza-b", 3.75, 15.9],
    ] as const
  ).forEach(([id, x, z]) => {
    map.createColumn(id, x, z, F, ROOF_MID - ROOF_THICKNESS);
  });

  // A catwalk joins the Server room's roof and the Break room's across the east court.
  map.createCatwalk("catwalk-east", bounds(26.2, 28.2, -5, 3), ROOF_LOW);
  map.createRailing({
    id: "rail-catwalk-west",
    axis: "z",
    at: 26.2,
    from: -5,
    to: 3,
    floorY: ROOF_LOW,
    inside: 1,
  });
  map.createRailing({
    id: "rail-catwalk-east",
    axis: "z",
    at: 28.2,
    from: -5,
    to: 3,
    floorY: ROOF_LOW,
    inside: -1,
  });

  // Climbable steps between the roof layers.
  map.declareLedge(
    "ledge-roof-alcove-control",
    bounds(-21, -21, -24, -15),
    ROOF_LOW,
    ROOF_MID,
  );
  map.declareLedge(
    "ledge-roof-switch-dock",
    bounds(7, 7, -24, -15),
    ROOF_LOW,
    ROOF_MID,
  );
  map.declareLedge(
    "ledge-roof-store-plaza",
    bounds(-9, -9, 15.6, Z),
    ROOF_LOW,
    ROOF_MID,
  );
  // A housing on the dock roof is a 0.75 m step: dock roof, housing, Cargo roof.
  map.createLedge(
    "ledge-roof-housing",
    bounds(20, 21.9, -20.5, -18.5),
    ROOF_MID,
    0.75,
  );
  map.declareLedge(
    "ledge-roof-cargo",
    bounds(22, 22, -24, -15),
    ROOF_MID + 0.75,
    ROOF_HIGH,
  );

  // ------------------------------------------------------ rooftop machinery
  map.createTank("tank-barracks", -28, -6.5, ROOF_LOW);
  prop("vent", "vent-barracks", -24.2, -5.4, ROOF_LOW);
  prop("vent", "vent-archive", -8, -20, ROOF_LOW);
  prop("vent", "vent-server", 25, -10.6, ROOF_LOW);
  map.createTank("tank-break", 29.2, 8, ROOF_LOW, 1);
  prop("vent", "vent-store", -13.5, 20, ROOF_LOW);
  prop("vent", "vent-workshop", 11, 20, ROOF_LOW);
  prop("vent", "vent-hall", -25.5, 17.5, ROOF_LOW);
  prop("vent", "vent-control", -27, -19, ROOF_MID);
  map.createTank("tank-cargo", 28, -19, ROOF_HIGH, 1.2);
  prop("machine", "unit-warehouse", 25, 18, ROOF_HIGH, "x", {
    width: 3,
    depth: 2,
    height: 1.4,
  });
  prop("vent", "vent-plaza", -7, 17.5, ROOF_MID);

  // ------------------------------------------- ducts, pipes and steel beams
  // Overhead and drawn only, high enough to walk and jump under.
  map.createOverhead(
    "pipe-north",
    bounds(-21, 7, -14.7, -14.4),
    6.9,
    7.2,
    "pipe",
  );
  map.createOverhead(
    "pipe-south",
    bounds(-18, 18, 13.5, 13.8),
    6.9,
    7.2,
    "pipe",
  );
  map.createOverhead(
    "duct-east",
    bounds(20.8, 21.4, -12, 12),
    6.6,
    7.2,
    "duct",
  );
  map.createOverhead(
    "duct-west",
    bounds(-19.9, -19.5, -12, 5),
    6.6,
    7.2,
    "duct",
  );
  map.createIndustrialProp(
    "bench",
    "duct-archive",
    -7.5,
    -18.7,
    ROOF_LOW,
    "x",
    {
      width: 11,
      depth: 0.6,
      height: 0.4,
    },
  );
  map.createIndustrialProp("bench", "duct-workshop", 12, 18.1, ROOF_LOW, "x", {
    width: 10,
    depth: 0.6,
    height: 0.4,
  });
  map.createIndustrialProp("bench", "pipe-barracks", -26.5, -9, ROOF_LOW, "x", {
    width: 9,
    depth: 0.4,
    height: 0.3,
  });
  // Beams under the medium roofs: they touch the slabs' undersides.
  map.createOverhead(
    "beam-dock-1",
    bounds(7, 22, -19.3, -18.9),
    ROOF_MID - ROOF_THICKNESS - 0.4,
    ROOF_MID - ROOF_THICKNESS,
    "steel",
  );
  map.createOverhead(
    "beam-plaza-1",
    bounds(-9, 6, 19.3, 19.7),
    ROOF_MID - ROOF_THICKNESS - 0.4,
    ROOF_MID - ROOF_THICKNESS,
    "steel",
  );

  // ------------------------------------- hanging and swinging structure zones
  // Strong overhead beams for a later hanging system: nothing hangs from them yet.
  // Each one rests on something: steel posts on the walkway edges, the
  // undersides of the roofs, or the room walls.
  const TRUSS = 7.2;

  map.createHangZone(
    "hang-arena-north",
    "Arena truss (north)",
    0,
    -1.5,
    TRUSS,
    "x",
    37,
  );
  map.createHangZone(
    "hang-arena-south",
    "Arena truss (south)",
    0,
    6.9,
    TRUSS,
    "x",
    37,
  );
  for (const [id, x, z] of [
    ["post-truss-nw", -18.4, -1.5],
    ["post-truss-ne", 18.4, -1.5],
    ["post-truss-sw", -18.4, 6.9],
    ["post-truss-se", 18.4, 6.9],
  ] as const) {
    map.createColumn(id, x, z, F, TRUSS + 0.4, 0.5);
  }
  // Skylight beams span the gaps between the medium roofs, held up by them.
  const SLAB_UNDER = ROOF_MID - ROOF_THICKNESS;

  map.createHangZone(
    "hang-dock",
    "Dock skylight beam",
    14.5,
    -21.5,
    SLAB_UNDER - 0.4,
    "x",
    5,
  );
  map.createHangZone(
    "hang-plaza",
    "Plaza skylight beam",
    0,
    21.5,
    SLAB_UNDER - 0.4,
    "x",
    5,
  );
  // Between the Control room's wall and the Archive's, under the alcove roof.
  map.createHangZone(
    "hang-alcove",
    "Alcove beam",
    -17.5,
    -19,
    ROOF_LOW - ROOF_THICKNESS - 0.4,
    "x",
    7,
  );
  // A crane rail hung from the Warehouse's roof trusses.
  map.createHangZone(
    "hang-warehouse",
    "Warehouse crane rail",
    25,
    14,
    ROOF_HIGH - ROOF_THICKNESS - 0.4,
    "x",
    13,
  );

  // ------------------------------------------------------- structural steel
  // Exposed I-beams, braces and trusses (drawn as one steel mesh). Everything is
  // either overhead, under a slab, or flush to a wall; only the six floor
  // columns are solid, and each sits in a corner against two walls.
  const STEEL_ROOF = ROOF_MID - ROOF_THICKNESS;

  // 1. Supports under the elevated slabs: cross beams under each floating
  //    balcony (from the building face), and a rim beam along the free edge.
  const supportBalcony = (
    id: string,
    xs: number[],
    xMin: number,
    xMax: number,
    zWall: number,
    zFree: number,
    slabBottom: number,
  ): void => {
    const y = slabBottom - 0.175;

    xs.forEach((x, i) => {
      map.createSteel(
        `${id}-beam-${i + 1}`,
        "support",
        [x, y, zWall],
        [x, y, zFree],
        "i",
        0.22,
        0.35,
      );
    });
    map.createSteel(
      `${id}-rim`,
      "support",
      [xMin, y, zFree + Math.sign(zWall - zFree) * 0.15],
      [xMax, y, zFree + Math.sign(zWall - zFree) * 0.15],
      "i",
      0.22,
      0.35,
    );
  };

  supportBalcony(
    "steel-balcony-north",
    [-5.5, -1.5, 2],
    -7,
    5,
    -12,
    -7.5,
    F - 0.5,
  );
  supportBalcony(
    "steel-balcony-east",
    [12.5, 14.5, 16.5],
    11,
    18,
    12,
    7.8,
    F - 0.5,
  );

  // The east catwalk: two stringers and cross beams under it, and knee braces up
  // from the two room walls it starts at (high enough to walk under).
  const CATWALK_UNDER = ROOF_LOW - 0.25;

  for (const x of [26.55, 27.85]) {
    map.createSteel(
      `steel-catwalk-stringer-${x}`,
      "support",
      [x, CATWALK_UNDER - 0.15, -5],
      [x, CATWALK_UNDER - 0.15, 3],
      "i",
      0.2,
      0.3,
    );
  }

  [-3.5, -1, 1.5].forEach((z, i) => {
    map.createSteel(
      `steel-catwalk-cross-${i + 1}`,
      "support",
      [26.2, CATWALK_UNDER - 0.13, z],
      [28.2, CATWALK_UNDER - 0.13, z],
      "i",
      0.18,
      0.26,
    );
  });

  for (const x of [26.55, 27.85]) {
    map.createSteel(
      `steel-catwalk-knee-s-${x}`,
      "support",
      [x, 6.7, -5.05],
      [x, CATWALK_UNDER - 0.3, -3.6],
      "box",
      0.14,
      0.2,
    );
    map.createSteel(
      `steel-catwalk-knee-n-${x}`,
      "support",
      [x, 6.7, 3.05],
      [x, CATWALK_UNDER - 0.3, 1.6],
      "box",
      0.14,
      0.2,
    );
  }

  // 2. I-beam columns in outer corners, tucked against two walls: the dock's
  //    two north corners and the east and west decks' corners at the outer wall.
  map.createSteelColumn("steel-column-dock-e", 21.8, -23.8, F, STEEL_ROOF);
  map.createSteelColumn("steel-column-dock-w", 7.2, -23.8, F, STEEL_ROOF);
  map.createSteelColumn(
    "steel-column-deck-east-n",
    31.8,
    -4.8,
    F,
    ROOF_LOW - 0.3,
  );
  map.createSteelColumn(
    "steel-column-deck-east-s",
    31.8,
    2.8,
    F,
    ROOF_LOW - 0.3,
  );
  map.createSteelColumn(
    "steel-column-deck-west-n",
    -31.8,
    -2.8,
    F,
    ROOF_LOW - 0.3,
  );
  map.createSteelColumn(
    "steel-column-deck-west-s",
    -31.8,
    4.8,
    F,
    ROOF_LOW - 0.3,
  );

  // 3. A few X braces on the outer walls between those columns (flat against the
  //    wall, so a body never meets them), and in two Warehouse bays.
  const xBrace = (
    id: string,
    a: [number, number],
    b: [number, number],
    plane: "x" | "z",
    at: number,
    yLow: number,
    yHigh: number,
  ): void => {
    const point = (t: number, y: number): [number, number, number] =>
      plane === "x" ? [at, y, t] : [t, y, at];

    map.createSteel(
      `${id}-1`,
      "brace",
      point(a[0], yLow),
      point(b[0], yHigh),
      "box",
      0.14,
      0.22,
    );
    map.createSteel(
      `${id}-2`,
      "brace",
      point(a[1], yLow),
      point(b[1], yHigh),
      "box",
      0.14,
      0.22,
    );
  };

  xBrace(
    "steel-brace-west",
    [-2.5, 4.5],
    [4.5, -2.5],
    "x",
    -31.93,
    F + 0.4,
    ROOF_LOW - 0.6,
  );
  xBrace(
    "steel-brace-east",
    [-4.5, 2.5],
    [2.5, -4.5],
    "x",
    31.93,
    F + 0.4,
    ROOF_LOW - 0.6,
  );

  // The Warehouse's south wall: three flat pilasters and an X brace in each bay.
  const WH_FACE = 23.7;
  const WH_TOP = F + 6.5;

  for (const x of [19.2, 25, 30.8]) {
    map.createSteel(
      `steel-pilaster-warehouse-${x}`,
      "column",
      [x, F, WH_FACE - 0.1],
      [x, WH_TOP, WH_FACE - 0.1],
      "i",
      0.3,
      0.2,
    );
  }

  [
    [19.2, 25],
    [25, 30.8],
  ].forEach(([x0, x1], i) => {
    xBrace(
      `steel-brace-warehouse-${i + 1}`,
      [x0 + 0.3, x1 - 0.3],
      [x1 - 0.3, x0 + 0.3],
      "z",
      WH_FACE - 0.07,
      F + 0.5,
      WH_TOP - 0.5,
    );
  });

  // 4. Roof trusses under the high flat roofs of the Warehouse (two) and the
  //    Cargo office (one): the top chord rests on the roof's underside, the ends
  //    on the walls. The arena and the other roofs stay open.
  const TRUSS_TOP = ROOF_HIGH - ROOF_THICKNESS - 0.15;

  map.createTruss(
    "steel-truss-warehouse-a",
    [18.3, TRUSS_TOP, 17],
    [31.7, TRUSS_TOP, 17],
    1.4,
    8,
  );
  map.createTruss(
    "steel-truss-warehouse-b",
    [18.3, TRUSS_TOP, 20.8],
    [31.7, TRUSS_TOP, 20.8],
    1.4,
    8,
  );
  map.createTruss(
    "steel-truss-cargo",
    [22.3, TRUSS_TOP, -18],
    [31.7, TRUSS_TOP, -18],
    1.4,
    6,
  );

  // ---------------------------------------------------------------- ledges
  // 1.2 m: can be jumped onto today. 2.4 m (on top of a 1.2 m ledge): a later climb.
  map.createLedge("ledge-south-plaza", bounds(0, 3.5, 18.5, 21.5), F, 1.2);
  map.createLedge("ledge-east-deck", bounds(29, X, -2.5, 0.5), F, 1.2);
  map.createLedge("ledge-west-terrace", bounds(-X, -29, -1, 3), F, 1.2);
  map.createLedge("ledge-plaza-low", bounds(12, 15, -22, -19), F, 1.2);
  map.createLedge("ledge-plaza-high", bounds(15, 18, -22, -19), F, 2.4);

  // ---------------------------------------------------------------- spawns
  // Bare ground in the middle of the arena, away from the stairs and from
  // anything hanging overhead.
  // ------------------------------------------------- identity of each side
  // WEST (service and maintenance): a screen wall makes a narrow nook round
  // the terrace's secret ladder.
  map.createWall("nook-west", "z", -27.4, 1.2, 5, F, 0.3, 2.6);
  // NORTH (operations): a public ladder up the Switch room to its roof.
  map.createLadder({
    id: "ladder-roof-north",
    normal: "+z",
    face: -17,
    along: 5.4,
    bottomY: F,
    topY: ROOF_LOW,
  });
  // EAST (loading and machinery): a generator on the east deck.
  prop("machine", "generator-east-deck", 23.6, -2.6, F);
  // SOUTH (workshop and storage): crate stacks hide the plaza's secret ladder.
  prop("crateStack", "crates-plaza-a", -6, 20.4, F);

  // ------------------------------------------------ rooftop identity and cover
  // Service huts and units break the long roof sightlines: every roof has
  // something between its ends, and none of it blocks a crossing.
  prop("machine", "hut-archive", -3.4, -19.2, ROOF_LOW, "x", {
    width: 3,
    depth: 2.4,
    height: 2.4,
  });
  prop("vent", "unit-switch", 3, -20.5, ROOF_LOW);
  prop("machine", "box-server", 24.4, -7.2, ROOF_LOW, "x", {
    width: 1.2,
    depth: 0.8,
    height: 1.1,
  });
  prop("vent", "unit-break", 25.2, 9.4, ROOF_LOW);
  prop("machine", "skylight-hall", -26, 21.6, ROOF_LOW, "x", {
    width: 3,
    depth: 2,
    height: 0.6,
  });
  prop("machine", "hut-workshop", 15.2, 21, ROOF_LOW, "x", {
    width: 3,
    depth: 2.4,
    height: 2.4,
  });
  prop("machine", "skylight-control", -26, -15.2, ROOF_MID, "x", {
    width: 3,
    depth: 2,
    height: 0.6,
  });
  prop("machine", "hut-cargo", 25, -14, ROOF_HIGH, "x", {
    width: 2.4,
    depth: 2.4,
    height: 2.2,
  });
  prop("machine", "hut-warehouse", 29, 21.2, ROOF_HIGH, "x", {
    width: 2.4,
    depth: 2.4,
    height: 2.2,
  });
  prop("machine", "duct-warehouse", 23.5, 14.6, ROOF_HIGH, "x", {
    width: 5,
    depth: 0.8,
    height: 0.9,
  });
  // Raised roof walls and tall huts stop the higher roofs from seeing over
  // everything below them (with a gap where the climb up from the alcove arrives).
  map.createWall(
    "roofwall-control",
    "z",
    -21.6,
    -23.8,
    -14,
    ROOF_MID,
    0.3,
    2.4,
    "wall",
    [{ from: -20.3, to: -16.7 }],
  );
  prop("machine", "hut-plaza", -4, 21, ROOF_MID, "x", {
    width: 2.4,
    depth: 2.4,
    height: 2.4,
  });
  prop("machine", "hut-hall", -21, 15.5, ROOF_LOW, "x", {
    width: 2.4,
    depth: 2.4,
    height: 2.4,
  });
  // Roof walls (1.9 m) along the roof edges that face the arena and the
  // walkways. Shooting over one is not possible: a roof position looks out only
  // through the gaps, which are exposed, and the roof behind can be reached
  // another way.
  const roofWall = (
    id: string,
    axis: "x" | "z",
    at: number,
    from: number,
    to: number,
    top: number,
    gaps: Array<{ from: number; to: number }>,
  ): void =>
    map.createWall(id, axis, at, from, to, top, 0.3, 1.9, "wall", gaps);

  roofWall("roofwall-archive", "x", -16.3, -13.8, -1.2, ROOF_LOW, [
    { from: -8.8, to: -5.8 },
  ]);
  roofWall("roofwall-server", "z", 22, -11.8, -7.5, ROOF_LOW, []);
  roofWall("roofwall-break", "z", 22, 3.2, 11.8, ROOF_LOW, [
    { from: 6, to: 9 },
  ]);
  roofWall("roofwall-barracks", "z", -21.3, -11.8, -3.2, ROOF_LOW, [
    { from: -8, to: -5 },
  ]);
  roofWall("roofwall-armory", "z", -20.5, 5.2, 11.8, ROOF_LOW, [
    { from: 6.8, to: 9.6 },
  ]);
  roofWall("roofwall-store", "x", 15, -17.8, -9.2, ROOF_LOW, [
    { from: -14.5, to: -11.5 },
  ]);
  roofWall("roofwall-workshop", "x", 15, 6.2, 16, ROOF_LOW, [
    { from: 7.2, to: 9.8 },
    { from: 13, to: 16 },
  ]);
  // Parapets: waist-high cover on the high roofs, with a gap where a climb arrives.
  map.createWall(
    "parapet-warehouse-north",
    "x",
    12.05,
    18.4,
    31.8,
    ROOF_HIGH,
    0.25,
    1,
    "wall",
  );
  map.createWall(
    "parapet-cargo-west",
    "z",
    22.05,
    -23.8,
    -12.4,
    ROOF_HIGH,
    0.25,
    1,
    "wall",
    [{ from: -21, to: -18 }],
  );

  const layout = map.build();

  layout.spawnPoints = [
    spawn(1, -10, 9, -16, 9.6), // facing the south-west staircase
    spawn(2, -12.5, 1.5, -18, -8.8),
    spawn(3, -7.5, -4.5, 0, -6.5),
    spawn(4, 0, -5.5, 0, 5),
    spawn(5, 2, 3, -4, -4),
    spawn(6, 10, -6.5, 15.5, -9.6), // facing the north-east staircase
    spawn(7, 9, 5.5, 13, 10),
    spawn(8, -5, 3, 5, -3),
  ];

  return layout;
}

export const ARENA_LAYOUT: ArenaLayout = createUpperFloor();
