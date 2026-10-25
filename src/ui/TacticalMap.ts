import type {
  ArenaLayout,
  DoorDefinition,
  RoomDefinition,
  StairsDefinition,
} from "../world/ArenaLayout";
import type { DoorPassage } from "../world/DoorPassage";

/**
 * The M-key tactical map: a dark top-down plan of the real level, in the manner
 * of a competitive shooter's minimap. It is drawn once from the layout (rooms,
 * door gaps, stairs, ladders, vents, the bridge), so it can never disagree with
 * the level, and only the markers move after that.
 *
 * Plan north is up, the world's -z, and the plan is not turned to the player:
 * a place is always in the same spot. One transform (`sx` / `sz`) places the
 * rooms, the local player and every teammate, so they all line up.
 *
 * Markers: the local player is a light arrow facing the camera's horizontal
 * heading (pitch is never used); teammates are small cyan arrows read from a
 * feed the game supplies. The overlay is only drawn: it never takes a key, the
 * mouse or the pointer.
 */

/** One friendly player, as the game's synchronised state describes them. */
export interface TeamMarker {
  /** A stable id (the same player is always the same marker). */
  id: string;
  name?: string;
  x: number;
  y: number;
  z: number;
  /** Camera yaw in radians (0 looks along -z, like the local player's). */
  yaw: number;
  /** False while down or out: no marker (a respawn brings it back). */
  alive: boolean;
}

export type TeammateSource = () => readonly TeamMarker[];

const W = 1200;
const H = 900;
/** Sheet pixels per metre, and where the plan's top-left corner is on the sheet. */
const SCALE = 18;
const PLAN_X = 24;
const PLAN_Y = 24;

/** The ground inside the perimeter: a little see-through, so the map floats on the game. */
const OPEN_GROUND = "rgba(14, 18, 23, 0.94)";
const DECK = "#171d24";
const BRIDGE = "#2b3641";
/** Room fills: dark slate, blue-gray, desaturated teal, purple-gray. */
const ROOM_FILLS = ["#1c242d", "#1f2a37", "#1b2b2e", "#251f2d"];
const GROUND_ROOM = "#1a2c2f";
const WALL = "#78828e";
const EDGE = "#a3adb9";
const NAME = "#c5cfdb";
const VENT = "rgba(63, 190, 205, 0.62)";
const STAIR = "#59636f";
const BLOCKED = "#a8403f";
const FRIEND = "#3cc8d4";
const SELF = "#f1f4f7";

const OPEN_MS = 180;
const CLOSE_MS = 140;
/** Seconds for a teammate marker to close 1/e of its gap to the latest report. */
const FOLLOW_TIME = 0.06;
/** A report this far (metres) from the marker is a respawn or teleport: snap. */
const SNAP_DISTANCE = 6;
/** Markers closer than this on the sheet (pixels) get their names shown. */
const NAME_NEAR = 46;

const SVG = "http://www.w3.org/2000/svg";

/** Sheet position of a world point (the one transform for everything). */
const sx = (x: number, layout: ArenaLayout): number =>
  PLAN_X + (x + layout.width / 2) * SCALE;
const sz = (z: number, layout: ArenaLayout): number =>
  PLAN_Y + (z + layout.depth / 2) * SCALE;

/** A short label for a room, from its name and id. */
function label(room: RoomDefinition): string {
  if (room.id === "room-spawn-nw") return "SPAWN";
  if (room.id === "room-switch") return "POWER";
  if (room.id === "room-archive") return "JUNK ROOM";

  return room.name.replace(/\s*\(.*\)\s*/, "").toUpperCase();
}

function fillFor(room: RoomDefinition): string {
  if (room.floorY < 1) {
    return GROUND_ROOM;
  }

  let hash = 0;

  for (let i = 0; i < room.id.length; i++) {
    hash = (hash * 31 + room.id.charCodeAt(i)) >>> 0;
  }

  return ROOM_FILLS[hash % ROOM_FILLS.length];
}

