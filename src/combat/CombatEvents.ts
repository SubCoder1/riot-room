import type { AttackId } from "./AttackDefinitions";

/**
 * Everything meaningful that happens in combat is reported as an event. The
 * hit-detection code only *emits* these; logging, debug drawing and (later) the
 * network layer subscribe to them.
 */
export type AttackEndReason = "finished" | "cancelled" | "replaced";

export type CombatEvent =
  | { type: "attack-started"; attackerId: string; attackId: AttackId }
  | { type: "attack-active"; attackerId: string; attackId: AttackId }
  | {
      type: "attack-ended";
      attackerId: string;
      attackId: AttackId;
      reason: AttackEndReason;
    }
  | {
      type: "hit";
      attackerId: string;
      attackId: AttackId;
      targetId: string;
      targetName: string;
      hurtbox: string;
      damage: number;
      knockback: number;
      healthLeft: number;
    }
  | {
      type: "blocked";
      attackerId: string;
      attackId: AttackId;
      targetId: string;
      targetName: string;
    }
  | {
      type: "block-failed";
      attackerId: string;
      attackId: AttackId;
      targetId: string;
      targetName: string;
      reason: "outside-guard" | "rear" | "below-guard" | "vertical";
      /** Extra numbers for debugging (e.g. elevation vs guard pitch). */
      detail?: string;
    }
  | {
      type: "guard-ignored";
      attackerId: string;
      attackId: AttackId;
      targetId: string;
      targetName: string;
    }
  | {
      type: "guard-reduced";
      attackerId: string;
      attackId: AttackId;
      targetId: string;
      targetName: string;
      multiplier: number;
    }
  | { type: "died"; targetId: string; targetName: string }
  | { type: "respawned"; targetId: string; targetName: string };

export type CombatListener = (event: CombatEvent) => void;

export class CombatEventBus {
  private readonly listeners: CombatListener[] = [];

  /** Returns a function that removes the listener again. */
  public subscribe(listener: CombatListener): () => void {
    this.listeners.push(listener);

    return () => {
      const at = this.listeners.indexOf(listener);

      if (at >= 0) {
        this.listeners.splice(at, 1);
      }
    };
  }

  public emit(event: CombatEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
