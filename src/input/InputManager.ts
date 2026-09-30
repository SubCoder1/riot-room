export class InputManager {
  public yaw: number;
  public pitch: number;
  private readonly keys: Set<string>;
  private jumpQueued: boolean;
  private attackQueued: boolean;
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

    this.canvas.addEventListener("click", () => {
      if (!this.pointerLocked) {
        this.canvas.requestPointerLock();
      }
    });
  }

  public isPressed(code: string): boolean {
    return this.keys.has(code);
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
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
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
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked) {
      return;
    }

    this.yaw -= event.movementX * 0.0022;
    this.pitch = clamp(this.pitch - event.movementY * 0.0018, -1.25, 1.25);
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (event.button === 0) {
      this.attackQueued = true;
    }
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
