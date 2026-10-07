import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InputManager } from "../../src/input/InputManager";

describe("InputManager: the mouse wheel", () => {
  let input: InputManager;

  const wheel = (deltaY: number, deltaMode = 0): WheelEvent => {
    const event = new WheelEvent("wheel", {
      deltaY,
      deltaMode,
      cancelable: true,
    });

    window.dispatchEvent(event);

    return event;
  };

  beforeEach(() => {
    input = new InputManager(document.createElement("canvas"));
    input.pointerLocked = true;
  });

  afterEach(() => {
    input.dispose();
  });

  it("one notch is one step, in either direction", () => {
    wheel(100);
    expect(input.consumeWheelSteps()).toBe(1);

    wheel(-100);
    expect(input.consumeWheelSteps()).toBe(-1);

    expect(input.consumeWheelSteps()).toBe(0);
  });

  it("several notches add up, and line-based wheels count too", () => {
    wheel(100);
    wheel(100);
    wheel(100);
    expect(input.consumeWheelSteps()).toBe(3);

    wheel(3, 1); // 3 lines: a typical notch in some browsers
    expect(input.consumeWheelSteps()).toBe(1);
  });

  it("small trackpad scrolls build up into whole steps without losing the remainder", () => {
    wheel(40);
    wheel(40);
    expect(input.consumeWheelSteps()).toBe(0);

    wheel(40);
    expect(input.consumeWheelSteps()).toBe(1);

    wheel(80);
    expect(input.consumeWheelSteps()).toBe(1);
  });

  it("the page never scrolls while playing", () => {
    expect(wheel(100).defaultPrevented).toBe(true);
  });

  it("is ignored before the pointer is captured", () => {
    input.pointerLocked = false;

    const event = wheel(300);

    expect(event.defaultPrevented).toBe(false);
    expect(input.consumeWheelSteps()).toBe(0);
  });

  it("Tab is no longer used by the game: it keeps its normal browser behaviour", () => {
    const down = new KeyboardEvent("keydown", {
      code: "Tab",
      cancelable: true,
    });

    window.dispatchEvent(down);

    expect(down.defaultPrevented).toBe(false);
  });

  it("losing focus lets go of held keys", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    expect(input.isPressed("KeyW")).toBe(true);

    window.dispatchEvent(new Event("blur"));

    expect(input.isPressed("KeyW")).toBe(false);
  });
});
