import { beforeEach, describe, expect, it } from "vitest";

import {
  OBJECTIVE_ID,
  OBJECTIVES,
  ObjectiveLog,
} from "../../src/mission/Objectives";
import { ObjectivesView } from "../../src/ui/ObjectivesView";

const rows = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>(".objective"),
];
const states = (): string[] =>
  rows().map((r) =>
    r.classList.contains("is-complete")
      ? "done"
      : r.classList.contains("is-current")
        ? "current"
        : r.classList.contains("is-upcoming")
          ? "upcoming"
          : "?",
  );

describe("ObjectivesView", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("shows the heading and all four objectives together, the first current", () => {
    const view = new ObjectivesView(
      document.body,
      new ObjectiveLog(OBJECTIVES),
    );

    expect(document.querySelector(".objectives__title")?.textContent).toBe(
      "OBJECTIVES",
    );
    expect(rows().map((r) => r.textContent)).toEqual([
      "Locate The Ruins",
      "Enter The Ruins",
      "Retrieve the target component",
      "Reach the extraction point",
    ]);
    expect(states()).toEqual(["current", "upcoming", "upcoming", "upcoming"]);

    view.dispose();
  });

  it("follows the mission: a tick on each done row, the next one current", () => {
    const log = new ObjectiveLog(OBJECTIVES);

    new ObjectivesView(document.body, log);
    log.complete(OBJECTIVE_ID.LOCATE);
    expect(states()).toEqual(["done", "current", "upcoming", "upcoming"]);
    expect(rows()[0].querySelector("svg")).not.toBeNull();

    log.complete(OBJECTIVE_ID.ENTER);
    log.pickupTaken("COMPONENT");
    expect(states()).toEqual(["done", "done", "done", "current"]);

    log.complete(OBJECTIVE_ID.EXTRACT);
    expect(rows()).toHaveLength(4);
    expect(states()).toEqual(["done", "done", "done", "done"]);
  });

  it("only a step the game completes moves it on", () => {
    const log = new ObjectiveLog(OBJECTIVES);

    new ObjectivesView(document.body, log);
    log.complete(OBJECTIVE_ID.EXTRACT);
    log.complete(OBJECTIVE_ID.ENTER);
    log.pickupTaken("GRENADE");

    expect(states()).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
  });

  it("does not change twice if a step is completed again", () => {
    const log = new ObjectiveLog(OBJECTIVES);

    new ObjectivesView(document.body, log);
    log.complete(OBJECTIVE_ID.LOCATE);
    log.complete(OBJECTIVE_ID.LOCATE);

    expect(rows()).toHaveLength(4);
    expect(states()).toEqual(["done", "current", "upcoming", "upcoming"]);
  });

  it("starts the list over after a reset (a new round)", () => {
    const log = new ObjectiveLog(OBJECTIVES);

    new ObjectivesView(document.body, log);
    log.complete(OBJECTIVE_ID.LOCATE);
    log.complete(OBJECTIVE_ID.ENTER);
    log.reset();

    expect(rows()).toHaveLength(4);
    expect(states()).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
  });

  it("cleans up: nothing is left in the page after dispose, and a later change reaches nobody", () => {
    const log = new ObjectiveLog(OBJECTIVES);
    const view = new ObjectivesView(document.body, log);

    view.dispose();
    log.complete(OBJECTIVE_ID.LOCATE);

    expect(document.querySelector(".objectives")).toBeNull();
    expect(document.querySelector(".objective")).toBeNull();
  });
});