function drawDoor(
  ctx: CanvasRenderingContext2D,
  room: RoomDefinition,
  door: DoorDefinition,
  layout: ArenaLayout,
  passage: DoorPassage,
): void {
  const alongX = door.side === "n" || door.side === "s";
  const x = alongX
    ? sx(door.at, layout)
    : sx(door.side === "w" ? room.minX : room.maxX, layout);
  const y = alongX
    ? sz(door.side === "n" ? room.minZ : room.maxZ, layout)
    : sz(door.at, layout);
  const len = door.width * SCALE;
  const gap = 8;

  // A real gap in the wall: the wall's outline is cleared across the opening.
  ctx.fillStyle = fillFor(room);
  ctx.fillRect(
    alongX ? x - len / 2 : x - gap / 2,
    alongX ? y - gap / 2 : y - len / 2,
    alongX ? len : gap,
    alongX ? gap : len,
  );

  // Brighter jambs mark the passage.
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 2;

  for (const end of [-1, 1]) {
    ctx.beginPath();

    if (alongX) {
      ctx.moveTo(x + end * (len / 2), y - 4);
      ctx.lineTo(x + end * (len / 2), y + 4);
    } else {
      ctx.moveTo(x - 4, y + end * (len / 2));
      ctx.lineTo(x + 4, y + end * (len / 2));
    }

    ctx.stroke();
  }

  if (passage === "open") {
    return;
  }

  // Shut (a closed shutter, stock across it) is a red bar; a crawl hole is a
  // dashed one.
  ctx.strokeStyle = passage === "sealed" ? BLOCKED : EDGE;
  ctx.lineWidth = passage === "sealed" ? 3 : 1.6;
  ctx.setLineDash(passage === "sealed" ? [] : [4, 3]);
  ctx.beginPath();

  if (alongX) {
    ctx.moveTo(x - len / 2, y);
    ctx.lineTo(x + len / 2, y);
  } else {
    ctx.moveTo(x, y - len / 2);
    ctx.lineTo(x, y + len / 2);
  }

  ctx.stroke();
  ctx.setLineDash([]);
}

function drawStairs(
  ctx: CanvasRenderingContext2D,
  stairs: StairsDefinition,
  layout: ArenaLayout,
): void {
  const alongX = stairs.direction.endsWith("x");
  const sign = stairs.direction.startsWith("+") ? 1 : -1;
  const from = stairs.start;
  const to = stairs.start + sign * stairs.tread * stairs.steps;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const x0 = alongX ? sx(lo, layout) : sx(stairs.crossMin, layout);
  const x1 = alongX ? sx(hi, layout) : sx(stairs.crossMax, layout);
  const y0 = alongX ? sz(stairs.crossMin, layout) : sz(lo, layout);
  const y1 = alongX ? sz(stairs.crossMax, layout) : sz(hi, layout);

  ctx.strokeStyle = STAIR;
  ctx.lineWidth = 1;

  for (let i = 0; i <= stairs.steps; i++) {
    const t = i / stairs.steps;

    ctx.beginPath();

    if (alongX) {
      ctx.moveTo(x0 + (x1 - x0) * t, y0);
      ctx.lineTo(x0 + (x1 - x0) * t, y1);
    } else {
      ctx.moveTo(x0, y0 + (y1 - y0) * t);
      ctx.lineTo(x1, y0 + (y1 - y0) * t);
    }

    ctx.stroke();
  }

  // A small arrow up the flight.
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const dx = alongX ? sign : 0;
  const dy = alongX ? 0 : sign;

  ctx.fillStyle = EDGE;
  ctx.beginPath();
  ctx.moveTo(cx + dx * 7, cy + dy * 7);
  ctx.lineTo(cx - dx * 5 - dy * 5, cy - dy * 5 - dx * 5);
  ctx.lineTo(cx - dx * 5 + dy * 5, cy - dy * 5 + dx * 5);
  ctx.closePath();
  ctx.fill();
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  size: number,
): void {
  let px = size;

  ctx.font = `600 ${px}px "Segoe UI", Inter, Arial, sans-serif`;

  while (px > 9 && ctx.measureText(text).width > width) {
    px -= 1;
    ctx.font = `600 ${px}px "Segoe UI", Inter, Arial, sans-serif`;
  }
}

