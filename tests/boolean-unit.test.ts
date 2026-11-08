import { afterEach, describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";
vi.mock("obsidian", async original => ({ ...await original<object>(), parseYaml: parse, stringifyYaml: stringify }));
import { HabitStore } from "../src/data";
import { parseDailyLog, serializeDailyLog } from "../src/log-schema";
import { calculateGoalProgress, evaluateDailyLog, evaluatePeriodGoal } from "../src/evaluation";
import { calculateHabitAnalytics } from "../src/analytics";
import { formatValue } from "../src/dashboard/format";
import { renderAnalyticsPanel } from "../src/analytics-panel";
import { HabitLogModal } from "../src/modals";
import type { HabitDefinition } from "../src/types";
import { memoryVault } from "./helpers/memory-vault";
import { Element } from "./helpers/obsidian-ui";

const day = "2026-11-02";
const habit: HabitDefinition = {
  id: "stretch", name: "Stretch", unit: "boolean", type: "metric", cadence: "daily", enabled: true,
  targetHistory: [{ effectiveDate: day }]
};
const log = (date: string, done: boolean) => parseDailyLog({
  temperans: "habit-log", temperans_schema: 3, date, stretch: { value: done, source: "manual" }
}, date);

function fixture() {
  const f = memoryVault();
  f.put("Habit Logs/Settings.md", `---\n${stringify({ timezone: "UTC", habits: [habit] })}---\n`);
  return { ...f, store: new HabitStore(f.app, "Habit Logs") };
}

afterEach(() => vi.useRealTimers());

describe("Boolean habit unit", () => {
  it("stores true and false as YAML booleans and preserves them when another habit is edited", async () => {
    const f = fixture();
    await f.store.recordMetric(day, habit.id, true, "Before breakfast");
    await f.store.recordMetric(day, "pages", 20);
    const path = await f.store.pathFor(day);
    const raw = () => parse(f.contents.get(path)!.split("---")[1]);
    expect(raw().stretch).toEqual({ value: true, source: "manual", note: "Before breakfast" });
    f.store.invalidate();
    expect((await f.store.getLog(day)).metrics.stretch).toBe(1);
    await f.store.recordMetric(day, habit.id, false);
    expect(raw().stretch).toEqual({ value: false, source: "manual" });
    expect(raw().pages.value).toBe(20);
    await f.store.recordMetric(day, habit.id, 5);
    expect(raw().stretch.value).toBe(5);
  });

  it.each([true, false])("round-trips %s and displays completion without a count", done => {
    const parsed = log(day, done);
    expect(parsed.metrics.stretch).toBe(Number(done));
    expect(serializeDailyLog(parsed, {}).stretch).toEqual({ value: done, source: "manual" });
    expect(formatValue(Number(done), "boolean", habit)).toBe(done ? "Done" : "Not done");
  });

  it("preserves earlier session details when an entry is saved as a Boolean", () => {
    const sessions = [{ title: "Morning stretch", minutes: 10 }];
    const parsed = log(day, true);
    parsed.sessions.stretch = sessions;
    expect(serializeDailyLog(parsed, {}).stretch).toEqual({ value: true, source: "manual", sessions });
  });

  it("respects effective dates and counts repeated completion as one success per cadence", () => {
    const settings = { timezone: "UTC", habits: [habit] };
    expect(evaluateDailyLog(log("2026-11-01", true), "2026-11-01", settings).score).toBeNull();
    expect(evaluateDailyLog(log(day, true), day, settings).score).toBe(1);
    expect(evaluateDailyLog(log(day, false), day, settings).score).toBe(0);
    const weekly = { ...habit, cadence: "weekly" as const };
    const logs = new Map([day, "2026-11-03", "2026-11-09"].map(date => [date, log(date, true)]));
    const period = evaluatePeriodGoal(weekly, "2026-11-03", logs);
    expect(period).toMatchObject({ value: 2, status: "complete", progress: 1 });
    expect(calculateGoalProgress(2, habit.targetHistory[0], habit).progress).toBe(1);
    const stats = calculateHabitAnalytics(weekly,
      [day, "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"], logs, "2026-11-09");
    expect(stats).toMatchObject({ completedPeriods: 2, currentStreak: 2, bestStreak: 2 });
  });

  it("keeps avoidance semantics when Boolean is the unit", () => {
    const avoidance = { ...habit, type: "avoidance" as const };
    const settings = { timezone: "UTC", habits: [avoidance] };
    expect(evaluateDailyLog(log(day, false), day, settings).score).toBe(1);
    expect(evaluateDailyLog(log(day, true), day, settings).score).toBe(0);
  });

  it("saves a completion toggle without requiring a numeric field or Finish", async () => {
    vi.useFakeTimers();
    const f = fixture(), root = new Element();
    Object.assign(root, { ownerDocument: { defaultView: globalThis } });
    const modal = new HabitLogModal(f.app, f.store, day, [habit], undefined, undefined, undefined, true);
    await modal.mountInline(root.element());
    expect(root.all().some(node => node.setting?.name === "Progress amount")).toBe(false);
    root.field("Done").controls[0].change(true);
    await vi.advanceTimersByTimeAsync(801);
    expect((await f.store.getLog(day)).booleanValues?.stretch).toBe(true);
    root.field("Done").controls[0].change(false);
    await vi.advanceTimersByTimeAsync(801);
    expect((await f.store.getLog(day)).booleanValues?.stretch).toBe(false);
  });

  it("shows consistency and streaks without count-style averages in the analytics summary", () => {
    const root = new Element();
    const stats = calculateHabitAnalytics(habit, [day], new Map([[day, log(day, true)]]), day);
    renderAnalyticsPanel(root.element(), { year: 2026, asOfDate: day, timezone: "UTC", habits: [{ habit, stats }] });
    expect(root.textContent).toContain("100%");
    expect(root.textContent).toContain("Current streak");
    expect(root.textContent).not.toContain("Avg /");
    expect(root.textContent).not.toContain("Total volume");
  });
});
