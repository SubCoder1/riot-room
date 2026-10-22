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
import { addWeathering } from "./Weathering";
import { furnishHall, furnishStorageRoom, furnishYard } from "./StorageRoom";
import { furnishDebris } from "./Debris";
import { furnishOccupation } from "./Occupation";
import { furnishMessyWiring } from "./MessyWiring";
import { furnishPowerFeeds } from "./PowerFeeds";
import { furnishRoofWiring } from "./RoofWiring";
import { furnishDeckService, furnishPowerGrid } from "./PowerGrid";
import { furnishArchive } from "./Archive";
import { furnishArmory } from "./Armory";
import { furnishBarracks } from "./Barracks";
import { furnishConstructionSite } from "./ConstructionSite";
import { furnishBreakRoom } from "./BreakRoom";
import { furnishServerRoom } from "./ServerRoom";
import { furnishSpawnAreas } from "./SpawnAreas";
import { furnishShotBlocks } from "./ShotBlocks";
import { furnishStairDetails } from "./StairDetails";
import { furnishWarehouse } from "./Warehouse";
import { furnishWorkshop } from "./WorkshopInterior";

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
 *   - two staircases, one out of each spawn area (north-west and north-east, on the ground floor),
 *   - one ladder up the north face of the arena,
 *   - three ladders to the roofs from the walkways,
 *   - two secret ladders (the alcove's, under a hatch, and the terrace's) and a maintenance ladder,
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
  // The north wing, with the two spawn areas cut down to the ground floor
  // (north-west x -32 to -21, z -24 to -13.5; north-east x 22 to 32, z -24 to
  // -12): the floor stays up between them and in the strip south of the first.
  map.createFloorSection("north-wing-mid", bounds(-21, 22, -Z, -12), F);
  map.createFloorSection("north-wing-nw", bounds(-X, -21, -13.5, -12), F);
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
  // Its walls are the north-west spawn area's and the Barracks'.
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
  // ------------------------------------------------------------ staircases
  // Two flights, one straight out of each spawn area (which is on the ground
  // floor, cut down into the north wing): 14 steps of 0.286 m (4 m) at a
  // 0.55 m tread, 4 m wide, climbing along the spawn area's south edge to the
  // first floor. Neither is in the central arena.
  //   north-west  from x -28.7 east to x -21, to the north walkway
  //   north-east  from x 29.7 west to x 22, to the loading dock
  map.createStaircase({
    id: "stairs-spawn-nw",
    start: -28.7,
    direction: "+x",
    crossMin: -17.8,
    crossMax: -13.8,
    steps: 14,
    rise: 4 / 14,
    tread: 0.55,
  });
  map.createStaircase({
    id: "stairs-spawn-ne",
    start: 29.7,
    direction: "-x",
    crossMin: -16.3,
    crossMax: -12.3,
    steps: 14,
    rise: 4 / 14,
    tread: 0.55,
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
  // To the roofs, from the walkways:
  map.createLadder({
    id: "ladder-roof-east",
    normal: "-x",
    face: 22,
    along: -6,
    bottomY: F,
    topY: ROOF_LOW,
  });
  // (The hall's roof is level with the Warehouse's now: no ladder between.)
  map.createLadder({
    id: "ladder-roof-south",
    normal: "-z",
    face: 15,
    along: 8.5,
    bottomY: F,
    topY: ROOF_HIGH,
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
    gaps: [{ from: -12, to: -9.6 }],
  });
  map.createRailing({
    id: "rail-edge-east",
    axis: "z",
    at: 18,
    from: -12,
    to: 12,
    floorY: F,
    inside: 1,
    gaps: [{ from: 7.8, to: 12 }],
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

  // ----------------------------------------------------------------- rooms
  // NORTH SIDE, west to east.
  // The north-west spawn area is at ground level: walls up to the old height,
  // open top, the way out the staircase along its south edge up to the walkway.
  map.createRoom({
    id: "room-spawn-nw",
    name: "North-west spawn area (ground floor)",
    roof: false,
    bounds: bounds(-X, -21, -Z, -13.5),
    floorY: 0,
    walls: ["n", "w", "s"],
    wallHeight: F + WALL_TO_MID,
    doors: [],
  });
  // Its east side above the first floor, open where the stairs top out.
  map.createWall(
    "room-spawn-nw-wall-e",
    "z",
    -21.3,
    -23.7,
    -13.8,
    F,
    0.3,
    WALL_TO_MID,
    "wall",
    [{ from: -17.8, to: -13.8 }],
  );
  map.createWall(
    "room-spawn-nw-lintel",
    "z",
    -21.3,
    -17.8,
    -13.8,
    F + 2.6,
    0.3,
    WALL_TO_MID - 2.6,
  );
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
  // The north-east spawn area, likewise at ground level, up the staircase
  // along its south edge to the loading dock.
  map.createRoom({
    id: "room-spawn-ne",
    name: "North-east spawn area (ground floor)",
    roof: false,
    bounds: bounds(22, X, -Z, -12),
    floorY: 0,
    walls: ["n", "e", "s"],
    wallHeight: F + WALL_TO_HIGH,
    doors: [],
  });
  map.createWall(
    "room-spawn-ne-wall-w",
    "z",
    22,
    -23.7,
    -12.3,
    F,
    0.3,
    WALL_TO_HIGH,
    "wall",
    [{ from: -16.3, to: -12.3 }],
  );
  map.createWall(
    "room-spawn-ne-lintel",
    "z",
    22,
    -16.3,
    -12.3,
    F + 2.6,
    0.3,
    WALL_TO_HIGH - 2.6,
  );

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
  // The whole hall is the Storage room (its workshop end, central hall and
  // storage end are one floor): 27 m long (x -9 to 18) and 5 m to the ceiling,
  // from the yard to the Warehouse's west wall, open end to end (only a return
  // wall at x 6 stays, by the cabinet and rack). The roof is made of sections
  // below (the skylight stays glazed).
  map.createRoom({
    id: "room-workshop",
    name: "Storage room (workshop, machines and shelving)",
    bounds: bounds(-9, 18, 15, Z),
    floorY: F,
    walls: ["n", "s"],
    wallHeight: WALL_TO_HIGH,
    roof: false,
    doors: [
      { side: "n", at: -7.2 },
      { side: "n", at: 1, width: 4 },
      { side: "n", at: 11.5 },
    ],
  });
  // A return wall (x 6.0, z 15.3 to 20.1): what is left of the Workshop's old
  // west wall, holding the cabinet, the parts rack, the conduit and the cable
  // tray. The rest of the middle is open: the storage end, the central hall and
  // the workshop are one floor, with the shelving rows running through it.
  map.createWall(
    "room-workshop-wall-partition-b",
    "z",
    6,
    15.3,
    20.1,
    F,
    0.3,
    WALL_TO_HIGH,
    "wall",
  );

  map.createRoom({
    id: "room-yard",
    name: "Yard (open floor, crates and cover)",
    bounds: bounds(-18, -9, 15, Z),
    floorY: F,
    walls: ["n", "s"],
    // The old Store, opened up: no east wall (the hall runs straight on), a
    // 3 m door from the walkway, and the Hall's wide opening to the west.
    doors: [{ side: "n", at: -13, width: 3 }],
  });
  map.createRoom({
    id: "room-hall",
    name: "Hall (open top)",
    roof: false,
    bounds: bounds(-X, -18, 12, Z),
    floorY: F,
    doors: [
      { side: "n", at: -26 },
      { side: "n", at: -19 },
      { side: "e", at: 13.5 },
      { side: "e", at: 19.5, width: 5 },
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

  // North-west spawn area: bare floor in the middle for spawning and moving
  // out; a monitor bank on the north wall and a crate in the south-west corner.

  // Archive: shelf aisles with gaps to cross, cabinets, a counter and a desk (see Archive).
  furnishArchive(map, F);

  // Switch room: switchgear along the wall and a machine in the middle.
  // (The third switchgear cabinet is the main distribution panel: see PowerGrid.)

  // North-east spawn area: bare floor in the middle; a crate stack in the
  // north-east corner and a crate against the east wall.

  // Server room: two rows of racks with gaps (narrow 1.5 m lanes), see ServerRoom.
  furnishServerRoom(map, F);

  // Break room: a table and chairs, a sofa, a kitchen run, lockers and a vending
  // machine (see BreakRoom).
  furnishBreakRoom(map, F);

  // Warehouse: five cargo groups with 2 m lanes between them, shelving and a pallet
  // truck (see Warehouse).
  furnishWarehouse(map, F);

  // Workshop: a workbench, storage and materials (WorkshopInterior), and the
  // two machines to the south.
  prop("machine", "machine-ws-1", 9.3, 21.3, F);
  prop("machine", "press-ws-2", 14, 21.2, F, "x", {
    width: 2,
    depth: 2,
    height: 1.9,
  });

  furnishWorkshop(map, F);
  furnishStorageRoom(map, F);
  furnishHall(map, F);
  furnishPowerGrid(map, F);
  furnishDeckService(map, F);
  furnishSpawnAreas(map);
  furnishStairDetails(map, F);
  furnishConstructionSite(map, F);
  furnishOccupation(map, F);
  furnishShotBlocks(map, F);

  // Yard: a few scattered props with wide lanes between them (the vent
  // tunnel runs along x -13.6 to -12.4, left clear).
  furnishYard(map, F);

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

  // Barracks: bunks on the west wall, a locker wall splitting the room (see Barracks).
  furnishBarracks(map, F);

  // Armory: handgun racks, throwable bays, a table and a cage (see Armory).
  furnishArmory(map, F);

  // ----------------------------------------------------------------- roofs
  // Every room has a roof you can stand on (ROOF_LOW; the north-west spawn area's
  // is ROOF_MID; the north-east spawn area's and the Warehouse's are ROOF_HIGH). Over
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
  // (The loading dock is an open yard: it has no roof.)
  // The plaza's secret ladder climbs beside the roof: a gap in the roof lets it
  // pass instead of running into the underside.
  // The hall's roof, at the Warehouse's roof level end to end (6.5 m over the
  // floor): the storage end, the plaza's two slabs round the skylight, and the
  // workshop end. It is high enough to stand on a shelf and still jump.
  map.createRoofSection("roof-storage", bounds(-9, -1.5, 15, Z), ROOF_HIGH);
  map.createRoofSection("roof-plaza-b", bounds(1.5, 6, 15, Z), ROOF_HIGH);
  map.createRoofSection("roof-plaza-c", bounds(-1.5, 1.5, 15, 15.6), ROOF_HIGH);
  map.createRoofSection("room-workshop-roof", bounds(6, 18, 15, Z), ROOF_HIGH);
  (
    [
      ["column-plaza-a", -5, 15.9, ROOF_HIGH],
      // (Flush to the north wall, so the lane beside it is the whole lane.)
      ["column-plaza-b", 3.75, 15.6, ROOF_HIGH],
    ] as const
  ).forEach(([id, x, z, roof]) => {
    map.createColumn(id, x, z, F, roof - ROOF_THICKNESS);
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

  // (The steps between the roof layers: the yard roof to the hall roof is the
  // glass cover's open pane; the dock has no roof to climb to.)

  // ------------------------------------------------------ rooftop machinery
  map.createTank("tank-barracks", -28.9, -6.5, ROOF_LOW);
  prop("vent", "vent-barracks", -24.2, -5.4, ROOF_LOW);
  prop("vent", "vent-archive", -8, -20, ROOF_LOW);
  prop("vent", "vent-server", 25, -10.6, ROOF_LOW);
  map.createTank("tank-break", 28.6, 8, ROOF_LOW, 1.35, 3.9);
  prop("vent", "vent-store", -13.5, 20, ROOF_LOW);
  prop("vent", "vent-workshop", 11, 20, ROOF_HIGH);
  prop("machine", "unit-warehouse", 25, 18, ROOF_HIGH, "x", {
    width: 3,
    depth: 2,
    height: 1.4,
  });
  prop("vent", "vent-plaza", -7, 17.5, ROOF_HIGH);

  // ------------------------------------------- ducts, pipes and steel beams
  // Overhead and drawn only, high enough to walk and jump under.
  // (No ducts or pipes hang in the open: they had nothing holding them up.)
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
  map.createIndustrialProp("bench", "duct-workshop", 12, 18.1, ROOF_HIGH, "x", {
    width: 10,
    depth: 0.6,
    height: 0.4,
  });
  map.createIndustrialProp("bench", "pipe-barracks", -26.5, -9, ROOF_LOW, "x", {
    width: 9,
    depth: 0.4,
    height: 0.3,
  });
  // The yard's roof edge where its east wall was: a steel header the length
  // of the opening, under the slab (drawn only).
  map.createOverhead(
    "beam-yard-header",
    bounds(-9.4, -9, 15.3, 23.7),
    ROOF_LOW - ROOF_THICKNESS - 0.45,
    ROOF_LOW - ROOF_THICKNESS,
    "steel",
  );
  // Beams under the medium roofs: they touch the slabs' undersides.
  map.createOverhead(
    "beam-plaza-1",
    bounds(-9, 6, 19.3, 19.7),
    ROOF_HIGH - ROOF_THICKNESS - 0.4,
    ROOF_HIGH - ROOF_THICKNESS,
    "steel",
  );

  // ------------------------------------------------------------ hang points
  // The arena is open to the sky and its middle is bare: there are no ledges
  // or perches over it. The one hang point is the plaza's skylight beam.
  // The plaza's skylight beam, under the glass over the south plaza.
  map.createHangZone(
    "hang-plaza",
    "Plaza skylight beam (mid-south)",
    0,
    21.5,
    ROOF_HIGH - ROOF_THICKNESS - 0.3,
    "x",
    5,
    F,
  );

  // ------------------------------------------------------- structural steel
  // Exposed I-beams, braces and trusses (drawn as one steel mesh). Everything is
  // either overhead, under a slab, or flush to a wall; only the six floor
  // columns are solid, and each sits in a corner against two walls.

  // (The floating balconies have no beams under them: they stand on posts.)

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
  //    north-east spawn area (one): the top chord rests on the roof's underside, the ends
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

  // The hall's roof trusses: four, across its width, clear of the skylight
  // beam and of the wall pipes.
  const HALL_TRUSS_TOP = ROOF_HIGH - ROOF_THICKNESS - 0.15;

  for (const [id, x] of [
    ["steel-truss-hall-a", -5],
    ["steel-truss-hall-b", 4],
    ["steel-truss-hall-c", 10],
    ["steel-truss-hall-d", 15.8],
  ] as const) {
    map.createTruss(
      id,
      [x, HALL_TRUSS_TOP, 15.9],
      [x, HALL_TRUSS_TOP, 23.1],
      0.7,
      6,
    );
  }

  // The hall's west end above the yard's wall: a slanted cover of tinted
  // glass on a steel frame, from the wall top up to the hall roof, in six
  // panes, the second, third and fifth open (ways through from the yard's roof).
  map.createGlassSlope(
    "glass-slope-store",
    -9,
    -7,
    ROOF_LOW,
    ROOF_HIGH - ROOF_THICKNESS,
    15.3,
    23.7,
    6,
    [1, 2, 4],
    // Drawn only: tinted glass is nearly invisible at night, and a solid pane
    // read as an invisible wall across the whole way through.
    false,
  );

  // ------------------------------------------- enclosure and supported ledges
  // The service corridor between the north-west spawn area and the Barracks is walled on
  // both sides, so it gets a roof level with the Barracks'. Every other room is already roofed; the arena, the
  // walkways, the decks and the balconies stay open to the sky on purpose.
  // The two gaps between the medium roofs (over the dock and over the south
  // plaza) are glazed with framed reinforced glass, level with the slabs beside
  // them, so the roofline is continuous. The hang beams run under the panes.
  map.createGlassSkylight(
    "glass-plaza",
    bounds(-1.5, 1.5, 15.6, 24),
    ROOF_HIGH,
  );

  // (A glass barrier once ran along the Warehouse's west roof edge, over a lower
  // workshop roof. Both roofs are level now, so it only walled the storage
  // rooftop off from the Warehouse's roof, and see-through at night it read as
  // an invisible wall: it is gone.)

  map.createRoofSection(
    "roof-corridor-nw",
    bounds(-32, -21, -13.5, -12),
    ROOF_LOW,
  );

  // Floating slabs out in the open arena stand on a post under each outer
  // corner, up to the slab's underside: the lower south balcony, the maintenance
  // platform, the raised north-west balcony and the north overlook.
  for (const [id, x, z, top] of [
    ["steel-post-south-w", -4.75, 9.25, LOW - 0.5],
    ["steel-post-south-e", 4.75, 9.25, LOW - 0.5],
    // (Set back under the slab, so the lane between the east post and the
    // stairs' first step is a wide 1.45 m: a body can walk through it.)
    ["steel-post-maintenance-w", 7.75, -11.2, LOW - 0.5],
    ["steel-post-maintenance-e", 12.25, -11.2, LOW - 0.5],
    ["steel-post-nw-w", -15.8, -9.8, HIGH_BALCONY - 0.5],
    ["steel-post-nw-e", -11.9, -9.8, HIGH_BALCONY - 0.5],
    // The wide south balcony gets one more in the middle. The north overlook
    // is a big slab (12 x 4.5 m) that had none: three posts under its open
    // edge, just outside the ground vent (the wall behind carries the rest).
    ["steel-post-south-m", 0, 9.25, LOW - 0.5],
    ["steel-post-north-f1", -6.65, -7.65, F - 0.5],
    ["steel-post-north-f2", -3.1, -7.65, F - 0.5],
    ["steel-post-north-f3", 1.9, -7.65, F - 0.5],
  ] as const) {
    map.createSteelColumn(id, x, z, 0, top, 0.3);
  }

  // ---------------------------------------------------------------- ledges
  // 1.2 m: can be jumped onto today. 2.4 m (on top of a 1.2 m ledge): a later climb.
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
  // EAST (loading and machinery): a generator on the east deck.
  // SOUTH (workshop and storage): the Storage room fills the west of the plaza.

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
    depth: 0.75,
    height: 1.1,
  });
  prop("vent", "unit-break", 24.2, 9.4, ROOF_LOW);
  prop("machine", "hut-workshop", 15.0, 21, ROOF_HIGH, "x", {
    width: 3,
    depth: 2.4,
    height: 2.4,
  });
  prop("machine", "hut-warehouse", 29, 21.2, ROOF_HIGH, "x", {
    width: 2.4,
    depth: 2.4,
    height: 2.2,
  });
  prop("machine", "duct-warehouse", 23.5, 14.6, ROOF_HIGH, "x", {
    width: 5,
    depth: 0.75,
    height: 0.9,
  });
  // Raised roof walls and tall huts stop the higher roofs from seeing over
  // everything below them (with a gap where the climb up from the alcove arrives).
  prop("machine", "hut-plaza", -4, 21, ROOF_HIGH, "x", {
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
  roofWall("roofwall-workshop", "x", 15, 6.2, 16, ROOF_HIGH, [
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

  // ---------------------------------------------------- wear and building work
  // Evidence of repair and neglect, kept small and spread thin: a few walls
  // broken at an end or along the top, two blocks of cover with a corner gone,
  // and a few piles of building material standing where plain crates did or
  // against a wall. Broken walls are cut into slices that are never lower than
  // 1.7 m (a wall stays a wall: too high to vault, nothing opens through it),
  // and every pile's collision is the outline of its pieces.
  //
  // A corner of the Barracks' south wall has come down onto the west walkway.
  map.breakSolid(
    "room-barracks-wall-s-1",
    [1, 1, 1, 1, 1, 1, 0.82, 0.7, 0.7],
    // (No lower than 2.6 m: the footlocker stands by it, and a jump from the
    // footlocker would otherwise reach the top and leave the room.)
    2.6,
  );
  map.createPile("bricks", "bricks-barracks-fall", -23.2, -2.2, F, {
    minZ: -3.0,
  });
  // The Archive's south partition: an uneven top.
  // (No lower than 2.6 m: the sorting desk stands against it, and a body on the desk
  // and a jump would otherwise step over the low parts and out of the room.)
  map.breakSolid("room-archive-wall-s-2", [1, 0.8, 0.7, 0.9, 0.7, 0.75], 2.6);
  // The Hall's north wall.
  map.breakSolid("room-hall-wall-n-2", [1, 0.78, 0.92, 0.55, 0.8]);
  // The screen wall on the west terrace has partly collapsed.
  map.breakSolid("nook-west-1", [1, 1, 0.66, 0.66, 0.8, 1]);
  map.createPile("bricks", "bricks-nook-west", -26.3, 3.8, F, {
    minX: -27.1,
    maxZ: 5.0,
  });
  // The warehouse's parapet is chipped along its top.
  map.breakSolid(
    "parapet-warehouse-north-1",
    [1, 1, 0.8, 0.6, 0.9, 0.55, 0.7, 1, 1, 0.85],
    0.5,
  );

  // Two blocks of cover with a corner gone (the others stay whole).
  map.breakSolid("cover-overlook-b", [1, 1, 0.55], 0.45);
  map.breakSolid("cover-corner-balcony", [0.55, 1, 1], 0.45);

  // -------------------------------------------------------- exterior barriers
  // Most railings and barriers stay concrete (in three looks). A few are
  // re-dressed with the same footprint and the same body-blocking height, so
  // nothing about how they stop you changes: three as stacks of pipes, three as
  // brick with gaps and a ragged top. Beside them some rubble and a stack of
  // pipes by the generator.
  for (const id of ["rail-edge-north-3", "rail-bs-west-1", "rail-mp-west-1"]) {
    map.restyleBarrier(id, "pipes");
  }

  for (const id of ["rail-be-north-1", "rail-edge-west-1", "rail-bn-east-1"]) {
    map.restyleBarrier(id, "brick");
  }

  // Most of the plain concrete barriers are straight; these have a wavy top,
  // worn down in smooth curves, just slightly and only on three of them (a few
  // slow waves and one shallow bite). They stay railings: never lower than 55 cm, and
  // every part is still a wall to a body, a shot and a grenade at the height
  // it is drawn.
  {
    let seed = 20240611;
    const next = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return seed / 4294967296;
    };

    for (const id of [
      "rail-edge-south-1",
      "rail-bn-front-1",
      "rail-bw-front-1",
    ]) {
      const waves = [0, 1, 2].map(() => ({
        frequency: 1.5 + next() * 3.5,
        phase: next() * Math.PI * 2,
        amplitude: 0.015 + next() * 0.025,
      }));
      const bites = [0].map(() => ({
        at: 0.1 + next() * 0.8,
        width: 0.04 + next() * 0.06,
        depth: 0.1 + next() * 0.1,
      }));

      map.curveSolid(id, (t) => {
        let share = 0.95;

        for (const w of waves) {
          share +=
            Math.sin(t * w.frequency * Math.PI * 2 + w.phase) * w.amplitude;
        }

        for (const bite of bites) {
          share -= bite.depth * Math.exp(-(((t - bite.at) / bite.width) ** 2));
        }

        return share;
      });
    }
  }

  map.createPile("pipes", "pipes-generator", 23.6, -1.65, F, { minZ: -1.9 });
  map.createPile("rubble", "rubble-overlook-cover", 1.2, -8.4, F, {
    minZ: -9.1,
  });
  map.createPile("rubble", "rubble-balcony-east", 16.9, 8.8, F, { minZ: 8.0 });

  const layout = map.build();

  // The ventilation system under the arena floor: tunnels 2.4 m wide (the east
  // branch 1.8 m, to keep clear of the spawn areas), all on the 0.6 m grid, in
  // a T-shape: a long tunnel east-west under the north side, and a branch down
  // to the south at each end. The whole path is grated over (one grating per
  // tunnel), so it is seen from above and entered or left anywhere along it. It
  // stands on bare floor clear of the stairs and the spawn points.
  const tunnels = [
    // The long tunnel ends where the east branch begins, and the branch runs
    // from the long tunnel's top edge: a clean corner, no stub beyond it.
    { id: "vent-grate-long", minX: -13.2, maxX: 10.8, minZ: -9.6, maxZ: -7.8 },
    { id: "vent-grate-west", minX: -13.2, maxX: -11.4, minZ: -7.8, maxZ: 6 },
    { id: "vent-grate-east", minX: 10.8, maxX: 12.6, minZ: -9.6, maxZ: 9 },
  ];

  layout.vents = {
    id: "ground",
    surfaceY: 0,
    grates: tunnels.map((t) => ({
      id: t.id,
      x: (t.minX + t.maxX) / 2,
      z: (t.minZ + t.maxZ) / 2,
      halfX: (t.maxX - t.minX) / 2,
      halfZ: (t.maxZ - t.minZ) / 2,
    })),
    tunnels: [
      ...tunnels.map(({ minX, maxX, minZ, maxZ }) => ({
        minX,
        maxX,
        minZ,
        maxZ,
      })),
    ],
    // The foot of any ladder over the tunnels stays plain floor: 2 m square
    // round the spot you stand on to grab it, so E there is the ladder's.
    closed: layout.ladders
      .filter((ladder) =>
        tunnels.some(
          (t) =>
            ladder.approach.x > t.minX - 1.6 &&
            ladder.approach.x < t.maxX + 1.6 &&
            ladder.approach.z > t.minZ - 1.6 &&
            ladder.approach.z < t.maxZ + 1.6,
        ),
      )
      .map((ladder) => ({
        minX: ladder.approach.x - 1,
        maxX: ladder.approach.x + 1,
        minZ: ladder.approach.z - 1,
        maxZ: ladder.approach.z + 1,
      })),
  };

  // The ventilation system in the upper floor (4 m): a single narrow
  // block wide (1.2 m), grated flush in the floor over a 1.3 m crouch-only
  // tunnel. Two short routes, each a straight line in plan, from the walkway
  // ring into the rooms:
  //   south  a straight tunnel from inside the yard (z 21) north through its
  //          door and out onto the south walkway (z 12.6), then east
  //          along the walkway to x -3.8, where you stand to look west
  //   north  an L from the north walkway (x 6.4) west along its edge to the
  //          Archive's south door, then north through the door into the Archive
  // The grating is left as plain floor wherever something stands on it.
  const upperTunnels: Array<{
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    grated?: boolean;
  }> = [
    { minX: -13.6, maxX: -12.4, minZ: 12.6, maxZ: 21 },
    { minX: -13.6, maxX: -3.8, minZ: 13, maxZ: 14.2 },
    { minX: -9.2, maxX: 6.4, minZ: -13.6, maxZ: -12.4 },
    { minX: -8.6, maxX: -7.4, minZ: -21.6, maxZ: -13.6 },
  ];
  const standing = [
    ...layout.walls,
    ...layout.platforms.filter((p) => p.role !== "floor" && p.role !== "roof"),
  ].filter((w) => (w.bottom ?? 0) > F - 0.1 && (w.bottom ?? 0) < F + 0.6);
  const ladderSpots = layout.ladders.flatMap((l) => {
    const spots = [];

    if (Math.abs(l.topY - F) < 0.05) spots.push(l.exit, l.approach);
    if (Math.abs(l.bottomY - F) < 0.05) spots.push(l.approach, l.exit);

    return spots.map((p) => ({
      minX: p.x - 1,
      maxX: p.x + 1,
      minZ: p.z - 1,
      maxZ: p.z + 1,
    }));
  });

  layout.upperVents = {
    id: "upper",
    surfaceY: F,
    grates: upperTunnels.map((t, i) => ({
      id: `vent-upper-${i}`,
      x: (t.minX + t.maxX) / 2,
      z: (t.minZ + t.maxZ) / 2,
      halfX: (t.maxX - t.minX) / 2,
      halfZ: (t.maxZ - t.minZ) / 2,
    })),
    tunnels: upperTunnels,
    // Plain floor under anything that stands on the ring (walls, railings,
    // cover) and at the head and foot of a ladder.
    closed: [
      ...standing.map((w) => ({
        minX: w.minX,
        maxX: w.maxX,
        minZ: w.minZ,
        maxZ: w.maxZ,
      })),
      ...ladderSpots,
    ],
  };

  addWeathering(layout);

  // Last: the rooftop lamps' wiring, and the debris (which keeps off the vent grates).
  furnishRoofWiring(map);
  furnishMessyWiring(map);
  furnishPowerFeeds(map);
  furnishDebris(map);

  // Fixed spots, two in each spawn area on the ground floor, on the open
  // stretch between the stairs, the cover and the lamp post, each facing the
  // staircase out (north-west: east, to its stairs; north-east: west).
  layout.spawnPoints = [
    spawn(1, -27.4, -20.9, -21, -15.8),
    spawn(2, -24.2, -20.4, -21, -15.8),
    spawn(3, 25.4, -20.7, 22, -14.3),
    spawn(4, 28.2, -19.9, 22, -14.3),
  ];

  return layout;
}

export const ARENA_LAYOUT: ArenaLayout = createUpperFloor();
