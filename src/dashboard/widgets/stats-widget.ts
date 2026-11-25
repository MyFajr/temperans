import { t, plural, type LocaleKey } from "../../i18n";
import { yearOf } from "../../date";
import { calculateHabitAnalytics } from "../../analytics";
import { bestDailyStreak, calculateDailyStreak } from "../../evaluation";
import { cadenceLabel, formatStatValue } from "../format";
import { DashboardWidget, WidgetContext } from "../types";
import { isBooleanUnit } from "../../habit-options";

export class StatsWidget implements DashboardWidget {
  id = "stats";
  name = t("widget.stats.name");
  description = t("widget.stats.description");

  async render(container: HTMLElement, ctx: WidgetContext, config?: Record<string, unknown>): Promise<void> {
    container.empty();
    container.addClass("temperans-stats");

    const cardsData = await this.getCardsData(ctx, config);
    for (const item of cardsData) {
      const card = container.createDiv({ cls: "temperans-stat" });
      card.createSpan({ text: item.value, cls: "temperans-stat-value" });
      card.createSpan({ text: item.label, cls: "temperans-stat-label" });
    }
  }

  async update(container: HTMLElement, ctx: WidgetContext, config?: Record<string, unknown>): Promise<void> {
    const cardsData = await this.getCardsData(ctx, config);
    const existingCards = container.querySelectorAll<HTMLElement>(".temperans-stat");

    if (existingCards.length === cardsData.length) {
      for (let i = 0; i < cardsData.length; i++) {
        const card = existingCards[i];
        const valEl = card.querySelector<HTMLElement>(".temperans-stat-value");
        const lblEl = card.querySelector<HTMLElement>(".temperans-stat-label");
        if (valEl && valEl.textContent !== cardsData[i].value) valEl.textContent = cardsData[i].value;
        if (lblEl && lblEl.textContent !== cardsData[i].label) lblEl.textContent = cardsData[i].label;
      }
    } else {
      await this.render(container, ctx, config);
    }
  }

