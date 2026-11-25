import { t } from "../../i18n";

const statusLabelMap: Record<string, string> = { complete: "status.complete", partial: "status.partial", missed: "status.missed", pending: "status.pending" };
const statusLabel = (s: string): string => {
  const k = statusLabelMap[s];
  return k ? t(k as any) : s;
};

import { refreshInBackground } from "../background-refresh";
import { setIcon } from "obsidian";
import { formatDate } from "../../date";
import { evaluatePeriodGoal, typingDurationSeconds, typingTestCount } from "../../evaluation";
import { formatTypingDuration } from "../../durations";
import { HabitLogModal } from "../../modals";
import { renderSourceIcon } from "../../source-icon";
import { formatValue, targetLabel } from "../format";
import { DashboardWidget, WidgetContext } from "../types";
import { DailyLog, HabitId } from "../../types";
import { isBooleanUnit } from "../../habit-options";

function noteForHabit(log: DailyLog, habitId: HabitId): string | undefined {
  return habitId === "typing" ? log.typing.note : log.metricNotes[habitId];
}

function typingSummary(log: DailyLog): string {
  const totalSeconds = Math.round(typingDurationSeconds(log));
  const duration = formatTypingDuration(totalSeconds);
  const tests = typingTestCount(log);
  const testPrefix = tests > 0 ? `${formatValue(tests, "tests")} · ` : "";
  return `${testPrefix}${duration}`;
}

export class DayDetailWidget implements DashboardWidget {
  id = "day-detail";
  name = t("widget.dayDetail.name");
  description = t("widget.dayDetail.description");

  render(container: HTMLElement, ctx: WidgetContext, config?: Record<string, unknown>): void {
    container.empty();
    container.addClass("temperans-day-detail-panel");

    const detailHeader = container.createDiv({ cls: "temperans-detail-heading" });
    const detailScroll = container.createDiv({ cls: "temperans-day-detail-scroll" });

    this.renderSelectedDay(detailHeader, detailScroll, ctx, config);
  }

  update(container: HTMLElement, ctx: WidgetContext, config?: Record<string, unknown>): void {
    const detailHeader = container.querySelector<HTMLElement>(".temperans-detail-heading");
    const detailScroll = container.querySelector<HTMLElement>(".temperans-day-detail-scroll");
    if (detailHeader && detailScroll) {
      this.renderSelectedDay(detailHeader, detailScroll, ctx, config);
    } else {
      this.render(container, ctx, config);
    }
  }

