import { t, plural } from "./i18n";
import { calculateAllHabitsAnalytics } from "./analytics";
import type { HabitAnalytics } from "./analytics";
import { daysInYear, formatDate, todayInZone } from "./date";
import { formatTotalVolume, formatValue } from "./dashboard/format";
import type { HabitStore } from "./data";
import type { HabitDefinition } from "./types";
import { isBooleanUnit } from "./habit-options";

export interface AnalyticsSummaryData {
  year: number;
  asOfDate: string;
  timezone: string;
  habits: Array<{ habit: HabitDefinition; stats: HabitAnalytics }>;
}

export async function loadAnalyticsSummaryData(store: HabitStore, year?: number): Promise<AnalyticsSummaryData> {
  const settings = await store.loadSettings();
  const today = todayInZone(settings.timezone);
  const reportYear = year ?? Number(today.slice(0, 4));
  const logs = await store.allLogsForYear(reportYear);
  const dates = daysInYear(reportYear);
  const analyticsMap = calculateAllHabitsAnalytics(settings.habits, dates, logs, today);
  const habits = settings.habits
    .filter((habit) => habit.enabled)
    .flatMap((habit) => {
      const stats = analyticsMap.get(habit.id);
      return stats ? [{ habit, stats }] : [];
    });
  return { year: reportYear, asOfDate: today, timezone: settings.timezone, habits };
}

export function renderAnalyticsPanel(container: HTMLElement, summary: AnalyticsSummaryData, showPeakDate = true): void {
  if (!summary.habits.length) {
    container.createEl("p", { text: t("notice.noEnabledFound") });
    return;
  }

  const grid = container.createDiv({ cls: "temperans-analytics-grid" });

  for (const { habit, stats } of summary.habits) {
    const card = grid.createDiv({ cls: "temperans-analytics-card" });
    const cardHeader = card.createDiv({ cls: "temperans-analytics-card-header" });
    cardHeader.createEl("h3", { text: habit.name });
    cardHeader.createSpan({ text: habit.cadence, cls: "temperans-analytics-cadence-badge" });

    const metricsList = card.createDiv({ cls: "temperans-analytics-metrics" });

    const periodSingular = habit.cadence === "weekly" ? t("analytics.week")
      : habit.cadence === "monthly" ? t("analytics.month")
      : habit.cadence === "quarterly" ? t("analytics.quarter")
      : t("analytics.year");
    const streakSingular = habit.cadence === "daily" ? t("analytics.day") : periodSingular;
    const periodTag = habit.cadence === "weekly" ? "analytics.pluralWeek"
      : habit.cadence === "monthly" ? "analytics.pluralMonth"
      : habit.cadence === "quarterly" ? "analytics.pluralQuarter"
      : "analytics.pluralYear";
    const streakTag = habit.cadence === "daily" ? "plural.dayForms" : periodTag;

    const consistencyLabel = habit.cadence === "daily"
      ? `${Math.round(stats.consistencyRate * 100)}% (${stats.completedDays} / ${stats.totalDays} ${plural(stats.totalDays, "plural.dayForms")})`
      : `${Math.round(stats.consistencyRate * 100)}% (${stats.completedPeriods ?? 0} / ${stats.totalPeriods ?? 0} ${plural(stats.totalPeriods ?? 0, periodTag)})`;

    addMetricRow(metricsList, t("analytics.consistencyRate"), consistencyLabel);
    if (!isBooleanUnit(habit.unit)) {
      addMetricRow(metricsList, t("analytics.totalVolume"), formatTotalVolume(stats.totalVolume, habit.unit, habit));
      const activeDayCount = habit.cadence === "daily"
        ? ""
        : ` (${stats.activeDays} ${plural(stats.activeDays, "analytics.pluralActiveDay")})`;
      addMetricRow(metricsList, t("analytics.avgActiveDay"), `${formatValue(stats.averageActiveDays, habit.unit, habit)}${activeDayCount}`);
      if (habit.cadence !== "daily") {
        addMetricRow(metricsList, t("analytics.avgPeriod", { period: periodSingular }), formatValue(stats.periodAverage ?? 0, habit.unit, habit));
      }

      if (stats.peakValue > 0) {
        const peakDateFormatted = showPeakDate && stats.peakDate ? ` (${formatDate(stats.peakDate)})` : "";
        addMetricRow(metricsList, t("analytics.peakDay"), `${formatValue(stats.peakValue, habit.unit, habit)}${peakDateFormatted}`);
      }
    }

    addMetricRow(metricsList, t("analytics.currentStreak"), `${stats.currentStreak} ${plural(stats.currentStreak, streakTag)}`);
    addMetricRow(metricsList, t("analytics.bestStreak"), `${stats.bestStreak} ${plural(stats.bestStreak, streakTag)}`);
  }
}

function addMetricRow(container: HTMLElement, label: string, value: string): void {
  const row = container.createDiv({ cls: "temperans-analytics-row" });
  row.createSpan({ text: label, cls: "temperans-analytics-label" });
  row.createSpan({ text: value, cls: "temperans-analytics-val" });
}
