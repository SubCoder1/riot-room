/**
 * The mission objectives: what the player is meant to do, and which of it is
 * done. The game owns this state and changes it from real gameplay events (a
 * pickup taken); the HUD only listens, so the two can never disagree.
 *
 * Objectives are listed in order. The first one not done is the current one,
 * those after it are upcoming, and a completed one is reported once, as it is
 * completed (it stays on the list, done). An objective can only be completed
 * when every one before it is, so the mission cannot be skipped ahead.
 */

export type ObjectiveState = "upcoming" | "current" | "completed";

export interface ObjectiveDefinition {
  readonly id: string;
  readonly label: string;
  /** Completed when a pickup of this type is taken (see `pickupTaken`). */
  readonly completesOnPickup?: string;
}

export type ObjectiveChange =
  | { readonly kind: "completed"; readonly id: string }
  | { readonly kind: "reset" };

export type ObjectiveListener = (change: ObjectiveChange) => void;

/** The ids of the mission's objectives, in order. */
export const OBJECTIVE_ID = {
  /** Find the collapsed entrance of The Ruins. */
  LOCATE: "locate-vault",
  /** Go in through the opening. */
  ENTER: "enter-vault",
  /** Take the target component from inside. */
  RETRIEVE: "retrieve-component",
  /** Carry it to the extraction point. */
  EXTRACT: "reach-extraction",
} as const;

/**
 * The mission as the player sees it: four short lines, all shown together.
 * How to do each is found in the world, by the prompts at the place, not
 * listed here.
 */
export const OBJECTIVES: readonly ObjectiveDefinition[] = [
  { id: OBJECTIVE_ID.LOCATE, label: "Locate The Ruins" },
  { id: OBJECTIVE_ID.ENTER, label: "Enter The Ruins" },
  {
    id: OBJECTIVE_ID.RETRIEVE,
    label: "Retrieve the target component",
    completesOnPickup: "COMPONENT",
  },
  { id: OBJECTIVE_ID.EXTRACT, label: "Reach the extraction point" },
];

export class ObjectiveLog {
  private readonly done = new Set<string>();
  private readonly listeners = new Set<ObjectiveListener>();

  private readonly definitions: readonly ObjectiveDefinition[];

  constructor(definitions: readonly ObjectiveDefinition[]) {
    this.definitions = definitions;
  }

  /** The state of one objective: done, the first not done, or one after it. */
  public stateOf(id: string): ObjectiveState {
    if (this.done.has(id)) {
      return "completed";
    }

    const current = this.definitions.find((d) => !this.done.has(d.id));

    return current?.id === id ? "current" : "upcoming";
  }

  /** The objectives to show: the done ones and the current one (never a future one). */
  public visible(): ReadonlyArray<{
    definition: ObjectiveDefinition;
    state: ObjectiveState;
  }> {
    return this.entries().filter((e) => e.state !== "upcoming");
  }

  /** Every objective with its state, in mission order (done ones stay). */
  public entries(): ReadonlyArray<{
    definition: ObjectiveDefinition;
    state: ObjectiveState;
  }> {
    return this.definitions.map((definition) => ({
      definition,
      state: this.stateOf(definition.id),
    }));
  }

  /** The objectives not done yet, in order. */
  public remaining(): ReadonlyArray<{
    definition: ObjectiveDefinition;
    state: ObjectiveState;
  }> {
    return this.entries().filter((e) => e.state !== "completed");
  }

  /**
   * Completes an objective. True only the one time it changes (never twice),
   * and only the current one: it is the one that is being worked on.
   */
  public complete(id: string): boolean {
    if (this.done.has(id) || !this.definitions.some((d) => d.id === id)) {
      return false;
    }

    if (this.stateOf(id) !== "current") {
      return false;
    }

    this.done.add(id);
    this.emit({ kind: "completed", id });

    return true;
  }

  /** A pickup of `type` was really taken: completes what depends on it. */
  public pickupTaken(type: string): void {
    for (const definition of this.definitions) {
      if (definition.completesOnPickup === type) {
        this.complete(definition.id);
      }
    }
  }

  /** A new round: every objective is to do again. */
  public reset(): void {
    if (this.done.size === 0) {
      return;
    }

    this.done.clear();
    this.emit({ kind: "reset" });
  }

  /** Listens for changes; returns the function that stops listening. */
  public subscribe(listener: ObjectiveListener): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  private emit(change: ObjectiveChange): void {
    for (const listener of [...this.listeners]) {
      listener(change);
    }
  }
}
