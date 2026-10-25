import * as THREE from "three";

import {
  stairsToSteps,
  type ArenaLayout,
  type DoorDefinition,
  type PosterDefinition,
  type RoomDefinition,
  type StairsDefinition,
} from "./ArenaLayout";

/**
 * The facility site plan on the spawn-area walls: a worn printed drafting
 * sheet drawn from the real layout (rooms, doors, the arena, stairs, the
 * sealed door, the power room, this area's spawn points), so it never
 * contradicts the map. It is a physical poster on a wall, not a map UI.
 */

/** The sheet is drawn in these units and rendered at TEXTURE_SCALE times. */
const W = 1600;
const H = 1200;
const TEXTURE_SCALE = 1.28;

// Plan placement on the sheet (plan metres to sheet units).
const PLAN_X = 84;
const PLAN_Y = 176;
const PLAN_SCALE = 18.7;
const PLAN_MIN_X = -32;
const PLAN_MIN_Z = -24;

// A restrained palette: warm paper, charcoal ink, one industrial red.
const PAPER = "#d4cbb4";
const PASSAGE = "#c4bba2";
const ROOM = "#dcd4be";
const ROOM_HERE = "#e3cdb2";
const ARENA = "#b8ae92";
const STAIR = "#ece5d1";
const INK = "#22201c";
const RED = "#9d2f27";
const CREAM = "#f0e8d2";

/** A short label for a room, from its name and id. */
function label(room: RoomDefinition): string {
  if (room.id === "room-spawn-nw") return "SPAWN NW";
  if (room.id === "room-switch") return "POWER ROOM";

  return room.name.replace(/\s*\(.*\)\s*/, "").toUpperCase();
}

const X = (x: number): number => PLAN_X + (x - PLAN_MIN_X) * PLAN_SCALE;
const Z = (z: number): number => PLAN_Y + (z - PLAN_MIN_Z) * PLAN_SCALE;

/** The inward direction of a room's wall, and the direction along it. */
const WALL = {
  n: { nx: 0, nz: 1, ax: 1, az: 0 },
  s: { nx: 0, nz: -1, ax: 1, az: 0 },
  e: { nx: -1, nz: 0, ax: 0, az: 1 },
  w: { nx: 1, nz: 0, ax: 0, az: 1 },
} as const;

function rectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
}

/** A door in a room's wall: the gap, the jambs, and the leaf (or leaves) with their swing. */
function drawDoor(
  ctx: CanvasRenderingContext2D,
  room: RoomDefinition,
  door: DoorDefinition,
  index: number,
): void {
  const wall = WALL[door.side];
  const cx =
    door.side === "e"
      ? X(room.maxX)
      : door.side === "w"
        ? X(room.minX)
        : X(door.at);
  const cz =
    door.side === "n"
      ? Z(room.minZ)
      : door.side === "s"
        ? Z(room.maxZ)
        : Z(door.at);
  const len = door.width * PLAN_SCALE;
  const thick = 13;

  // Clear the wall across the opening.
  ctx.fillStyle = ROOM;
  ctx.fillRect(
    cx - (wall.ax * len + wall.nx * thick) / 2,
    cz - (wall.az * len + wall.nz * thick) / 2,
    Math.abs(wall.ax) * len + Math.abs(wall.nx) * thick,
    Math.abs(wall.az) * len + Math.abs(wall.nz) * thick,
  );

  // Jambs.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;

  for (const end of [-1, 1]) {
    const jx = cx + wall.ax * end * (len / 2);
    const jz = cz + wall.az * end * (len / 2);

    ctx.beginPath();
    ctx.moveTo(jx - wall.nx * 7, jz - wall.nz * 7);
    ctx.lineTo(jx + wall.nx * 7, jz + wall.nz * 7);
    ctx.stroke();
  }

  // Leaves: one for a single door, two meeting in the middle for a wide one.
  const leaves =
    door.width >= 3
      ? [
          { sign: -1, r: len / 2 },
          { sign: 1, r: len / 2 },
        ]
      : [
          {
            sign: (index + door.side.charCodeAt(0)) % 2 === 0 ? -1 : 1,
            r: len,
          },
        ];

  ctx.lineWidth = 1.6;

  for (const leaf of leaves) {
    // The hinge sits on the leaf's own end, the leaf swings into the room.
    const hx = cx + wall.ax * leaf.sign * (len / 2);
    const hz = cz + wall.az * leaf.sign * (len / 2);
    const dirX = -wall.ax * leaf.sign;
    const dirZ = -wall.az * leaf.sign;
    const from = Math.atan2(dirZ, dirX);
    const to = Math.atan2(wall.nz, wall.nx);
    const cross = dirX * wall.nz - dirZ * wall.nx;

    ctx.beginPath();
    ctx.arc(hx, hz, leaf.r, from, to, cross < 0);
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx, hz);
    ctx.lineTo(hx + wall.nx * leaf.r, hz + wall.nz * leaf.r);
    ctx.stroke();
    ctx.lineWidth = 1.6;
  }
}

