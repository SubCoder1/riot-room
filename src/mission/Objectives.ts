/**
 * The mission objectives: what the player is meant to do, and which of it is
 * done. The game owns this state and changes it from real gameplay events (a
 * pickup taken); the HUD only listens, so the two can never disagree.
 *
 * Objectives are listed in order. The first one not done is the current one,
 * those after it are upcoming, and a completed one is reported once, as it is
 * completed (the HUD takes it off the list).
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

/** The mission as it stands: one objective for now. */
export const OBJECTIVES: readonly ObjectiveDefinition[] = [
  {
    id: "collect-dynamite",
    label: "Collect dynamites from Armory",
    completesOnPickup: "DYNAMITE",
  },
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

  /** The objectives still to show (the completed ones are gone), in order. */
  public remaining(): ReadonlyArray<{
    definition: ObjectiveDefinition;
    state: ObjectiveState;
  }> {
    return this.definitions
      .filter((d) => !this.done.has(d.id))
      .map((definition) => ({
        definition,
        state: this.stateOf(definition.id),
      }));
  }

  /** Completes an objective. True only the one time it changes (never twice). */
  public complete(id: string): boolean {
    if (this.done.has(id) || !this.definitions.some((d) => d.id === id)) {
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