/** Draws the whole plan (everything but the players) from the layout. */
export function drawTacticalSheet(
  ctx: CanvasRenderingContext2D,
  layout: ArenaLayout,
  passage: (room: RoomDefinition, door: DoorDefinition) => DoorPassage = () =>
    "open",
): void {
  // No backing panel: the plan is drawn straight onto the game.
  ctx.clearRect(0, 0, W, H);

  // The open ground inside the perimeter.
  const ax = sx(-layout.width / 2, layout);
  const ay = sz(-layout.depth / 2, layout);
  const aw = layout.width * SCALE;
  const ah = layout.depth * SCALE;

  ctx.fillStyle = OPEN_GROUND;
  ctx.fillRect(ax, ay, aw, ah);

  // Vents run under the floors: a quiet dashed line.
  ctx.strokeStyle = VENT;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);

  for (const network of [layout.vents, layout.upperVents]) {
    for (const t of network.tunnels) {
      ctx.strokeRect(
        sx(t.minX, layout),
        sz(t.minZ, layout),
        (t.maxX - t.minX) * SCALE,
        (t.maxZ - t.minZ) * SCALE,
      );
    }
  }

  ctx.setLineDash([]);

  // Walkways, decks, balconies: the upper floor's open routes.
  for (const zone of [...layout.zones].sort((a, b) => a.floorY - b.floorY)) {
    const x = sx(zone.minX, layout);
    const y = sz(zone.minZ, layout);
    const w = (zone.maxX - zone.minX) * SCALE;
    const h = (zone.maxZ - zone.minZ) * SCALE;

    ctx.fillStyle = zone.floorY > 0 ? DECK : OPEN_GROUND;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#2c353f";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x, y, w, h);
  }

  // Rooms: a fill each, and a solid wall.
  const rooms = [...layout.rooms].sort((a, b) => a.floorY - b.floorY);

  for (const room of rooms) {
    const x = sx(room.minX, layout);
    const y = sz(room.minZ, layout);
    const w = (room.maxX - room.minX) * SCALE;
    const h = (room.maxZ - room.minZ) * SCALE;

    ctx.fillStyle = fillFor(room);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = WALL;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
  }

  for (const room of rooms) {
    for (const door of room.doors) {
      drawDoor(ctx, room, door, layout, passage(room, door));
    }
  }

  for (const stairs of layout.stairs) {
    drawStairs(ctx, stairs, layout);
  }

  // Raised bridges and catwalks (they pass over the floor below).
  for (const p of layout.platforms) {
    if (p.role !== "catwalk") {
      continue;
    }

    const x = sx(p.minX, layout);
    const y = sz(p.minZ, layout);
    const w = (p.maxX - p.minX) * SCALE;
    const h = (p.maxZ - p.minZ) * SCALE;

    ctx.fillStyle = BRIDGE;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x, y, w, h);

    if (p.id === "catwalk-east") {
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = NAME;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      fitText(ctx, "BRIDGE", h - 10, 11);
      ctx.fillText("BRIDGE", 0, 0);
      ctx.restore();
    }
  }

  // Ladders: a short rail with a rung or two, on the face they climb.
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 1.5;

  for (const ladder of layout.ladders) {
    if (ladder.secret) {
      continue;
    }

    const alongZ = ladder.normal.endsWith("x");
    const x = sx(ladder.x, layout);
    const y = sz(ladder.z, layout);
    const half = (ladder.width * SCALE) / 2;

    ctx.beginPath();

    if (alongZ) {
      ctx.moveTo(x, y - half);
      ctx.lineTo(x, y + half);
    } else {
      ctx.moveTo(x - half, y);
      ctx.lineTo(x + half, y);
    }

    ctx.stroke();

    for (const k of [-0.5, 0.5]) {
      ctx.beginPath();

      if (alongZ) {
        ctx.moveTo(x - 3, y + k * half * 2);
        ctx.lineTo(x + 3, y + k * half * 2);
      } else {
        ctx.moveTo(x + k * half * 2, y - 3);
        ctx.lineTo(x + k * half * 2, y + 3);
      }

      ctx.stroke();
    }
  }

  // Room names.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = NAME;

  for (const room of rooms) {
    const text = label(room);

    fitText(ctx, text, (room.maxX - room.minX) * SCALE - 14, 13);

    if (ctx.measureText(text).width <= (room.maxX - room.minX) * SCALE - 8) {
      ctx.fillText(
        text,
        sx((room.minX + room.maxX) / 2, layout),
        sz((room.minZ + room.maxZ) / 2, layout),
      );
    }
  }

  ctx.fillStyle = "rgba(154,166,179,0.2)";
  fitText(ctx, "OPEN GROUND", 160, 12);
  ctx.fillText("OPEN GROUND", sx(0, layout), sz(0, layout));
}

