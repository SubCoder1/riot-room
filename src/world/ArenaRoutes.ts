/**
 * The meaningful ways across the arena, written down as design data. Each route
 * is a list of waypoints (x, z) between two spawn areas; the real path between
 * waypoints is whatever the collision allows. They exist so the layout can be
 * checked against its own intent (no route is better at everything) and drawn
 * in the debug view. Nothing in the game logic depends on them.
 *
 * Every route trades something for something else:
 *   A  fast, but wide open
 *   B  covered, but long (gives a chaser time to cut across)
 *   C  high ground and a view, but narrow and exposed
 *   D  shortest, but straight across the open middle
 *   E  direct through the middle, and contested by everyone
 */
export interface ArenaRoute {
  id: string;
  name: string;
  /** Advantage and weakness, for the design notes and the debug view. */
  advantage: string;
  weakness: string;
  waypoints: ReadonlyArray<readonly [number, number]>;
}

/** Both ends of the main test crossing: north-west lane to south-east lane. */
export const ROUTE_START = { x: -11, z: -17.5 } as const;
export const ROUTE_END = { x: 12, z: 17.5 } as const;

export const ARENA_ROUTES: readonly ArenaRoute[] = [
  {
    id: "A",
    name: "Open lane",
    advantage: "fast, with room to dodge and sprint",
    weakness: "no cover; exposed to heavy punches and anything thrown",
    waypoints: [
      [-11, -17.5],
      [9, -15],
      [16, -4],
      [17.5, 12],
      [12, 17.5],
    ],
  },
  {
    id: "B",
    name: "Covered route",
    advantage: "walls and blocks break the sightlines",
    weakness: "slow, so a chaser can cut you off through the middle",
    waypoints: [
      [-11, -17.5],
      [-17.5, -9],
      [-18.5, 6],
      [-14, 14],
      [-5, 16.5],
      [12, 17.5],
    ],
  },
  {
    id: "C",
    name: "Elevated route",
    advantage: "high ground and a view of the whole middle",
    weakness: "narrow and exposed; one hit can knock you off",
    waypoints: [
      [-11, -17.5],
      [-14.5, -9.5],
      [0, -9.5],
      [13, -9.5],
      [3, 5.75],
      [8, 5],
      [8, 9.5],
      [12, 17.5],
    ],
  },
  {
    id: "D",
    name: "Shortcut",
    advantage: "the shortest line",
    weakness:
      "straight across the open middle: visible from everywhere, easy to intercept",
    waypoints: [
      [-11, -17.5],
      [12, 17.5],
    ],
  },
  {
    id: "E",
    name: "Central route",
    advantage: "direct, with cover to dodge behind",
    weakness: "every other route passes close: the most contested ground",
    waypoints: [
      [-11, -17.5],
      [-15.5, -9.5],
      [-6, -6.2],
      [-2, -6],
      [-2, -3],
      [-2, 0],
      [-0.8, 2.6],
      [1, 5.5],
      [4.5, 10],
      [12, 17.5],
    ],
  },
];
