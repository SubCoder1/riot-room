export class InputManager {
  public yaw: number;
  public pitch: number;
  private readonly keys: Set<string>;
  private jumpQueued: boolean;
  private attackQueued: boolean;
  private readonly mouseButtons = new Set<number>();
  public pointerLocked: boolean;
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.yaw = 0;
    this.pitch = -0.1;
    this.keys = new Set<string>();
    this.jumpQueued = false;
    this.attackQueued = false;
    this.pointerLocked = false;

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    document.addEventListener(
      "pointerlockchange",
      this.handlePointerLockChange,
    );
    document.addEventListener("mousemove", this.handleMouseMove);
    this.canvas.addEventListener("mousedown", this.handleMouseDown);
    window.addEventListener("mouseup", this.handleMouseUp);
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);

    this.canvas.addEventListener("click", () => {
      if (!this.pointerLocked) {
        this.canvas.requestPointerLock();
      }
    });
  }

  public isPressed(code: string): boolean {
    return this.keys.has(code);
  }

  /** True while the given mouse button (0 = left, 2 = right) is held. */
  public isMouseDown(button: number): boolean {
    return this.mouseButtons.has(button);
  }

  public consumeJump(): boolean {
    const shouldJump = this.jumpQueued;
    this.jumpQueued = false;
    return shouldJump;
  }

  public consumeAttack(): boolean {
    const shouldAttack = this.attackQueued;
    this.attackQueued = false;
    return shouldAttack;
  }

  public dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    document.removeEventListener(
      "pointerlockchange",
      this.handlePointerLockChange,
    );
    document.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    // F4 / F6 are dev keys (combat debug, dummy guard); keep the browser from
    // using them for its own shortcuts.
    if (
      event.code === "F4" ||
      event.code === "F6" ||
      event.code === "F7" ||
      event.code === "F8" ||
      event.code === "F9"
    ) {
      event.preventDefault();
    }

    const wasHeld = this.keys.has(event.code);
    this.keys.add(event.code);

    if (event.code === "Space" && !wasHeld) {
      this.jumpQueued = true;
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly handlePointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.canvas;

    if (!this.pointerLocked) {
      this.mouseButtons.clear();
    }
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked) {
      return;
    }

    this.yaw -= event.movementX * 0.0022;
    this.pitch = clamp(this.pitch - event.movementY * 0.0018, -1.25, 1.25);
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    // The first click only captures the pointer; it shouldn't also punch.
    if (event.button === 0 && this.pointerLocked) {
      this.attackQueued = true;
    }

    if (this.pointerLocked) {
      this.mouseButtons.add(event.button);
    }
  };

  private readonly handleMouseUp = (event: MouseEvent): void => {
    this.mouseButtons.delete(event.button);
  };

  // Right click is the block button; don't open the browser context menu.
  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