/** A player marker's outline: an arrow pointing up, turned by its group. */
function arrow(size: number, fill: string, stroke: string): SVGPathElement {
  const path = document.createElementNS(SVG, "path");
  const s = size;

  path.setAttribute(
    "d",
    `M0,${-s} L${s * 0.72},${s * 0.78} L0,${s * 0.38} L${-s * 0.72},${s * 0.78} Z`,
  );
  path.setAttribute("fill", fill);
  path.setAttribute("stroke", stroke);
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linejoin", "round");

  return path;
}

interface Teammate {
  group: SVGGElement;
  name: SVGTextElement;
  /** Where the marker is drawn (smoothed) and where the last report put it. */
  x: number;
  z: number;
  yaw: number;
  label: string;
}

/**
 * The overlay: the plan on a canvas, with a thin SVG on top for the players.
 * `update` runs every frame while the game does and only moves markers (and
 * only while the map is open).
 */
export class TacticalMap {
  private readonly root = document.createElement("div");
  private readonly svg: SVGSVGElement;
  private readonly self: SVGGElement;
  private readonly layout: ArenaLayout;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly passage?: (
    room: RoomDefinition,
    door: DoorDefinition,
  ) => DoorPassage;
  private readonly teammates = new Map<string, Teammate>();
  private teammateSource: TeammateSource = () => [];
  private opened = false;
  private closeTimer = 0;
  private lastKey = "";
  private lastTime = 0;
  private needsSnap = true;

  constructor(
    parent: HTMLElement,
    layout: ArenaLayout,
    passage?: (room: RoomDefinition, door: DoorDefinition) => DoorPassage,
  ) {
    this.layout = layout;
    this.passage = passage;

    const canvas = document.createElement("canvas");

    canvas.width = W;
    canvas.height = H;
    canvas.className = "tactical-map-sheet";
    this.context = canvas.getContext("2d");
    this.redraw();

    this.svg = document.createElementNS(SVG, "svg");
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this.svg.setAttribute("class", "tactical-map-marker");

    this.self = document.createElementNS(SVG, "g");

    const cone = document.createElementNS(SVG, "path");
    // A wedge 42 sheet pixels long, 28 degrees either side of straight up.
    const spread = (28 * Math.PI) / 180;
    const r = 42;

    cone.setAttribute(
      "d",
      `M0,0 L${(-Math.sin(spread) * r).toFixed(1)},${(-Math.cos(spread) * r).toFixed(1)} A${r},${r} 0 0 1 ${(Math.sin(spread) * r).toFixed(1)},${(-Math.cos(spread) * r).toFixed(1)} Z`,
    );
    cone.setAttribute("fill", "rgba(241,244,247,0.09)");
    this.self.append(cone, arrow(13, SELF, "#0a0c0f"));
    this.svg.append(this.self);

    this.root.className = "tactical-map";
    this.root.setAttribute("aria-hidden", "true");
    this.root.append(canvas, this.svg);
    parent.append(this.root);
  }

  public get isOpen(): boolean {
    return this.opened;
  }

  /** Where the friendly players come from (the game's synchronised state). */
  public setTeammateSource(source: TeammateSource): void {
    this.teammateSource = source;
  }

  /** Draws the plan again (a door or shutter may have opened since). */
  private redraw(): void {
    if (this.context) {
      drawTacticalSheet(this.context, this.layout, this.passage);
    }
  }

  public toggle(): void {
    this.setOpen(!this.opened);
  }

  public setOpen(open: boolean): void {
    if (open === this.opened) {
      return;
    }

    this.opened = open;
    window.clearTimeout(this.closeTimer);

    if (open) {
      this.redraw();
      // Markers start where the players are now, not sliding in from where
      // they were when it was last open.
      this.needsSnap = true;
      this.root.style.setProperty("--map-ms", `${OPEN_MS}ms`);
      this.root.classList.add("shown");
      // Next frame, so the closed state is drawn first and the fade plays.
      requestAnimationFrame(() => {
        if (this.opened) {
          this.root.classList.add("open");
        }
      });
    } else {
      this.root.style.setProperty("--map-ms", `${CLOSE_MS}ms`);
      this.root.classList.remove("open");
      this.closeTimer = window.setTimeout(() => {
        if (!this.opened) {
          this.root.classList.remove("shown");
        }
      }, CLOSE_MS);
    }
  }

