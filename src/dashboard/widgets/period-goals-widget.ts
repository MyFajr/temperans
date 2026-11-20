import { t } from "../../i18n";
import { evaluatePeriodGoal } from "../../evaluation";
import { cadenceLabel, formatValue, targetLabel } from "../format";
import { DashboardWidget, WidgetContext } from "../types";

export class PeriodGoalsWidget implements DashboardWidget {
  id = "period-goals";
  name = t("widget.periodGoals.name");
  description = t("widget.periodGoals.description");

  render(container: HTMLElement, ctx: WidgetContext, config?: Record<string, unknown>): void {
    container.empty();
    const cadences = Array.isArray(config?.cadences)
      ? new Set(config.cadences.map((c) => String(c).toLowerCase().trim()))
      : null;
    const periodic = ctx.settings.habits.filter(
      (h) => h.enabled && h.cadence !== "daily" && (!cadences || cadences.has(h.cadence))
    );
    if (!periodic.length) {
      container.addClass("temperans-hidden");
      return;
    }

    container.removeClass("temperans-hidden");
    container.addClass("temperans-period-goals");
    container.createEl("h3", { text: t("widget.periodGoals.title") });

    const list = container.createDiv({ cls: "temperans-period-list" });
    for (const habit of periodic) {
      const evaluation = evaluatePeriodGoal(habit, ctx.today, ctx.logs);
      const row = list.createDiv({ cls: `temperans-period-row is-${evaluation.status}` });
      row.createEl("strong", { text: habit.name });
      row.createSpan({ text: `${formatValue(evaluation.value, habit.unit, habit)} / ${targetLabel(evaluation.target, habit)}` });
      row.createSpan({ text: `${cadenceLabel(habit.cadence)} · ${evaluation.startDate}–${evaluation.endDate}` });
      const progress = row.createEl("progress", { attr: { max: "1", value: String(evaluation.progress) } });
      progress.title = t("widget.periodGoals.progressTitle", { percent: Math.round(evaluation.progress * 100), cadence: cadenceLabel(habit.cadence) });
    }
  }

  update(container: HTMLElement, ctx: WidgetContext, config?: Record<string, unknown>): void {
    this.render(container, ctx, config);
  }
}