/** Faint furnishing outlines in the room's outer bands, clear of its name. */
function drawFurniture(
  ctx: CanvasRenderingContext2D,
  room: RoomDefinition,
  x0: number,
  z0: number,
  w: number,
  h: number,
): void {
  ctx.strokeStyle = "rgba(34,32,28,0.42)";
  ctx.fillStyle = "rgba(34,32,28,0.1)";
  ctx.lineWidth = 1.6;

  const box = (x: number, y: number, bw: number, bh: number): void => {
    ctx.fillRect(x, y, bw, bh);
    ctx.strokeRect(x, y, bw, bh);
  };
  const row = (
    x: number,
    y: number,
    count: number,
    bw: number,
    bh: number,
    gap: number,
  ): void => {
    for (let i = 0; i < count; i++) {
      box(x + i * (bw + gap), y, bw, bh);
    }
  };

  const pad = 12;

  switch (room.id) {
    case "room-archive":
      // Long shelf runs along both sides.
      row(x0 + pad, z0 + 10, Math.floor((w - 2 * pad) / 15), 14, 11, 1);
      row(x0 + pad, z0 + h - 21, Math.floor((w - 2 * pad) / 15), 14, 11, 1);
      break;
    case "room-server":
      row(x0 + pad, z0 + 9, 6, 20, 12, 5);
      row(x0 + pad, z0 + h - 21, 6, 20, 12, 5);
      break;
    case "room-barracks":
      row(x0 + pad, z0 + 9, 5, 28, 13, 8);
      row(x0 + pad, z0 + h - 22, 5, 28, 13, 8);
      break;
    case "room-armory":
      row(x0 + pad, z0 + h - 20, 7, 26, 11, 4);
      row(x0 + 9, z0 + 12, 1, 12, 36, 0);
      break;
    case "room-warehouse":
      row(x0 + pad, z0 + 10, 5, 34, 24, 10);
      row(x0 + pad + 20, z0 + h - 36, 4, 36, 26, 14);
      break;
    case "room-workshop":
      row(x0 + pad, z0 + 8, 8, 40, 12, 24);
      row(x0 + pad, z0 + h - 22, 8, 40, 12, 24);
      break;
    case "room-break":
      row(x0 + pad, z0 + h - 24, 3, 36, 14, 14);
      break;
    case "room-yard":
      row(x0 + 12, z0 + h - 28, 3, 30, 18, 14);
      break;
    default:
      break;
  }
}

