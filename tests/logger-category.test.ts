import { describe, expect, it, vi } from "vitest";
import type { HabitDefinition } from "../src/types";
import type { WidgetContext } from "../src/dashboard/types";
import { LoggerWidget, resolveLoggerHabits } from "../src/dashboard/widgets/logger-widget";
import { Element } from "./helpers/obsidian-ui";

const habit = (id: string, category?: string, enabled = true): HabitDefinition => ({
  id, name: id, category, enabled, unit: "count", cadence: "daily", targetHistory: []
});
const selection = {
  settings: { timezone: "UTC", habits: [
    habit("pullups", "Fitness"), habit("reading", "Study"), habit("running", "fitness"),
    habit("cycling", "Fitness", false), habit("hydration")
  ] },
  habitFilter: "overall"
};
const ids = (config?: Record<string, unknown>, filter: Partial<typeof selection> & { habitFilters?: string[] } = {}) =>
  resolveLoggerHabits({ ...selection, ...filter }, config).map(h => h.id);

describe("category logger selection", () => {
  it("matches category labels without case or surrounding whitespace and keeps settings order", () => {
    expect(ids({ category: " FITNESS " })).toEqual(["pullups", "running"]);
  });

  it("limits explicit habit selections to the category and preserves explicit order", () => {
    expect(ids({ category: "Fitness", habits: ["running", "reading", "pullups"] }))
      .toEqual(["running", "pullups"]);
    expect(ids({ category: "Fitness" }, { habitFilters: ["reading", "running"] })).toEqual(["running"]);
    expect(ids({ category: "Fitness" }, { habitFilter: "reading" })).toEqual([]);
    expect(ids({ category: "Fitness", habits: ["missing", "cycling"] })).toEqual([]);
  });

  it("preserves existing filters when no category is assigned", () => {
    expect(ids()).toEqual(["pullups", "reading", "running", "hydration"]);
    expect(ids({ category: " " }, { habitFilter: "reading" })).toEqual(["reading"]);
  });

  it("renders an empty message for unmatched categories without opening an unfiltered logger", async () => {
    const container = new Element();
    const store = { readLog: vi.fn() };
    const context = { ...selection, host: { store }, today: "2026-11-08" } as unknown as WidgetContext;
    await new LoggerWidget().render(container.element(), context, { category: "Chores" });
    expect(container.textContent).toContain("No enabled habits");
    expect(container.textContent).toContain("Chores");
    expect(container.children[0].attrs.role).toBe("status");
    expect(store.readLog).not.toHaveBeenCalled();
  });
});
