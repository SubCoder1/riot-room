/**
 * The screen shown while the game starts. It is plain DOM, made before any of
 * the 3D code runs, so it is on screen from the first paint. Its bar shows how
 * many of the start-up stages are finished (a count of real steps, never a
 * guessed percentage); the stage in progress is named, and a timer shows it is
 * still working during the long ones.
 */
export const STAGE_COUNT = 3;

export class LoadingScreen {
  private readonly root = document.createElement("div");
  private readonly label = document.createElement("div");
  private readonly fill = document.createElement("div");
  private readonly clock = document.createElement("div");
  private readonly startedAt = performance.now();
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.root.className = "loading-screen";
    this.root.setAttribute("role", "status");
    this.root.innerHTML =
      '<div class="loading-title">RIOT ROOM</div><div class="loading-bar"></div>';
    this.label.className = "loading-label";
    this.clock.className = "loading-clock";
    this.fill.className = "loading-fill";
    this.root.querySelector(".loading-bar")?.appendChild(this.fill);
    this.root.append(this.label, this.clock);
    parent.appendChild(this.root);
    this.timer = window.setInterval(() => this.tick(), 250);
  }

  private tick(): void {
    this.clock.textContent = `${((performance.now() - this.startedAt) / 1000).toFixed(0)} s`;
  }

  /** A stage has begun; `done` stages are already finished. */
  public stage(label: string, done: number): void {
    this.label.textContent = label;
    this.fill.style.width = `${(done / STAGE_COUNT) * 100}%`;
    this.root.classList.toggle("working", true);
    this.tick();
  }

  public fail(message: string): void {
    window.clearInterval(this.timer);
    this.label.textContent = message;
    this.root.classList.add("failed");
  }

  /** Everything is ready: fade out and remove. */
  public finish(): void {
    window.clearInterval(this.timer);
    this.fill.style.width = "100%";
    this.root.classList.add("done");
    window.setTimeout(() => this.root.remove(), 500);
  }
}