  private async getCardsData(ctx: WidgetContext, config?: Record<string, unknown>): Promise<Array<{ value: string; label: string }>> {
    const selectedHabit = ctx.habitFilter === "overall" ? undefined : ctx.settings.habits.find((h) => h.id === ctx.habitFilter);
    const availableCards: Record<string, { value: string; label: string }> = {};

    if (selectedHabit) {
      const analytics = ctx.analytics.get(selectedHabit.id) ?? calculateHabitAnalytics(selectedHabit, ctx.dates, ctx.logs, ctx.today);
      if (selectedHabit.cadence !== "daily") {
        const cadenceUnit = selectedHabit.cadence === "weekly" ? "week"
          : selectedHabit.cadence === "monthly" ? "month"
          : selectedHabit.cadence === "quarterly" ? "quarter"
          : "year";
        availableCards["consistency"] = { label: `${t("stats.cadenceConsistency", { cadence: cadenceLabel(selectedHabit.cadence) })}`, value: `${Math.round(analytics.consistencyRate * 100)}%` };
        availableCards["completed-days"] = { label: t("stats.completedPeriods"), value: `${analytics.completedPeriods ?? 0} / ${analytics.totalPeriods ?? 0}` };
        availableCards["total-volume"] = { label: t("stats.totalVolume"), value: formatStatValue(analytics.totalVolume, selectedHabit.unit, selectedHabit) };
        availableCards["active-average"] = {
          label: t("stats.avgPer", { unit: cadenceUnit }),
          value: formatStatValue(analytics.periodAverage ?? 0, selectedHabit.unit, selectedHabit)
        };
        availableCards["best-streak"] = { label: t("stats.bestPeriodPeak"), value: formatStatValue(analytics.bestPeriodValue ?? 0, selectedHabit.unit, selectedHabit) };
        availableCards["peak-day"] = { label: t("stats.peakDay"), value: formatStatValue(analytics.peakValue, selectedHabit.unit, selectedHabit) };
      } else {
        const isAvoidance = selectedHabit.type === "avoidance";
        const isTracker = selectedHabit.type === "tracker";

        availableCards["consistency"] = {
          label: isTracker ? t("stats.loggingRate") : isAvoidance ? t("stats.cleanRate") : t("stats.habitConsistency"),
          value: `${Math.round(analytics.consistencyRate * 100)}%`
        };
        availableCards["completed-days"] = {
          label: isTracker ? t("stats.daysLogged") : isAvoidance ? t("stats.cleanDays") : t("stats.completedDays"),
          value: isTracker ? `${analytics.activeDays} / ${analytics.totalDays}` : `${analytics.completedDays} / ${analytics.totalDays}`
        };
        availableCards["partial-days"] = { label: t("stats.partialDays"), value: String(analytics.partialDays) };
        availableCards["missed-days"] = {
          label: isAvoidance ? t("stats.slipDays") : t("stats.missedDays"),
          value: isTracker ? "0" : String(analytics.missedDays)
        };
        availableCards["total-volume"] = {
          label: isAvoidance ? t("stats.totalSlips") : isTracker ? t("stats.totalTracked") : t("stats.totalVolume"),
          value: formatStatValue(analytics.totalVolume, selectedHabit.unit, selectedHabit)
        };
        availableCards["active-average"] = { label: t("stats.avgActiveDay"), value: formatStatValue(analytics.averageActiveDays, selectedHabit.unit, selectedHabit) };
        availableCards["peak-day"] = { label: t("stats.peakDay"), value: formatStatValue(analytics.peakValue, selectedHabit.unit, selectedHabit) };
        availableCards["current-streak"] = {
          label: isTracker ? t("stats.loggingStreak") : isAvoidance ? t("stats.cleanStreak") : t("stats.habitCurrentStreak"),
          value: `${analytics.currentStreak} ${plural(analytics.currentStreak, "plural.dayForms")}`
        };
        availableCards["best-streak"] = {
          label: isTracker ? t("stats.bestLoggingStreak") : isAvoidance ? t("stats.bestCleanStreak") : t("stats.habitBestStreak"),
          value: `${analytics.bestStreak} ${plural(analytics.bestStreak, "plural.dayForms")}`
        };
      }
    } else {
      const values = [...ctx.evaluations.values()].filter((evaluation) => evaluation.score !== null);
      const complete = values.filter((evaluation) => evaluation.score === 1).length;
      const partial = values.filter((evaluation) => evaluation.score !== null && evaluation.score > 0 && evaluation.score < 1).length;
      const missed = values.filter((evaluation) => evaluation.score === 0).length;
      const average = values.length ? values.reduce((sum, evaluation) => sum + (evaluation.score ?? 0), 0) / values.length : 0;

      const streakResult = calculateDailyStreak(ctx.today, (date) => ctx.evaluations.get(date));
      const bestStreak = bestDailyStreak(ctx.dates.filter((date) => date <= ctx.today), (date) => ctx.evaluations.get(date));

      availableCards["consistency"] = { label: t("stats.dailyConsistency"), value: `${Math.round(average * 100)}%` };
      availableCards["completed-days"] = { label: t("stats.completeDays"), value: String(complete) };
      availableCards["partial-days"] = { label: t("stats.partialDays"), value: String(partial) };
      availableCards["missed-days"] = { label: t("stats.missedDays"), value: String(missed) };
      availableCards["current-streak"] = { label: streakResult.coversToday ? t("stats.currentDailyStreak") : t("stats.streakBeforeToday"), value: String(streakResult.streak) };
      availableCards["best-streak"] = { label: ctx.year === yearOf(ctx.today) ? t("stats.bestStreakThisYear") : t("stats.bestStreakYear", { year: ctx.year }), value: String(bestStreak) };
      availableCards["total-volume"] = { label: t("stats.daysEvaluated"), value: String(values.length) };
    }

    const booleanHabit = selectedHabit && isBooleanUnit(selectedHabit.unit);
    if (booleanHabit) {
      const periodTag: Record<string, LocaleKey> = { day: "plural.dayForms", week: "analytics.pluralWeek", month: "analytics.pluralMonth", quarter: "analytics.pluralQuarter", year: "analytics.pluralYear" };
      delete availableCards["total-volume"];
      delete availableCards["active-average"];
      delete availableCards["peak-day"];
      const period = selectedHabit.cadence === "daily" ? "day" : selectedHabit.cadence === "weekly" ? "week"
        : selectedHabit.cadence === "monthly" ? "month" : selectedHabit.cadence === "quarterly" ? "quarter" : "year";
      const analytics = ctx.analytics.get(selectedHabit.id) ?? calculateHabitAnalytics(selectedHabit, ctx.dates, ctx.logs, ctx.today);
      availableCards["current-streak"] = { label: t("stats.currentStreak"), value: `${analytics.currentStreak} ${plural(analytics.currentStreak, periodTag[period])}` };
      availableCards["best-streak"] = { label: t("stats.bestStreak"), value: `${analytics.bestStreak} ${plural(analytics.bestStreak, periodTag[period])}` };
    }

    const requested = Array.isArray(config?.cards) ? config.cards : null;
    if (requested && requested.length > 0) {
      const filtered: Array<{ value: string; label: string }> = [];
      for (const item of requested) {
        const canonicalKey = String(item).toLowerCase().replace(/[_\s]+/g, "-");
        const found = availableCards[canonicalKey]
          ?? (canonicalKey === "volume" ? availableCards["total-volume"] : undefined)
          ?? (canonicalKey === "streak" ? availableCards["current-streak"] : undefined)
          ?? (canonicalKey === "peak" ? availableCards["peak-day"] : undefined)
          ?? (canonicalKey === "average" ? availableCards["active-average"] : undefined)
          ?? (canonicalKey === "completed" ? availableCards["completed-days"] : undefined);
        if (found) filtered.push(found);
      }
      if (filtered.length > 0) return filtered;
    }

    // Default layout if not specified
    if (booleanHabit) {
      return [availableCards["consistency"], availableCards["completed-days"], availableCards["current-streak"], availableCards["best-streak"]];
    }
    if (selectedHabit && selectedHabit.cadence !== "daily") {
      return [
        availableCards["consistency"],
        availableCards["completed-days"],
        availableCards["total-volume"],
        availableCards["active-average"],
        availableCards["best-streak"],
        availableCards["peak-day"]
      ].filter(Boolean);
    }

    return [
      availableCards["consistency"],
      availableCards["completed-days"],
      availableCards[selectedHabit ? "total-volume" : "partial-days"],
      availableCards[selectedHabit ? "active-average" : "missed-days"],
      availableCards["current-streak"],
      availableCards["best-streak"]
    ].filter(Boolean);
  }
}