/** Stair treads with a rising arrow and a name plate. */
function drawStairs(
  ctx: CanvasRenderingContext2D,
  stairs: StairsDefinition,
): void {
  const steps = stairsToSteps(stairs);
  const minX = Math.min(...steps.map((s) => s.minX));
  const maxX = Math.max(...steps.map((s) => s.maxX));
  const minZ = Math.min(...steps.map((s) => s.minZ));
  const maxZ = Math.max(...steps.map((s) => s.maxZ));
  const across = stairs.direction.endsWith("x");
  const forward = stairs.direction.startsWith("+");
  const x = X(minX);
  const y = Z(minZ);
  const w = (maxX - minX) * PLAN_SCALE;
  const h = (maxZ - minZ) * PLAN_SCALE;

  ctx.fillStyle = STAIR;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;

  for (let i = 1; i < stairs.steps; i++) {
    ctx.beginPath();

    if (across) {
      const tx = x + (w * i) / stairs.steps;

      ctx.moveTo(tx, y);
      ctx.lineTo(tx, y + h);
    } else {
      const tz = y + (h * i) / stairs.steps;

      ctx.moveTo(x, tz);
      ctx.lineTo(x + w, tz);
    }

    ctx.stroke();
  }

  ctx.lineWidth = 4;
  ctx.strokeRect(x, y, w, h);

  // The arrow runs up the stairs, from the low end to the high end.
  const mx = x + w / 2;
  const my = y + h / 2;
  const sign = forward ? 1 : -1;
  const a = across
    ? [mx - sign * (w / 2 - 10), my]
    : [mx, my - sign * (h / 2 - 10)];
  const b = across
    ? [mx + sign * (w / 2 - 12), my]
    : [mx, my + sign * (h / 2 - 12)];

  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
  ctx.beginPath();

  if (across) {
    ctx.moveTo(b[0] + sign * 10, b[1]);
    ctx.lineTo(b[0] - sign * 4, b[1] - 9);
    ctx.lineTo(b[0] - sign * 4, b[1] + 9);
  } else {
    ctx.moveTo(b[0], b[1] + sign * 10);
    ctx.lineTo(b[0] - 9, b[1] - sign * 4);
    ctx.lineTo(b[0] + 9, b[1] - sign * 4);
  }

  ctx.closePath();
  ctx.fill();

  // The name plate over the middle of the run.
  ctx.fillStyle = STAIR;
  ctx.fillRect(mx - 46, my - 13, 92, 26);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(mx - 46, my - 13, 92, 26);
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 18px Arial, sans-serif";
  ctx.fillText("STAIRS UP", mx, my + 1);
}

/** A lightning bolt, centred on the point. */
function bolt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + size * 0.25, y - size * 0.95);
  ctx.lineTo(x - size * 0.5, y + size * 0.1);
  ctx.lineTo(x - size * 0.05, y + size * 0.1);
  ctx.lineTo(x - size * 0.25, y + size * 0.95);
  ctx.lineTo(x + size * 0.5, y - size * 0.15);
  ctx.lineTo(x + size * 0.05, y - size * 0.15);
  ctx.closePath();
  ctx.fill();
}

function powerBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): void {
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  bolt(ctx, x, y, r * 0.62, CREAM);
}

/** The YOU ARE HERE pin: rings and a dot. */
function pin(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = "rgba(157,47,39,0.22)";
  ctx.beginPath();
  ctx.arc(x, y, 21, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 14.5, 0, Math.PI * 2);
  ctx.stroke();
}

