/**
 * The building's two lighting circuits and the generators that run them.
 *
 *   - exterior: the rooftop generator (above the Storage room) runs every
 *     light outside the building: the floodlights on their masts, the work
 *     lamps on walls and roofs, the scaffold and yard lamps.
 *   - interior: the generator in the Power (Generator) room runs every light
 *     inside it: room lamps, tube lights, hanging bulbs and work lights.
 *
 * Which circuit a lamp belongs to is listed here by id (so a new lamp has to be
 * given a circuit on purpose: the tests fail until it is). The state is plain
 * logic with no rendering, so a server can run the same class and clients only
 * draw the result.
 */

export type Circuit = "interior" | "exterior";

/** Who is playing (the shutdown is Batman's alone). */
export type PowerRole = "batman" | "thug";

/** The generator that runs each circuit (ids in `ArenaLayout.generators`). */
export const CIRCUIT_GENERATOR: Readonly<Record<Circuit, string>> = {
  interior: "generator-main",
  exterior: "generator-roof",
};

/** Lamps outside the building: on masts, walls and roofs, in the open yard. */
const EXTERIOR_LAMPS: ReadonlySet<string> = new Set([
  "light-support-north-2-1",
  "light-support-north-2-2",
  "light-support-dock-1",
  "light-support-south-1",
  "light-support-south-2-1",
  "light-support-south-2-2",
  "light-site-scaffold",
  "light-room-yard",
  "halogen-wall-room-armory",
  "halogen-wall-spawn",
  "halogen-scene-1",
  "halogen-roof-east",
  "halogen-wall-storage",
]);

/** Lamps inside a room. */
const INTERIOR_LAMPS: ReadonlySet<string> = new Set([
  "workshop-light-bench",
  "workshop-light-machines",
  "bulb-power-a",
  "bulb-junk-a",
  "bulb-junk-b",
  "bulb-break-a",
  "light-spawn-worktable",
  "light-room-server",
  "light-room-barracks",
  "light-room-hall-b",
  "tube-warehouse-1",
  "tube-warehouse-2",
  "tube-armory-1",
  "tube-armory-2",
  "tube-armory-3",
  "tube-armory-4",
]);

/**
 * Lamps on no circuit: emergency and equipment indicators. They stay lit
 * whatever the generators do.
 */
const INDEPENDENT_LAMPS: ReadonlySet<string> = new Set([
  "indicator-server-racks",
]);

/** The circuit a lamp is on (null: independent, or not a known lamp). */
export function circuitOfLamp(id: string): Circuit | null {
  if (EXTERIOR_LAMPS.has(id)) {
    return "exterior";
  }

  if (INTERIOR_LAMPS.has(id)) {
    return "interior";
  }

  return null;
}

/** Whether a lamp is deliberately on neither circuit. */
export function isIndependentLamp(id: string): boolean {
  return INDEPENDENT_LAMPS.has(id);
}

/** Which roles may switch a generator off. Batman only: a thug cannot. */
export const SHUTDOWN_ROLES: readonly PowerRole[] = ["batman"];

export function canShutDown(role: PowerRole): boolean {
  return SHUTDOWN_ROLES.includes(role);
}

/** Seconds a generator stays off before it can be started again. */
export const RESTART_DELAY = 10;

export type ShutdownResult = "off" | "already" | "denied";
export type RestartResult = "on" | "already" | "cooling" | "denied";

/**
 * Whether each generator runs: both start ON, a round starts them ON again,
 * and only a valid request switches one OFF (once: a repeat is answered
 * "already" and changes nothing).
 */
export class PowerState {
  private readonly running: Record<Circuit, boolean> = {
    interior: true,
    exterior: true,
  };
  /** When each circuit went off (seconds on the caller's clock). */
  private readonly offAt: Record<Circuit, number> = {
    interior: 0,
    exterior: 0,
  };

  public isOn(circuit: Circuit): boolean {
    return this.running[circuit];
  }

  /** The circuit a generator runs (null if it is not one of the two). */
  public static circuitOfGenerator(id: string): Circuit | null {
    return (
      (Object.keys(CIRCUIT_GENERATOR) as Circuit[]).find(
        (circuit) => CIRCUIT_GENERATOR[circuit] === id,
      ) ?? null
    );
  }

  public shutDown(
    generatorId: string,
    role: PowerRole,
    now = 0,
  ): ShutdownResult {
    const circuit = PowerState.circuitOfGenerator(generatorId);

    if (!circuit || !canShutDown(role)) {
      return "denied";
    }

    if (!this.running[circuit]) {
      return "already";
    }

    this.running[circuit] = false;
    this.offAt[circuit] = now;

    return "off";
  }

  /** Seconds before an off generator can be started again (0: now). */
  public secondsUntilRestart(circuit: Circuit, now: number): number {
    if (this.running[circuit]) {
      return 0;
    }

    return Math.max(0, this.offAt[circuit] + RESTART_DELAY - now);
  }

  /**
   * Starts an off generator again, once it has stood off for the restart
   * delay. Anyone may (a generator is no one-time switch): it can be switched
   * off and on again as often as the delay allows.
   */
  public switchOn(generatorId: string, now = 0): RestartResult {
    const circuit = PowerState.circuitOfGenerator(generatorId);

    if (!circuit) {
      return "denied";
    }

    if (this.running[circuit]) {
      return "already";
    }

    if (this.secondsUntilRestart(circuit, now) > 0) {
      return "cooling";
    }

    this.running[circuit] = true;

    return "on";
  }

  /** The server's word that a circuit is off or on (a new round: both on). */
  public set(circuit: Circuit, on: boolean): void {
    this.running[circuit] = on;
  }

  public reset(): void {
    this.running.interior = true;
    this.running.exterior = true;
  }
}
