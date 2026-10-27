import type { ObjectiveLog, ObjectiveState } from "../mission/Objectives";

/**
 * The objectives list, left of the screen. It draws what the mission state
 * (`ObjectiveLog`) says and touches the page only when that changes: nothing
 * runs per frame, and no animation loop.
 *
 * A completed objective turns green with a tick and a strikethrough, rests a
 * moment, then slides up and fades out and is taken off the list, leaving the
 * heading. With reduced motion the same steps happen without movement or fade.
 * Rows are joined by a dashed line behind their circles when there are several
 * (none for one), the list is bounded in height, and it scrolls the current
 * objective into view, after a completed row has left.
 */

/** How long a completed row stays as it is, before it leaves (ms). */
const HOLD_MS = 650;
/** How long its exit takes (ms); the CSS transition has the same length. */
const EXIT_MS = 320;
/** With reduced motion: how long the completed row is shown, then it is gone. */
const REDUCED_HOLD_MS = 900;

const CHECK =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.4 6.3l2.4 2.4 4.8-5.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const reducedMotion = (): boolean =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export class ObjectivesView {
  private readonly root = document.createElement("div");
  private readonly list = document.createElement("ol");
  private readonly rows = new Map<string, HTMLLIElement>();
  private readonly timers = new Set<number>();
  private readonly stop: () => void;
  private readonly log: ObjectiveLog;

  constructor(parent: HTMLElement, log: ObjectiveLog) {
    const title = document.createElement("div");

    this.log = log;

    this.root.className = "objectives";
    this.root.setAttribute("role", "region");
    this.root.setAttribute("aria-label", "Objectives");
    title.className = "objectives__title";
    title.textContent = "OBJECTIVES";
    this.list.className = "objectives__list";
    this.root.append(title, this.list);
    parent.append(this.root);

    this.rebuild();
    this.stop = log.subscribe((change) => {
      if (change.kind === "completed") {
        this.complete(change.id);
      } else {
        this.rebuild();
      }
    });
  }

  /** Draws every objective still to show, as it is now (no animation). */
  private rebuild(): void {
    this.clearTimers();
    this.rows.clear();
    this.list.replaceChildren();

    for (const { definition, state } of this.log.remaining()) {
      const row = document.createElement("li");
      const dot = document.createElement("span");
      const text = document.createElement("span");

      row.className = "objective";
      row.dataset.id = definition.id;
      dot.className = "objective__dot";
      dot.innerHTML = CHECK;
      text.className = "objective__text";
      text.textContent = definition.label;
      row.append(dot, text);
      this.setState(row, state);
      this.rows.set(definition.id, row);
      this.list.append(row);
    }

    this.scrollToCurrent(false);
  }

  private setState(row: HTMLElement, state: ObjectiveState): void {
    row.classList.toggle("is-current", state === "current");
    row.classList.toggle("is-upcoming", state === "upcoming");
  }

  /** The row for `id` turns to its done look, then leaves the list. */
  private complete(id: string): void {
    const row = this.rows.get(id);

    if (!row || row.classList.contains("is-complete")) {
      return;
    }

    row.classList.remove("is-current", "is-upcoming");
    row.classList.add("is-complete");

    if (reducedMotion()) {
      this.later(() => this.remove(id), REDUCED_HOLD_MS);

      return;
    }

    this.later(() => {
      // Fix the height first, so the row can shrink smoothly as it fades.
      row.style.height = `${row.offsetHeight}px`;
      void row.offsetHeight;
      row.classList.add("is-leaving");
      this.later(() => this.remove(id), EXIT_MS);
    }, HOLD_MS);
  }

  private remove(id: string): void {
    this.rows.get(id)?.remove();
    this.rows.delete(id);

    // What is now current takes its look, and is brought into view.
    for (const { definition, state } of this.log.remaining()) {
      const row = this.rows.get(definition.id);

      if (row) {
        this.setState(row, state);
      }
    }

    this.scrollToCurrent(true);
  }

  /** Scrolls the list just enough to show the current row (if it is hidden). */
  private scrollToCurrent(animate: boolean): void {
    const row = this.list.querySelector<HTMLElement>(".is-current");

    if (!row) {
      return;
    }

    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    const view = this.list.scrollTop;

    if (top >= view && bottom <= view + this.list.clientHeight) {
      return;
    }

    this.list.scrollTo?.({
      top: Math.max(top - 6, 0),
      behavior: animate && !reducedMotion() ? "smooth" : "auto",
    });
  }

  private later(action: () => void, ms: number): void {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      action();
    }, ms);

    this.timers.add(timer);
  }

  private clearTimers(): void {
    for (const timer of this.timers) {
      window.clearTimeout(timer);
    }

    this.timers.clear();
  }

  public dispose(): void {
    this.stop();
    this.clearTimers();
    this.root.remove();
  }
}
