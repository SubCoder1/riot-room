import { describe, expect, it, vi } from "vitest";

import {
  OBJECTIVES,
  OBJECTIVE_ID,
  ObjectiveLog,
  type ObjectiveDefinition,
} from "../../src/mission/Objectives";

const TWO: readonly ObjectiveDefinition[] = [
  { id: "a", label: "First", completesOnPickup: "ONE" },
  { id: "b", label: "Second", completesOnPickup: "TWO" },
];

describe("The mission", () => {
  it("is four short objectives, in order, with none of the steps spelled out", () => {
    expect(OBJECTIVES.map((o) => o.label)).toEqual([
      "Collect dynamites from Armory",
      "Clear the blocked passage",
      "Get clear of the blast",
      "Enter the Chemical Vault",
    ]);
    expect(OBJECTIVES.map((o) => o.id)).toEqual(Object.values(OBJECTIVE_ID));
    expect(OBJECTIVES[0].completesOnPickup).toBe("DYNAMITE");
    expect(OBJECTIVES.slice(1).every((o) => !o.completesOnPickup)).toBe(true);
  });

  it("lists all four at once and moves on one at a time, only in order", () => {
    const log = new ObjectiveLog(OBJECTIVES);
    const states = (): string[] => log.entries().map((e) => e.state);

    expect(states()).toEqual(["current", "upcoming", "upcoming", "upcoming"]);

    // Out of order does nothing.
    expect(log.complete(OBJECTIVE_ID.ENTER)).toBe(false);
    expect(log.complete(OBJECTIVE_ID.GET_CLEAR)).toBe(false);

    log.pickupTaken("DYNAMITE");
    expect(states()).toEqual(["completed", "current", "upcoming", "upcoming"]);

    expect(log.complete(OBJECTIVE_ID.CLEAR)).toBe(true);
    expect(log.complete(OBJECTIVE_ID.CLEAR)).toBe(false);
    expect(states()).toEqual(["completed", "completed", "current", "upcoming"]);

    expect(log.complete(OBJECTIVE_ID.GET_CLEAR)).toBe(true);
    expect(log.complete(OBJECTIVE_ID.ENTER)).toBe(true);
    expect(states()).toEqual([
      "completed",
      "completed",
      "completed",
      "completed",
    ]);
  });
});

describe("ObjectiveLog", () => {
  it("starts with the first objective current and the others upcoming", () => {
    const log = new ObjectiveLog(TWO);

    expect(log.stateOf("a")).toBe("current");
    expect(log.stateOf("b")).toBe("upcoming");
    expect(log.entries().map((r) => r.state)).toEqual(["current", "upcoming"]);
  });

  it("completes an objective once, and tells listeners exactly once", () => {
    const log = new ObjectiveLog(TWO);
    const heard = vi.fn();

    log.subscribe(heard);

    expect(log.complete("a")).toBe(true);
    expect(log.complete("a")).toBe(false);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledWith({ kind: "completed", id: "a" });
    expect(log.stateOf("a")).toBe("completed");
    // The next one becomes current by itself, and the done one stays listed.
    expect(log.stateOf("b")).toBe("current");
    expect(log.entries().map((r) => r.state)).toEqual(["completed", "current"]);
    expect(log.remaining().map((r) => r.definition.id)).toEqual(["b"]);
  });

  it("cannot be completed out of order: only the current objective can be", () => {
    const log = new ObjectiveLog(TWO);
    const heard = vi.fn();

    log.subscribe(heard);

    expect(log.complete("b")).toBe(false);
    expect(log.stateOf("b")).toBe("upcoming");
    expect(heard).not.toHaveBeenCalled();
  });

  it("completes only on the pickup it waits for", () => {
    const log = new ObjectiveLog(TWO);

    log.pickupTaken("GRENADE");
    log.pickupTaken("TWO-ish");
    expect(log.stateOf("a")).toBe("current");

    log.pickupTaken("ONE");
    log.pickupTaken("ONE");
    expect(log.stateOf("a")).toBe("completed");
  });

  it("ignores an objective it does not know", () => {
    const log = new ObjectiveLog(TWO);
    const heard = vi.fn();

    log.subscribe(heard);

    expect(log.complete("nope")).toBe(false);
    expect(heard).not.toHaveBeenCalled();
  });

  it("starts over on a reset, and says so only if something was done", () => {
    const log = new ObjectiveLog(TWO);
    const heard = vi.fn();

    log.subscribe(heard);
    log.reset();
    expect(heard).not.toHaveBeenCalled();

    log.complete("a");
    log.reset();
    expect(heard).toHaveBeenLastCalledWith({ kind: "reset" });
    expect(log.stateOf("a")).toBe("current");
  });

  it("walks the whole mission in order, each step once", () => {
    const log = new ObjectiveLog(OBJECTIVES);

    log.pickupTaken("DYNAMITE");
    expect(log.complete(OBJECTIVE_ID.ENTER)).toBe(false);

    for (const id of [
      OBJECTIVE_ID.CLEAR,
      OBJECTIVE_ID.GET_CLEAR,
      OBJECTIVE_ID.ENTER,
    ]) {
      expect(log.complete(id)).toBe(true);
      expect(log.complete(id)).toBe(false);
    }

    expect(log.entries().map((e) => e.state)).toEqual([
      "completed",
      "completed",
      "completed",
      "completed",
    ]);
  });

  it("stops telling a listener that has unsubscribed", () => {
    const log = new ObjectiveLog(TWO);
    const heard = vi.fn();
    const stop = log.subscribe(heard);

    stop();
    log.complete("a");

    expect(heard).not.toHaveBeenCalled();
  });
});
