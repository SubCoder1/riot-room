import { describe, expect, it, vi } from "vitest";

import {
  OBJECTIVES,
  ObjectiveLog,
  type ObjectiveDefinition,
} from "../../src/mission/Objectives";

const TWO: readonly ObjectiveDefinition[] = [
  { id: "a", label: "First", completesOnPickup: "ONE" },
  { id: "b", label: "Second", completesOnPickup: "TWO" },
];

describe("The mission", () => {
  it("has exactly one objective for now: collect dynamites from the Armory", () => {
    expect(OBJECTIVES).toHaveLength(1);
    expect(OBJECTIVES[0].label).toBe("Collect dynamites from Armory");
    expect(OBJECTIVES[0].completesOnPickup).toBe("DYNAMITE");
  });
});

describe("ObjectiveLog", () => {
  it("starts with the first objective current and the others upcoming", () => {
    const log = new ObjectiveLog(TWO);

    expect(log.stateOf("a")).toBe("current");
    expect(log.stateOf("b")).toBe("upcoming");
    expect(log.remaining().map((r) => r.definition.id)).toEqual(["a", "b"]);
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
    // The next one becomes current by itself (and none is added).
    expect(log.stateOf("b")).toBe("current");
    expect(log.remaining().map((r) => r.definition.id)).toEqual(["b"]);
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

  it("stops telling a listener that has unsubscribed", () => {
    const log = new ObjectiveLog(TWO);
    const heard = vi.fn();
    const stop = log.subscribe(heard);

    stop();
    log.complete("a");

    expect(heard).not.toHaveBeenCalled();
  });
});
