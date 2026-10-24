import { ROOF_LOW } from "./ArenaLayout";

/** Who is playing: the slab's permission check is made on this. */
export type PlayerRole = "batman" | "thug";

/** The wooden slab in the Generator Room's roof, over its bulb. */
export const CEILING_SLAB_ID = "ceiling-slab-power";

/**
 * Its opening: 2.35 m square (a body is 1 m across), centred over the room's
 * hanging bulb at (3.2, -20.5), over clear floor. It stops short of the
 * ceiling cable bundle (z -21.95) and clear of the generator (x 5.8).
 */
export const CEILING_SLAB_AREA = {
  minX: 2.025,
  maxX: 4.375,
  minZ: -21.675,
  maxZ: -19.325,
} as const;

/** Height of the bulb's glass over the floor (the bulb is `POWER_BULB`). */
export const CEILING_SLAB_BULB_Y = 2.95;

/** The bulb that hangs under the slab: it breaks with it (see POWER_BULB). */
export const CEILING_SLAB_BULB_LIGHT = "bulb-power-a";

/** The roof's top round the opening. */
export const CEILING_SLAB_TOP = ROOF_LOW;

/** How far the boards reach past the opening onto the roof, each side. */
export const CEILING_SLAB_OVERLAP = 0.26;

/**
 * The cover: the boards lie ON the roof over the opening, reaching past it on
 * every side (about 22% larger), their tops a hand's width above the roof.
 * Its solid is this whole footprint, so what is drawn is what is stood on.
 */
export const CEILING_SLAB_COVER = {
  minX: CEILING_SLAB_AREA.minX - CEILING_SLAB_OVERLAP,
  maxX: CEILING_SLAB_AREA.maxX + CEILING_SLAB_OVERLAP,
  minZ: CEILING_SLAB_AREA.minZ - CEILING_SLAB_OVERLAP,
  maxZ: CEILING_SLAB_AREA.maxZ + CEILING_SLAB_OVERLAP,
} as const;

/** The top of the boards: 10 cm over the roof. */
export const CEILING_SLAB_COVER_TOP = ROOF_LOW + 0.1;

/** How far under the roof the Generator Room's floor is (the slab's drop). */
export const CEILING_SLAB_FLOOR = 4;

/**
 * Who may break through. Testing: both roles. To restrict it later, take a
 * role out of this list (the vent permissions are separate).
 */
export const CEILING_SLAB_ROLES: readonly PlayerRole[] = ["batman", "thug"];

export function canBreakCeilingSlab(role: PlayerRole): boolean {
  return CEILING_SLAB_ROLES.includes(role);
}

/** Where a body stands, for the slab's checks. */
export interface SlabBody {
  x: number;
  z: number;
  feetY: number;
}

/**
 * Whether the body stands on top of the slab: its centre over the slab (so
 * that once the boards go it is over the opening and falls) and its feet on
 * the roof. Underneath, in the room, its feet are 3.8 m too low.
 */
export function onCeilingSlab(body: SlabBody): boolean {
  const a = CEILING_SLAB_AREA;

  return (
    body.x >= a.minX &&
    body.x <= a.maxX &&
    body.z >= a.minZ &&
    body.z <= a.maxZ &&
    Math.abs(body.feetY - CEILING_SLAB_TOP) <= 0.4
  );
}

export type SlabBreakResult = "broken" | "already" | "denied";

/**
 * The slab's one authoritative state: intact, then broken for the rest of the
 * round. Pure logic with no rendering, so a server can run the same class and
 * clients only draw the result: the first valid request breaks it, and every
 * later one (a repeated key press, another player at the same moment) is
 * answered "already" and changes nothing.
 */
export class CeilingSlabState {
  private breaker: string | null = null;

  public get broken(): boolean {
    return this.breaker !== null;
  }

  /** Who broke it (null while intact). */
  public get brokenBy(): string | null {
    return this.breaker;
  }

  public tryBreak(
    playerId: string,
    role: PlayerRole,
    body: SlabBody,
  ): SlabBreakResult {
    if (this.broken) {
      return "already";
    }

    if (!canBreakCeilingSlab(role) || !onCeilingSlab(body)) {
      return "denied";
    }

    this.breaker = playerId;

    return "broken";
  }

  /** A client learns the slab is broken (the server's word, or a new round's reset). */
  public setBroken(by: string | null): void {
    this.breaker = by;
  }
}