/** A grid reference bubble: a ring around a letter or number. */
function bubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
): void {
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(x, y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 16px Arial, sans-serif";
  ctx.fillText(text, x, y + 1);
}

/** Draws the plan; null if there is no canvas to draw on (tests, no DOM). */
export function createFacilityPosterTexture(
  layout: ArenaLayout,
  poster: PosterDefinition,
): THREE.CanvasTexture | null {
  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");

  canvas.width = Math.round(W * TEXTURE_SCALE);
  canvas.height = Math.round(H * TEXTURE_SCALE);

  let ctx: CanvasRenderingContext2D;

  try {
    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    ctx = context;
  } catch {
    return null;
  }

  ctx.scale(TEXTURE_SCALE, TEXTURE_SCALE);
  ctx.lineJoin = "miter";

  const hereId = "room-spawn-nw";

  // ------------------------------------------------------------- the sheet
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // A double border.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 22, W - 44, H - 44);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(32, 32, W - 64, H - 64);

  // Title block.
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = "bold 58px 'Arial Black', Arial, sans-serif";
  ctx.fillText("RIOT ROOM  ·  SITE PLAN", 60, 90);
  ctx.font = "bold 26px Arial, sans-serif";
  ctx.fillText("LEVEL 1  ·  ENTRY AND STAGING  ·  NOT TO SCALE", 60, 124);
  ctx.fillRect(60, 136, W - 120, 3);

  // A restricted-area stamp, top right.
  ctx.save();
  ctx.translate(1385, 82);
  ctx.rotate(-0.05);
  ctx.strokeStyle = RED;
  ctx.fillStyle = RED;
  ctx.lineWidth = 4;
  ctx.strokeRect(-130, -32, 260, 64);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-124, -26, 248, 52);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 28px Arial, sans-serif";
  ctx.fillText("RESTRICTED AREA", 0, 1);
  ctx.restore();

  // ---------------------------------------------------- the building shell
  const shellX = X(-32);
  const shellY = Z(-24);
  const shellW = 64 * PLAN_SCALE;
  const shellH = 48 * PLAN_SCALE;

  ctx.fillStyle = PASSAGE;
  ctx.fillRect(shellX, shellY, shellW, shellH);

  // The arena: the open ground floor, hatched.
  const arenaX = X(-18);
  const arenaY = Z(-12);
  const arenaW = 36 * PLAN_SCALE;
  const arenaH = 24 * PLAN_SCALE;

  ctx.fillStyle = ARENA;
  ctx.fillRect(arenaX, arenaY, arenaW, arenaH);
  ctx.save();
  rectPath(ctx, arenaX, arenaY, arenaW, arenaH);
  ctx.clip();
  ctx.strokeStyle = "rgba(34,32,28,0.3)";
  ctx.lineWidth = 1.6;

  for (let k = -arenaH; k < arenaW; k += 11) {
    ctx.beginPath();
    ctx.moveTo(arenaX + k, arenaY + arenaH);
    ctx.lineTo(arenaX + k + arenaH, arenaY);
    ctx.stroke();
  }

  ctx.restore();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.setLineDash([14, 6]);
  ctx.strokeRect(arenaX, arenaY, arenaW, arenaH);
  ctx.setLineDash([]);

  // ----------------------------------------------------------------- rooms
  for (const room of layout.rooms) {
    const x0 = X(room.minX);
    const z0 = Z(room.minZ);
    const w = (room.maxX - room.minX) * PLAN_SCALE;
    const h = (room.maxZ - room.minZ) * PLAN_SCALE;

    ctx.fillStyle = room.id === hereId ? ROOM_HERE : ROOM;
    ctx.fillRect(x0, z0, w, h);
    drawFurniture(ctx, room, x0, z0, w, h);
    ctx.lineWidth = 7;
    ctx.strokeStyle = INK;
    ctx.strokeRect(x0, z0, w, h);
  }

  // The outer wall, a thicker band on top of the rooms' shared edges.
  ctx.lineWidth = 14;
  ctx.strokeStyle = INK;
  ctx.strokeRect(shellX, shellY, shellW, shellH);

  // Doors.
  for (const room of layout.rooms) {
    room.doors.forEach((door, i) => drawDoor(ctx, room, door, i));
  }

  // Stairs.
  for (const stairs of layout.stairs) {
    drawStairs(ctx, stairs);
  }

  // ----------------------------------------------------------- the labels
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const room of layout.rooms) {
    const x0 = X(room.minX);
    const z0 = Z(room.minZ);
    const w = (room.maxX - room.minX) * PLAN_SCALE;
    const h = (room.maxZ - room.minZ) * PLAN_SCALE;
    const spawn = room.id.startsWith("room-spawn");
    const words = label(room).split(" ");
    const lines =
      words.length > 2
        ? [words.slice(0, 2).join(" "), words.slice(2).join(" ")]
        : words.length === 2 && w < 200 && !spawn
          ? words
          : [words.join(" ")];
    const longest = Math.max(...lines.map((l) => l.length));
    const cap = spawn ? 26 : room.id === "room-switch" ? 30 : 36;
    const size = Math.max(
      20,
      Math.min(
        cap,
        (w - 24) / (longest * 0.84),
        (h - 12) / (lines.length * 1.25),
      ),
    );
    const cy = spawn ? z0 + 22 : z0 + h / 2;

    ctx.fillStyle = INK;
    ctx.font = `bold ${Math.round(size)}px Arial, sans-serif`;

    lines.forEach((line, i) => {
      ctx.fillText(
        line,
        x0 + w / 2,
        cy + (i - (lines.length - 1) / 2) * size * 1.15,
      );
    });
  }

  // The arena's name, on a plate so it reads across the hatching.
  ctx.fillStyle = "rgba(212,203,180,0.92)";
  ctx.fillRect(X(0) - 150, Z(0) - 42, 300, 84);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(X(0) - 150, Z(0) - 42, 300, 84);
  ctx.fillStyle = INK;
  ctx.font = "bold 48px 'Arial Black', Arial, sans-serif";
  ctx.fillText("ARENA", X(0), Z(0) - 10);
  ctx.font = "bold 22px Arial, sans-serif";
  ctx.fillText("OPEN GROUND FLOOR", X(0), Z(0) + 26);

  // The sealed door in the north-west area's west wall.
  const sealTop = Z(-21.8);
  const sealH = 4 * PLAN_SCALE;

  ctx.fillStyle = ROOM_HERE;
  ctx.fillRect(shellX - 9, sealTop, 18, sealH);
  ctx.fillStyle = RED;
  ctx.fillRect(shellX - 6, sealTop, 12, sealH);
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 1.6;

  for (let k = 0; k < sealH; k += 9) {
    ctx.beginPath();
    ctx.moveTo(shellX - 6, sealTop + k);
    ctx.lineTo(shellX + 6, sealTop + k + 9);
    ctx.stroke();
  }

  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;

  for (const edge of [sealTop, sealTop + sealH]) {
    ctx.beginPath();
    ctx.moveTo(shellX - 11, edge);
    ctx.lineTo(shellX + 11, edge);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(shellX - 24, sealTop + sealH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = RED;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 18px Arial, sans-serif";
  ctx.fillText("SEALED", 0, 0);
  ctx.restore();

  // The power room's mark, in its north-east corner.
  const power = layout.rooms.find((r) => r.id === "room-switch");

  if (power) {
    powerBadge(ctx, X(power.maxX) - 21, Z(power.minZ) + 21, 14);
  }

  // YOU ARE HERE: a pin where this area's spawn points are.
  const here = layout.rooms.find((r) => r.id === hereId);

  if (here) {
    const inside = layout.spawnPoints.filter(
      (s) =>
        s.x > here.minX &&
        s.x < here.maxX &&
        s.z > here.minZ &&
        s.z < here.maxZ,
    );
    const px =
      inside.length > 0
        ? inside.reduce((sum, s) => sum + s.x, 0) / inside.length
        : (here.minX + here.maxX) / 2;
    const pz =
      inside.length > 0
        ? inside.reduce((sum, s) => sum + s.z, 0) / inside.length
        : here.minZ + 3;
    const mx = X(px);
    const mz = Z(pz);

    pin(ctx, mx, mz);

    ctx.font = "bold 20px Arial, sans-serif";

    const text = "YOU ARE HERE";
    const plateW = ctx.measureText(text).width + 18;
    const lo = X(here.minX) + 8;
    const hi = X(here.maxX) - 8 - plateW;
    const plateX = Math.min(hi, Math.max(lo, mx - plateW / 2));

    ctx.fillStyle = RED;
    ctx.fillRect(plateX, mz + 22, plateW, 28);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(plateX, mz + 22, plateW, 28);
    ctx.fillStyle = CREAM;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, plateX + plateW / 2, mz + 37);
  }

  // Grid references along the left and the top.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;

  [-32, -16, 0, 16, 32].forEach((gx, i) => {
    ctx.beginPath();
    ctx.moveTo(X(gx), Z(-24) - 9);
    ctx.lineTo(X(gx), Z(-24) - 2);
    ctx.stroke();
    bubble(ctx, X(gx), Z(-24) - 22, "ABCDE"[i]);
  });
  [-24, -8, 8, 24].forEach((gz, i) => {
    ctx.beginPath();
    ctx.moveTo(X(-32) - 9, Z(gz));
    ctx.lineTo(X(-32) - 2, Z(gz));
    ctx.stroke();
    bubble(ctx, X(-32) - 36, Z(gz), String(i + 1));
  });

  // ---------------------------------------------------------- the legend
  const lx = 1322;
  const lw = W - 60 - lx;

  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(lx, PLAN_Y, lw, 470);
  ctx.fillStyle = INK;
  ctx.fillRect(lx, PLAN_Y, lw, 40);
  ctx.fillStyle = CREAM;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "bold 24px Arial, sans-serif";
  ctx.fillText("LEGEND", lx + 14, PLAN_Y + 21);

  const entry = (
    index: number,
    drawSymbol: (x: number, y: number) => void,
    lines: string[],
  ): void => {
    const y = PLAN_Y + 40 + 38 + index * 60;

    drawSymbol(lx + 14, y);
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "bold 19px Arial, sans-serif";
    lines.forEach((line, i) => {
      ctx.fillText(line, lx + 82, y + (i - (lines.length - 1) / 2) * 22);
    });
  };
  const swatch = (color: string, x: number, y: number): void => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 16, 54, 32);
  };

  entry(
    0,
    (x, y) => {
      swatch(ROOM, x, y);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 5;
      ctx.strokeRect(x, y - 16, 54, 32);
    },
    ["ROOM"],
  );
  entry(
    1,
    (x, y) => {
      swatch(ARENA, x, y);
      ctx.save();
      rectPath(ctx, x, y - 16, 54, 32);
      ctx.clip();
      ctx.strokeStyle = "rgba(34,32,28,0.45)";
      ctx.lineWidth = 1.6;

      for (let k = -32; k < 54; k += 8) {
        ctx.beginPath();
        ctx.moveTo(x + k, y + 16);
        ctx.lineTo(x + k + 32, y - 16);
        ctx.stroke();
      }

      ctx.restore();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(x, y - 16, 54, 32);
      ctx.setLineDash([]);
    },
    ["OPEN GROUND", "FLOOR"],
  );
  entry(
    2,
    (x, y) => {
      swatch(STAIR, x, y);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;

      for (let k = 7; k < 54; k += 7) {
        ctx.beginPath();
        ctx.moveTo(x + k, y - 16);
        ctx.lineTo(x + k, y + 16);
        ctx.stroke();
      }

      ctx.lineWidth = 3;
      ctx.strokeRect(x, y - 16, 54, 32);
      ctx.beginPath();
      ctx.moveTo(x + 6, y);
      ctx.lineTo(x + 44, y);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.moveTo(x + 52, y);
      ctx.lineTo(x + 40, y - 7);
      ctx.lineTo(x + 40, y + 7);
      ctx.closePath();
      ctx.fill();
    },
    ["STAIRS UP"],
  );
  entry(
    3,
    (x, y) => {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x, y + 10);
      ctx.lineTo(x + 8, y + 10);
      ctx.moveTo(x + 46, y + 10);
      ctx.lineTo(x + 54, y + 10);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 10);
      ctx.lineTo(x + 8, y - 12);
      ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x + 8, y + 10, 22, -Math.PI / 2, 0);
      ctx.stroke();
    },
    ["DOOR"],
  );
  entry(
    4,
    (x, y) => {
      ctx.fillStyle = RED;
      ctx.fillRect(x + 21, y - 18, 12, 36);
      ctx.strokeStyle = CREAM;
      ctx.lineWidth = 1.6;

      for (let k = 0; k < 36; k += 9) {
        ctx.beginPath();
        ctx.moveTo(x + 21, y - 18 + k);
        ctx.lineTo(x + 33, y - 18 + k + 9);
        ctx.stroke();
      }

      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;

      for (const e of [-18, 18]) {
        ctx.beginPath();
        ctx.moveTo(x + 17, y + e);
        ctx.lineTo(x + 37, y + e);
        ctx.stroke();
      }
    },
    ["SEALED", "DOOR"],
  );
  entry(5, (x, y) => powerBadge(ctx, x + 27, y, 17), ["POWER ROOM"]);
  entry(6, (x, y) => pin(ctx, x + 27, y), ["YOU ARE", "HERE"]);

  // North arrow, in a ring.
  const nx = lx + lw / 2;
  const ny = PLAN_Y + 470 + 110;

  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(nx, ny, 60, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(nx, ny, 52, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(nx, ny - 48);
  ctx.lineTo(nx - 15, ny + 22);
  ctx.lineTo(nx, ny + 10);
  ctx.lineTo(nx + 15, ny + 22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(nx, ny - 48);
  ctx.lineTo(nx + 15, ny + 22);
  ctx.lineTo(nx, ny + 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 30px Arial, sans-serif";
  ctx.fillText("N", nx, ny - 78);

  // Notes under the north arrow.
  ctx.textAlign = "left";
  ctx.font = "bold 16px Arial, sans-serif";
  ctx.fillText("ALL DIMENSIONS", lx, ny + 112);
  ctx.fillText("APPROXIMATE.", lx, ny + 134);
  ctx.fillText("KEEP EXITS CLEAR.", lx, ny + 156);

  // The footer: a rule, and the drawing's own details.
  ctx.fillStyle = INK;
  ctx.fillRect(60, 1094, W - 120, 3);
  ctx.textBaseline = "alphabetic";
  ctx.font = "bold 20px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("DWG NO. RR-01  ·  REV C", 60, 1134);
  ctx.textAlign = "center";
  ctx.fillText("FACILITY SITE PLAN  ·  LEVEL 1", W / 2, 1134);
  ctx.textAlign = "right";
  ctx.fillText("SHEET 1 OF 1", W - 60, 1134);

  // ------------------------------------------------------------- the wear
  let seed = poster.here === "nw" ? 11 : 29;
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

    return seed / 4294967296;
  };

  // Fold lines, each with a light edge beside the dark one.
  const fold = (x0: number, y0: number, x1: number, y1: number): void => {
    ctx.strokeStyle = "rgba(60,50,35,0.2)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,250,235,0.16)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 + 3, y0);
    ctx.lineTo(x1 + 3, y1);
    ctx.stroke();
  };

  fold(W / 2, 0, W / 2 + 7, H);
  fold(0, H / 2, W, H / 2 - 5);

  // Darkened edges.
  const edge = ctx.createRadialGradient(
    W / 2,
    H / 2,
    H * 0.45,
    W / 2,
    H / 2,
    H * 0.95,
  );

  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(60,44,20,0.38)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);

  // Water and handling stains, faint.
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(80,58,28,${0.04 + rnd() * 0.05})`;
    ctx.beginPath();
    ctx.ellipse(
      rnd() * W,
      rnd() * H,
      40 + rnd() * 100,
      30 + rnd() * 70,
      rnd() * 3,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // A few smudged thumb marks near the edges.
  for (let i = 0; i < 4; i++) {
    const side = i % 2 === 0 ? 70 + rnd() * 30 : W - 70 - rnd() * 30;

    ctx.fillStyle = `rgba(50,38,20,${0.05 + rnd() * 0.05})`;
    ctx.beginPath();
    ctx.ellipse(side, 300 + rnd() * 700, 16, 22, rnd(), 0, Math.PI * 2);
    ctx.fill();
  }

  // Fibres and speckle.
  ctx.lineWidth = 1;

  for (let i = 0; i < 120; i++) {
    const fx = rnd() * W;
    const fy = rnd() * H;

    ctx.strokeStyle = `rgba(70,55,35,${0.05 + rnd() * 0.07})`;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + (rnd() - 0.5) * 18, fy + (rnd() - 0.5) * 18);
    ctx.stroke();
  }

  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(30,25,15,${rnd() * 0.16})`;
    ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2);
  }

  // Torn tape at two corners, over the border only.
  for (const [tx, ty, rot] of [
    [10, 20, -0.75],
    [W - 10, H - 22, -0.75],
  ] as const) {
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(rot);
    ctx.fillStyle = "rgba(205,190,140,0.55)";
    ctx.fillRect(-40, -12, 80, 24);
    ctx.strokeStyle = "rgba(90,75,40,0.35)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-40, -12, 80, 24);
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  return texture;
}

/** The poster as a plane on its wall, or null without a canvas. */
export function createFacilityPoster(
  layout: ArenaLayout,
  poster: PosterDefinition,
): THREE.Mesh | null {
  const texture = createFacilityPosterTexture(layout, poster);

  if (!texture) {
    return null;
  }

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(poster.width, poster.height),
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.92,
      metalness: 0,
      // A little brightness of its own so it still reads in the dark.
      emissive: new THREE.Color(0xffffff),
      emissiveMap: texture,
      emissiveIntensity: 0.22,
    }),
  );

  mesh.name = poster.id;
  mesh.position.set(poster.x, poster.y, poster.z);
  mesh.rotation.y = Math.atan2(poster.nx, poster.nz);
  mesh.receiveShadow = true;

  return mesh;
}
