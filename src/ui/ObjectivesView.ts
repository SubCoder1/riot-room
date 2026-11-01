import type { ObjectiveLog, ObjectiveState } from "../mission/Objectives";

/**
 * The objectives list, left of the screen. It draws what the mission state
 * (`ObjectiveLog`) says and touches the page only when that changes: nothing
 * runs per frame, and no animation loop.
 *
 * The list shows every objective, in mission order, together: a done one has a
 * green circle with a tick and a struck-through line, the current one an amber
 * circle and white text, one still to come a quiet grey circle and grey text. Rows are joined by a dashed line behind their circles
 * (only between rows that are shown). Nothing leaves the list.
 */

const CHECK =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.4 6.3l2.4 2.4 4.8-5.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export class ObjectivesView {
  private readonly root = document.createElement("div");
  private readonly list = document.createElement("ol");
  private readonly rows = new Map<string, HTMLLIElement>();
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

    this.refresh();
    this.stop = log.subscribe(() => this.refresh());
  }

  private makeRow(
    definition: { id: string; label: string },
    state: ObjectiveState,
  ): HTMLLIElement {
    {
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

      return row;
    }
  }

  private setState(row: HTMLElement, state: ObjectiveState): void {
    row.classList.toggle("is-current", state === "current");
    row.classList.toggle("is-upcoming", state === "upcoming");
    row.classList.toggle("is-complete", state === "completed");
  }

  /**
   * Brings the list up to date: a row is added when its objective comes up, a
   * row whose state changed is restyled, and after a reset the list starts
   * over. A row that stays is never rebuilt.
   */
  private refresh(): void {
    const shown = this.log.entries();

    // After a reset fewer are shown than before: start the list again.
    if (shown.length < this.rows.size) {
      this.rows.clear();
      this.list.replaceChildren();
    }

    for (const { definition, state } of shown) {
      const row = this.rows.get(definition.id);

      if (row) {
        this.setState(row, state);

        continue;
      }

      const made = this.makeRow(definition, state);

      this.rows.set(definition.id, made);
      this.list.append(made);
    }
  }

  public dispose(): void {
    this.stop();
    this.root.remove();
  }
}
