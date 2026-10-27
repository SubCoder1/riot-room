import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ObjectiveLog,
  OBJECTIVES,
  type ObjectiveDefinition,
} from "../../src/mission/Objectives";
import { ObjectivesView } from "../../src/ui/ObjectivesView";

const rows = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>(".objective"),
];

function reduceMotion(on: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

describe("ObjectivesView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reduceMotion(false);
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with the heading and one current objective, and nothing else", () => {
    const view = new ObjectivesView(
      document.body,
      new ObjectiveLog(OBJECTIVES),
    );

    expect(document.querySelector(".objectives__title")?.textContent).toBe(
      "OBJECTIVES",
    );
    expect(rows()).toHaveLength(1);
    expect(rows()[0].classList.contains("is-current")).toBe(true);
    expect(rows()[0].textContent).toContain("Collect dynamites from Armory");
    expect(document.querySelector(".is-upcoming")).toBeNull();

    view.dispose();
  });

  it("stays as it is until the objective is really completed", () => {
    const log = new ObjectiveLog(OBJECTIVES);

    new ObjectivesView(document.body, log);
    log.pickupTaken("GRENADE");
    vi.advanceTimersByTime(5000);

    expect(rows()).toHaveLength(1);
    expect(rows()[0].classList.contains("is-current")).toBe(true);
  });

  it("turns done, rests, leaves, and leaves only the heading", () => {
    const log = new ObjectiveLog(OBJECTIVES);

    new ObjectivesView(document.body, log);
    log.pickupTaken("DYNAMITE");

    const row = rows()[0];

    expect(row.classList.contains("is-complete")).toBe(true);
    expect(row.classList.contains("is-current")).toBe(false);
    expect(row.querySelector("svg")).not.toBeNull();
    expect(row.classList.contains("is-leaving")).toBe(false);

    vi.advanceTimersByTime(700);
    expect(rows()).toHaveLength(1);
    expect(row.classList.contains("is-leaving")).toBe(true);

    vi.advanceTimersByTime(400);
    expect(rows()).toHaveLength(0);
    expect(document.querySelector(".objectives__title")).not.toBeNull();
    // Nothing is added in its place.
    expect(document.querySelectorAll("li")).toHaveLength(0);
  });

  it("does not animate twice if completed again", () => {
    const log = new ObjectiveLog(OBJECTIVES);

    new ObjectivesView(document.body, log);
    log.pickupTaken("DYNAMITE");
    log.pickupTaken("DYNAMITE");
    log.complete("collect-dynamite");
    vi.advanceTimersByTime(2000);

    expect(rows()).toHaveLength(0);
  });

  it("with reduced motion shows the done look, then removes it without moving", () => {
    reduceMotion(true);

    const log = new ObjectiveLog(OBJECTIVES);

    new ObjectivesView(document.body, log);
    log.pickupTaken("DYNAMITE");

    const row = rows()[0];

    vi.advanceTimersByTime(500);
    expect(row.classList.contains("is-complete")).toBe(true);
    expect(row.classList.contains("is-leaving")).toBe(false);

    vi.advanceTimersByTime(600);
    expect(rows()).toHaveLength(0);
    expect(row.classList.contains("is-leaving")).toBe(false);
  });

  it("brings the next objective forward once a done one has left", () => {
    const two: readonly ObjectiveDefinition[] = [
      { id: "a", label: "First", completesOnPickup: "ONE" },
      { id: "b", label: "Second" },
    ];
    const log = new ObjectiveLog(two);

    new ObjectivesView(document.body, log);
    expect(rows().map((r) => r.className)).toEqual([
      "objective is-current",
      "objective is-upcoming",
    ]);

    log.pickupTaken("ONE");
    vi.advanceTimersByTime(1100);

    expect(rows()).toHaveLength(1);
    expect(rows()[0].dataset.id).toBe("b");
    expect(rows()[0].classList.contains("is-current")).toBe(true);
  });

  it("shows the objective again after a reset (a new round)", () => {
    const log = new ObjectiveLog(OBJECTIVES);

    new ObjectivesView(document.body, log);
    log.pickupTaken("DYNAMITE");
    vi.advanceTimersByTime(1100);
    expect(rows()).toHaveLength(0);

    log.reset();
    expect(rows()).toHaveLength(1);
    expect(rows()[0].classList.contains("is-current")).toBe(true);
  });

  it("cleans up: no timers or listeners are left after dispose", () => {
    const log = new ObjectiveLog(OBJECTIVES);
    const view = new ObjectivesView(document.body, log);

    log.pickupTaken("DYNAMITE");
    view.dispose();

    expect(document.querySelector(".objectives")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    // A later change reaches nobody.
    log.reset();
    expect(document.querySelector(".objective")).toBeNull();
  });
});
