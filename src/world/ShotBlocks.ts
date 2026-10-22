import type { MapBuilder } from "./MapParts";

/**
 * Shot blocks for the drawn-only props: chairs, stools, seats, buckets,
 * barrows, reels, jerrycans, distribution boards and the like. They have no
 * collision box (a body walks through or over them, so no lane changes), but
 * a shot, a grenade or a line of sight must not pass through them. Each entry
 * is a footprint (centre x and z, half widths) and a height, on the first
 * floor.
 */

// [id, x, z, half x, half z, top]
const BLOCKS: ReadonlyArray<
  readonly [string, number, number, number, number, number]
> = [
  // Break room
  ["shot-stool-break", 28.62, 6.7, 0.2, 0.2, 0.55],
  ["shot-chair-break-fallen", 30.15, 9.6, 0.35, 0.3, 0.45],
  // Server room
  ["shot-stool-server", 30.35, -8.45, 0.18, 0.18, 0.45],
  // Barracks
  ["shot-seat-barracks-1", -25.5, -11.1, 0.22, 0.22, 0.42],
  ["shot-seat-barracks-2", -23.3, -11.1, 0.22, 0.22, 0.42],
  ["shot-seat-barracks-3", -24.4, -10.0, 0.23, 0.14, 0.34],
  ["shot-bench-barracks", -24.2, -3.52, 1.4, 0.2, 0.42],
  ["shot-bed-barracks", -22.5, -10.05, 0.5, 1.15, 0.42],
  // Armory
  ["shot-crate-armory", -29.6, 7.55, 0.4, 0.26, 0.32],
  ["shot-toolbox-armory", -28.2, 9.9, 0.24, 0.12, 0.24],
  // Archive
  ["shot-box-archive", -7.5, -20.0, 0.22, 0.18, 0.3],
  ["shot-chair-archive", -12.0, -17.7, 0.25, 0.25, 0.9],
  ["shot-chair-archive-desk", -4.6, -17.75, 0.24, 0.24, 0.9],
  // Warehouse
  ["shot-trolley-warehouse", 23.2, 12.6, 0.3, 0.22, 1.2],
  ["shot-carton-warehouse", 22.0, 20.9, 0.26, 0.22, 0.3],
  // Hall
  ["shot-plasterboard-hall", -31.35, 22.0, 0.35, 0.65, 2.3],
  ["shot-bucket-hall", -30.3, 14.0, 0.14, 0.14, 0.3],
  // Loading dock
  ["shot-barrow-dock", 13.0, -18.3, 0.5, 0.45, 0.55],
  ["shot-bucket-dock-a", 13.9, -18.55, 0.14, 0.14, 0.32],
  ["shot-bucket-dock-b", 14.25, -18.35, 0.14, 0.14, 0.32],
  ["shot-bucket-dock-c", 9.9, -18.4, 0.14, 0.14, 0.32],
  // West terrace
  ["shot-trestle-terrace", -26.8, -0.2, 0.6, 0.32, 0.78],
  ["shot-barrow-terrace", -25.4, 1.4, 0.5, 0.45, 0.55],
  ["shot-bucket-terrace-a", -27.6, -0.4, 0.14, 0.14, 0.32],
  ["shot-bucket-terrace-b", -26.2, 0.45, 0.14, 0.14, 0.32],
  // North walkway service point (board, reel, cans) and the east deck's
  ["shot-board-north", 4.5, -16.85, 0.42, 0.16, 1.3],
  ["shot-reel-north", 6.55, -16.45, 0.2, 0.3, 0.55],
  ["shot-cans-north", 6.35, -16.85, 0.4, 0.16, 0.5],
  ["shot-board-deck", 26.4, -4.84, 0.42, 0.16, 1.3],
  ["shot-reel-deck", 27.5, -4.15, 0.3, 0.3, 0.55],
  ["shot-cans-deck", 25.3, -3.4, 0.4, 0.18, 0.5],
];

export function furnishShotBlocks(map: MapBuilder, floorY: number): void {
  for (const [id, x, z, hx, hz, top] of BLOCKS) {
    map.addShotBlock(id, floorY, x - hx, x + hx, z - hz, z + hz, top);
  }
}
