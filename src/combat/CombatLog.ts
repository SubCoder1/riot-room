import type { CombatEvent } from "./CombatEvents";

/** Set to false to silence the [Combat] console messages. */
export const COMBAT_LOGGING = true;

/** One line per meaningful event; never per frame. */
export function logCombatEvent(event: CombatEvent): void {
  if (!COMBAT_LOGGING) {
    return;
  }

  switch (event.type) {
    case "attack-started":
      console.log(`[Combat] Attack started: ${event.attackId}`);
      break;

    case "attack-active":
      console.log(`[Combat] Attack active: ${event.attackId}`);
      break;

    case "hit":
      console.log(
        `[Combat] Hit detected: ${event.targetName} (${event.hurtbox})`,
      );
      console.log(`[Combat] Damage: ${event.damage}`);
      console.log(`[Combat] Knockback: ${event.knockback.toFixed(1)}`);
      console.log(`[Combat] ${event.targetName} health: ${event.healthLeft}`);
      break;

    case "blocked":
      console.log(`[Combat] Light attack blocked (${event.attackId})`);
      break;

    case "block-failed":
      console.log(
        event.reason === "rear"
          ? "[Combat] Block failed \u2014 attack from rear"
          : event.reason === "below-guard"
            ? "[Combat] Block failed \u2014 hit below the guard (needs a crouch block)"
            : event.reason === "vertical"
              ? `[Combat] Block failed \u2014 guard not aimed at the attacker (${event.detail ?? "look up/down toward it"})`
              : "[Combat] Block failed \u2014 attacker outside guard angle",
      );
      break;

    case "guard-reduced":
      console.log(
        `[Combat] Heavy attack unblockable, guard reduced damage to ${Math.round(event.multiplier * 100)}% (${event.attackId})`,
      );
      break;

    case "guard-ignored":
      console.log(`[Combat] Heavy attack ignored guard (${event.attackId})`);
      break;

    case "attack-ended":
      console.log(`[Combat] Attack ended: ${event.attackId} (${event.reason})`);
      break;

    case "died":
      console.log(`[Combat] ${event.targetName} died`);
      break;

    case "respawned":
      console.log(`[Combat] ${event.targetName} respawned`);
      break;
  }
}
