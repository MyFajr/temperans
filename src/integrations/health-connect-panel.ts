import { t } from "../i18n";
import { createSubpageCard } from "../ui";
import { Notice, Setting } from "obsidian";
import { HealthConnectImportSummary } from "./health-connect";

export interface HealthConnectPathControl {
  path: string;
  defaultPath: string;
  save(path: string): Promise<void>;
}

export function renderHealthConnectPanel(
  container: HTMLElement,
  importHealthConnect: (weekEnding?: string) => Promise<HealthConnectImportSummary | null | undefined>,
  onImported: () => Promise<void>,
  pathControl?: HealthConnectPathControl
): void {
  // Card 1: Companion export status and import action.
  const { card } = createSubpageCard(container, "heart-pulse", t("hp.card"));
  card.addClass("temperans-health-connect-card");

  let draft = pathControl?.path ?? "";

  const actionRow = card.createDiv({ cls: "temperans-staging-action-row" });
  const fileInfo = actionRow.createDiv({ cls: "temperans-staging-file-info" });
  const fileLabel = fileInfo.createDiv({ cls: "temperans-staging-file-label" });
  fileLabel.createSpan({ text: t("hp.fileLabel") });
  const fileCode = fileLabel.createEl("code");

  const statusHint = fileInfo.createDiv({
    cls: "temperans-staging-status-hint",
    text: t("actions.importCompanionShort")
  });

  const showPath = () => {
    fileCode.textContent = pathControl ? (draft.trim() || pathControl.defaultPath) : "Habit Logs/habit-sync-staging.json";
  };
  const savePath = async () => {
    await pathControl?.save(draft);
    showPath();
  };
  showPath();

  const importBtn = actionRow.createEl("button", { cls: "mod-cta", text: t("commands.importCompanion"), attr: { type: "button" } });
  importBtn.onclick = async () => {
    importBtn.disabled = true;
    importBtn.textContent = t("hp.importing");
    try {
      await savePath();
      if (await importHealthConnect(undefined)) await onImported();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : t("error.couldNotImportCompanion"));
    } finally {
      importBtn.disabled = false;
      importBtn.textContent = t("commands.importCompanion");
    }
  };

  // Card 2: Staging file path (Separate collapsible card, minimized by default)
  if (pathControl) {
    const pathDetails = container.createEl("details", { cls: "temperans-staging-path-details" });
    pathDetails.createEl("summary", { text: t("hp.stagingPath") });
    new Setting(pathDetails).setName(t("hp.stagingPath"))
      .setDesc(t("hp.stagingDesc"))
      .addText(input => input.setValue(draft).setPlaceholder(pathControl.defaultPath)
        .onChange(value => {
          draft = value;
          statusHint.textContent = t("hp.unsaved");
          showPath();
        }))
      .addButton(button => button.setButtonText(t("hp.savePath")).onClick(async () => {
        try {
          await savePath();
          statusHint.textContent = t("notice.hp.pathSaved");
          new Notice(t("notice.hp.pathSaved"));
        }
        catch (error) { new Notice(error instanceof Error ? error.message : t("error.hp.savePath")); }
      }));
  }

  // Card 3: Recover an earlier week (Separate collapsible card, minimized by default)
  let recoveryWeekEnding = "";
  const recovery = container.createEl("details", { cls: "temperans-staging-recovery-details" });
  recovery.createEl("summary", { text: t("hp.recoverSummary") });
  new Setting(recovery).setName(t("hp.weekEnding"))
    .setDesc(t("hp.recoverDesc"))
    .addText(input => { input.inputEl.type = "date"; input.onChange(value => { recoveryWeekEnding = value; }); })
    .addButton(button => button.setButtonText(t("hp.importWeek")).onClick(async () => {
      if (!recoveryWeekEnding) {
        new Notice(t("notice.hp.selectWeek"));
        return;
      }
      button.setDisabled(true);
      button.setButtonText(t("hp.importing"));
      try {
        await savePath();
        if (await importHealthConnect(recoveryWeekEnding)) await onImported();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : t("error.hp.importHistorical"));
      } finally {
        button.setDisabled(false);
        button.setButtonText(t("hp.importWeek"));
      }
    }));
}