  /**
   * Moves the markers: the local player (world x, z) facing `yaw` (the
   * camera's, in radians; 0 looks along -z, and only the horizontal heading
   * matters), and every teammate the feed reports. `now` is in seconds.
   */
  public update(x: number, z: number, yaw: number, now: number): void {
    if (!this.opened) {
      return;
    }

    const dt = Math.min(Math.max(now - this.lastTime, 0), 0.25);

    this.lastTime = now;

    const px = sx(x, this.layout);
    const py = sz(z, this.layout);
    // The plan's up is the world's -z, and yaw 0 looks that way: the marker
    // turns the opposite way round to the yaw (which grows toward -x).
    const degrees = (-yaw * 180) / Math.PI;
    const key = `${px.toFixed(1)}|${py.toFixed(1)}|${degrees.toFixed(1)}`;

    if (key !== this.lastKey) {
      this.lastKey = key;
      this.self.setAttribute(
        "transform",
        `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${degrees.toFixed(1)})`,
      );
    }

    this.updateTeammates(dt, px, py);
    this.needsSnap = false;
  }

  private updateTeammates(dt: number, selfX: number, selfY: number): void {
    const seen = new Set<string>();
    const follow = 1 - Math.exp(-dt / FOLLOW_TIME);

    for (const report of this.teammateSource()) {
      // One marker per id, however many times it is reported; none while down.
      if (!report.alive || seen.has(report.id)) {
        continue;
      }

      seen.add(report.id);

      const tx = sx(report.x, this.layout);
      const tz = sz(report.z, this.layout);
      let mate = this.teammates.get(report.id);

      if (!mate) {
        const group = document.createElementNS(SVG, "g");
        const name = document.createElementNS(SVG, "text");

        name.setAttribute("fill", FRIEND);
        name.setAttribute("font-size", "13");
        name.setAttribute("font-weight", "600");
        name.setAttribute(
          "font-family",
          "'Segoe UI', Inter, Arial, sans-serif",
        );
        name.setAttribute("text-anchor", "middle");
        name.setAttribute("y", "-14");
        const wedge = document.createElementNS(SVG, "path");

        // A short, faint wedge: where they face, without crowding the map.
        wedge.setAttribute("d", "M0,0 L-9,-24 A26,26 0 0 1 9,-24 Z");
        wedge.setAttribute("fill", "rgba(60,200,212,0.14)");
        group.append(wedge, arrow(10, FRIEND, "#0a0c0f"), name);
        this.svg.append(group);
        mate = { group, name, x: tx, z: tz, yaw: report.yaw, label: "" };
        this.teammates.set(report.id, mate);
      }

      mate.yaw = report.yaw;
      mate.label = report.name ?? "";

      // A respawn or teleport is not a slide across the map.
      if (
        this.needsSnap ||
        Math.hypot(tx - mate.x, tz - mate.z) > SNAP_DISTANCE * SCALE
      ) {
        mate.x = tx;
        mate.z = tz;
      } else {
        mate.x += (tx - mate.x) * follow;
        mate.z += (tz - mate.z) * follow;
      }
    }

    // Anyone no longer reported has left or is down: their marker goes.
    for (const [id, mate] of this.teammates) {
      if (!seen.has(id)) {
        mate.group.remove();
        this.teammates.delete(id);
      }
    }

    // Names only where markers are near enough to confuse.
    const marks = [...this.teammates.values()];

    for (const mate of marks) {
      const degrees = (-mate.yaw * 180) / Math.PI;

      mate.group.setAttribute(
        "transform",
        `translate(${mate.x.toFixed(1)} ${mate.z.toFixed(1)}) rotate(${degrees.toFixed(1)})`,
      );

      const crowded =
        Math.hypot(mate.x - selfX, mate.z - selfY) < NAME_NEAR ||
        marks.some(
          (other) =>
            other !== mate &&
            Math.hypot(mate.x - other.x, mate.z - other.z) < NAME_NEAR,
        );
      const text = crowded ? mate.label : "";

      if (mate.name.textContent !== text) {
        mate.name.textContent = text;
      }

      // (The name stays upright whichever way the arrow faces, and two near
      // each other sit one above and one below so they do not overprint.)
      const below = marks.indexOf(mate) % 2 === 1;

      mate.name.setAttribute(
        "transform",
        `rotate(${(-degrees).toFixed(1)}) translate(0 ${below ? 38 : 0})`,
      );
    }
  }

  /** How many teammate markers are showing (for tests). */
  public get teammateCount(): number {
    return this.teammates.size;
  }

  public dispose(): void {
    window.clearTimeout(this.closeTimer);
    this.teammates.clear();
    this.root.remove();
  }
}
