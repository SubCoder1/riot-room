import type {
  ArenaLayout,
  DoorDefinition,
  RoomDefinition,
} from "../world/ArenaLayout";
import type { DoorPassage } from "../world/DoorPassage";
import {
  H,
  W,
  drawTacticalSheet,
  sx,
  sz,
  type TeammateSource,
} from "./TacticalMap";

/**
 * The corner minimap: a round, zoomed-in window on the M-key map's own plan,
 * turned so the way you face is up, with you at the centre.
 *
 * The plan is drawn once by `drawTacticalSheet` (the same layout and the same
 * world-to-plan transform `sx` / `sz`, in its compact form) onto an off-screen
 * canvas; each change of pose then only paints a window of it, rotated, with
 * the markers on top. It shows the local player and teammates only: no enemies.
 *
 * It is client-side presentation: it reads the local player's pose and the
 * teammate feed the game already has, and sends nothing.
 */

/** Plan pixels the circle shows across its diameter (the plan is 18 per metre). */
const VIEW_PLAN_PIXELS = 268;
/** Backing size of the visible canvas (the page scales it to the corner size). */
const SIZE = 460;
/** Plan pixels to canvas pixels. */
const ZOOM = SIZE / VIEW_PLAN_PIXELS;

const SELF = "#f4f6f8";
const FRIEND = "#4aa8d8";
const OUTLINE = "rgba(8, 10, 13, 0.92)";
/** A teammate this far above or below you is on another floor: drawn faint. */
const OTHER_FLOOR = 2.5;
/** Seconds between looks at the doors (a shutter or stock may have moved). */
const DOOR_CHECK = 0.5;

/** An arrow pointing up (the marker's heading), centred on the origin. */
function arrow(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.72, size * 0.78);
  ctx.lineTo(0, size * 0.38);
  ctx.lineTo(-size * 0.72, size * 0.78);
  ctx.closePath();
}

export class Minimap {
  private readonly root = document.createElement("div");
  private readonly view = document.createElement("canvas");
  /** The whole plan, drawn once (and again when a door changes). */
  private readonly plan = document.createElement("canvas");
  private readonly layout: ArenaLayout;
  private readonly passage?: (
    room: RoomDefinition,
    door: DoorDefinition,
  ) => DoorPassage;
  private teammateSource: TeammateSource = () => [];
  private lastKey = "";
  private doorKey = "";
  private sinceDoorCheck = DOOR_CHECK;
  private shown = true;

  constructor(
    parent: HTMLElement,
    layout: ArenaLayout,
    passage?: (room: RoomDefinition, door: DoorDefinition) => DoorPassage,
  ) {
    this.layout = layout;
    this.passage = passage;

    this.view.width = SIZE;
    this.view.height = SIZE;
    this.plan.width = W;
    this.plan.height = H;

    this.root.className = "minimap";
    this.root.setAttribute("aria-hidden", "true");
    this.root.append(this.view);
    parent.append(this.root);
    this.drawPlan();
  }

  /** Where the friendly players come from (the game's synchronised state). */
  public setTeammateSource(source: TeammateSource): void {
    this.teammateSource = source;
  }

  /** Hidden while the full map is up (they would show the same thing twice). */
  public setVisible(visible: boolean): void {
    if (visible !== this.shown) {
      this.shown = visible;
      this.root.classList.toggle("hidden", !visible);
    }
  }

  private drawPlan(): void {
    const ctx = this.plan.getContext("2d");

    if (!ctx) {
      return;
    }

    drawTacticalSheet(ctx, this.layout, this.passage, undefined, true);
    // The window must be painted again from the new plan.
    this.lastKey = "";
  }

  /** The doors as they stand, as one string (to see when the plan is stale). */
  private doorState(): string {
    if (!this.passage) {
      return "";
    }

    let key = "";

    for (const room of this.layout.rooms) {
      for (const door of room.doors) {
        key += this.passage(room, door)[0];
      }
    }

    return key;
  }

  /**
   * Moves the window and the markers: the local player at world (x, y, z)
   * facing `yaw` (radians; 0 looks along -z, only the horizontal heading is
   * used), and the teammates the feed reports. `dt` is in seconds.
   */
  public update(
    x: number,
    y: number,
    z: number,
    yaw: number,
    dt: number,
  ): void {
    if (!this.shown) {
      return;
    }

    this.sinceDoorCheck += dt;

    if (this.sinceDoorCheck >= DOOR_CHECK) {
      this.sinceDoorCheck = 0;

      const doors = this.doorState();

      if (doors !== this.doorKey) {
        this.doorKey = doors;
        this.drawPlan();
      }
    }

    const mates = this.teammateSource().filter((m) => m.alive);
    const px = sx(x, this.layout);
    const py = sz(z, this.layout);
    let key = `${px.toFixed(1)}|${py.toFixed(1)}|${yaw.toFixed(3)}`;

    for (const m of mates) {
      key += `|${m.id}:${sx(m.x, this.layout).toFixed(1)},${sz(m.z, this.layout).toFixed(1)},${m.yaw.toFixed(2)},${Math.abs(m.y - y) > OTHER_FLOOR ? 1 : 0}`;
    }

    // Nothing moved: what is on the canvas is already right.
    if (key === this.lastKey) {
      return;
    }

    this.lastKey = key;

    const ctx = this.view.getContext("2d");

    if (!ctx) {
      return;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    // You at the centre; the plan turned by the yaw so your heading is up.
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.rotate(yaw);
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-px, -py);
    ctx.drawImage(this.plan, 0, 0);

    ctx.lineJoin = "round";
    ctx.lineWidth = 1.6 / ZOOM;
    ctx.strokeStyle = OUTLINE;

    // Teammates ride in the plan's own frame (their heading turns with it).
    for (const m of mates) {
      ctx.save();
      ctx.globalAlpha = Math.abs(m.y - y) > OTHER_FLOOR ? 0.4 : 1;
      ctx.translate(sx(m.x, this.layout), sz(m.z, this.layout));
      ctx.rotate(-m.yaw);
      arrow(ctx, 8.5 / ZOOM);
      ctx.fillStyle = FRIEND;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

    // You: always at the centre, always pointing up, over a faint view cone.
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);

    const spread = (32 * Math.PI) / 180;

    ctx.fillStyle = "rgba(244, 246, 248, 0.12)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, SIZE * 0.3, -Math.PI / 2 - spread, -Math.PI / 2 + spread);
    ctx.closePath();
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = OUTLINE;
    arrow(ctx, 15);
    ctx.fillStyle = SELF;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  public dispose(): void {
    this.root.remove();
  }
}