  private renderSelectedDay(header: HTMLElement, scroll: HTMLElement, ctx: WidgetContext, config?: Record<string, unknown>): void {
    header.empty();
    scroll.empty();
    scroll.scrollTop = 0;

    const date = ctx.selectedDate;
    const evaluation = date ? ctx.evaluations.get(date) : undefined;
    if (!date || !evaluation) {
      header.createEl("h3", { text: t("widget.dayDetail.noDaysYet") });
      scroll.createEl("p", {
        cls: "temperans-empty-detail",
        text: ctx.isCompact
          ? t("widget.dayDetail.emptyMonth")
          : t("widget.dayDetail.emptyPeriod")
      });
      return;
    }

    const log = ctx.logs.get(date) ?? {
      date,
      metrics: {},
      metricSources: {},
      metricNotes: {},
      sessions: {},
      typing: { manualTests: 0, manualDurationSeconds: 0, imported: [] },
      reading: []
    };

    const filterSet = ctx.habitFilters && ctx.habitFilters.length > 0
      ? new Set(ctx.habitFilters)
      : ctx.habitFilter !== "overall"
      ? new Set([ctx.habitFilter])
      : undefined;
    const targetHabitId = filterSet?.size === 1 ? [...filterSet][0] : undefined;

    header.createEl("h3", { text: formatDate(evaluation.date) });
    const editButton = header.createEl("button", {
      cls: "temperans-edit-day",
      attr: { "aria-label": t("widget.dayDetail.editDay", { date: formatDate(evaluation.date) }) }
    });
    setIcon(editButton, "square-pen");
    editButton.onclick = () => new HabitLogModal(
      ctx.app,
      ctx.host.store,
      evaluation.date,
      ctx.settings.habits.filter((h) => h.enabled && (!filterSet || filterSet.has(h.id))),
      targetHabitId,
      async () => refreshInBackground(ctx),
      async (habitId) => {
        await ctx.host.syncEndpointHabit(habitId);
        await ctx.onRefresh();
      }
    ).open();

    const detail = scroll.createDiv({ cls: "temperans-day-detail" });
    const daily = evaluation.habits.filter((item) =>
      item.habit.enabled &&
      item.habit.cadence === "daily" &&
      (!filterSet || filterSet.has(item.habit.id))
    );
    const periodic = ctx.settings.habits.filter((h) =>
      h.enabled &&
      h.cadence !== "daily" &&
      (!filterSet || filterSet.has(h.id))
    );

    if (!daily.length && !periodic.length) {
      detail.createEl("p", { cls: "temperans-empty-detail", text: t("widget.dayDetail.noEnabledTasks") });
      return;
    }

    const showSessions = config?.showSessions !== false;
    const showNotes = config?.showNotes !== false;

    const list = detail.createDiv({ cls: "temperans-detail-list" });
    for (const item of daily) {
      const row = list.createDiv({ cls: `temperans-detail-row is-${item.status}` });
      row.createSpan({ text: item.habit.name, cls: "temperans-detail-name" });
      const valueSpan = row.createSpan({ cls: "temperans-detail-value" });
      const booleanUnit = isBooleanUnit(item.habit.unit);
      const actual = item.habit.id === "typing" && !booleanUnit ? typingSummary(log) : formatValue(item.value, item.habit.unit, item.habit);
      valueSpan.createSpan({ text: booleanUnit ? actual : `${actual} / ${targetLabel(item.target, item.habit)}` });
      const source = log.metricSources[item.habit.id];
      if (source && source !== "manual") {
        renderSourceIcon(valueSpan, source, setIcon);
      }
      row.createSpan({ text: statusLabel(item.status), cls: "temperans-status" });
      const note = noteForHabit(log, item.habit.id);
      if (showNotes && note) list.createDiv({ cls: "temperans-detail-note", text: note });
    }

    if (periodic.length && ctx.periodsPending) {
      detail.createDiv({ cls: "temperans-loading-status", text: ctx.periodsError ? t("widget.dayDetail.loadError") : t("widget.dayDetail.loadingTotals"), attr: { role: "status" } });
      if (ctx.periodsError) detail.createEl("button", { text: t("log.retry"), attr: { type: "button" } }).onclick = () => refreshInBackground(ctx);
    }
    if (periodic.length && !ctx.periodsPending) {
      const goals = detail.createDiv({ cls: "temperans-detail-period-goals" });
      goals.createEl("strong", { text: t("widget.dayDetail.periodGoals") });
      for (const habit of periodic) {
        const period = evaluatePeriodGoal(habit, evaluation.date, ctx.logs);
        const row = goals.createDiv({ cls: `temperans-detail-row is-${period.status}` });
        row.createSpan({ text: `${habit.name} (${habit.cadence})`, cls: "temperans-detail-name" });
        const valueSpan = row.createSpan({ cls: "temperans-detail-value" });
        const actual = formatValue(period.value, habit.unit, habit);
        valueSpan.createSpan({ text: isBooleanUnit(habit.unit) ? actual : `${actual} / ${targetLabel(period.target, habit)}` });
        const source = log.metricSources[habit.id];
        if (source && source !== "manual") {
          renderSourceIcon(valueSpan, source, setIcon);
        }
        row.createSpan({ text: statusLabel(period.status), cls: "temperans-status" });
        const note = noteForHabit(log, habit.id);
        if (showNotes && note) goals.createDiv({ cls: "temperans-detail-note", text: note });
      }
    }

    if (!showSessions) return;

    const allSessions = { ...log.sessions };
    if (log.reading?.length && !allSessions.reading) allSessions.reading = log.reading;

    for (const [habitId, sessions] of Object.entries(allSessions)) {
      if (!sessions || !sessions.length) continue;
      if (filterSet && !filterSet.has(habitId)) continue;
      const habitDef = ctx.settings.habits.find((h) => h.id === habitId);
      const habitName = habitDef?.name || (habitId === "reading" ? t("widget.dayDetail.reading") : habitId);
      const sessionBlock = detail.createDiv({ cls: "temperans-reading" });
      sessionBlock.createEl("strong", { text: t("widget.dayDetail.sessions", { name: habitName }) });
      for (const session of sessions) {
        const dimensions = session.values?.map((value, index) => {
          const unit = session.units?.[index];
          return value > 0 ? `${value}${unit ? ` ${unit}` : ""}` : "";
        }).filter(Boolean) ?? [];
        const parts = dimensions.length > 0 ? dimensions : [
          session.pages ? `${t("widget.dayDetail.pages", { n: session.pages })}` : "",
          session.chapters ? `${t("widget.dayDetail.chapters", { n: session.chapters })}` : "",
          session.minutes ? `${t("widget.dayDetail.minutes", { n: session.minutes })}` : "",
          session.reps ? `${t("widget.dayDetail.reps", { n: session.reps })}` : "",
          session.count ? `${session.count}` : ""
        ].filter(Boolean);
        const details = parts.length > 0 ? ` — ${parts.join(" · ")}` : "";
        sessionBlock.createDiv({ text: `${session.title}${details}${session.note ? ` · ${session.note}` : ""}` });
      }
    }
  }
}
