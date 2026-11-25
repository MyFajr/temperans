import { t } from "./i18n";
import { ActionCard, renderActionCard, renderSubpageHeader } from "./ui";
import { loadAnalyticsSummaryData, renderAnalyticsPanel } from "./analytics-panel";
import { renderAnalyticsShareActions } from "./analytics-share";
import { PeerSyncService } from "./peer-sync/service";
import { HealthConnectImportSummary } from "./integrations/health-connect";
import { renderAddHabitForm } from "./habit-form";
import { renderBrowsePresets } from "./habit-presets-panel";
import { HabitPreset } from "./habit-presets";
import { renderPeerSyncSettings } from "./peer-sync/settings-panel";
import { HealthConnectPathControl, renderHealthConnectPanel } from "./integrations/health-connect-panel";
import { renderHabitsConfiguration } from "./settings";
import { App, Modal, Notice } from "obsidian";
import { HabitStore } from "./data";

export interface DashboardActionsHost {
  store: HabitStore;
  peerSync?: PeerSyncService;
  importHealthConnect?(weekEnding?: string): Promise<HealthConnectImportSummary | null>;
  openThirdPartySync(): void;
  openPeerSync(): void;
  healthConnectPathControl?(): HealthConnectPathControl;
  syncAllEndpoints(): Promise<void>;
  openSettingsNote(): Promise<void>;
  openAnalyticsSummary(): void;
  openDashboardConfig(): Promise<void>;
}

type ActionsView = "menu" | "peer-sync" | "sync-hub" | "analytics" | "add-habit" | "presets" | "configure-habits";

/** Frequently used dashboard actions, presented in an elegant, categorized action palette with embedded sub-pages. */
export class DashboardActionsModal extends Modal {
  private currentView: ActionsView = "menu";
  private previousHabitView: ActionsView = "menu";
  private selectedPreset?: HabitPreset;

  constructor(
    app: App,
    private readonly host: DashboardActionsHost,
    private readonly onTasksChanged: () => Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("temperans-modal", "temperans-dashboard-actions-modal");
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    if (this.currentView === "menu") {
      this.renderMenu(contentEl);
    } else if (this.currentView === "peer-sync") {
      void this.renderPeerSync(contentEl);
    } else if (this.currentView === "sync-hub") {
      this.renderSyncHub(contentEl);
    } else if (this.currentView === "analytics") {
      void this.renderAnalytics(contentEl);
    } else if (this.currentView === "add-habit") {
      void this.renderAddHabit(contentEl);
    } else if (this.currentView === "presets") {
      void this.renderPresets(contentEl);
    } else if (this.currentView === "configure-habits") {
      void this.renderConfigureHabits(contentEl);
    }
  }

  private renderSubpageHeader(container: HTMLElement, title: string, subtitle?: string): HTMLDivElement {
    return renderSubpageHeader(container, title, subtitle, t("nav.backToActions"), () => {
      this.currentView = "menu";
      this.render();
    });
  }

  private renderMenu(container: HTMLElement): void {
    const header = container.createDiv({ cls: "temperans-actions-header" });
    header.createEl("h2", { text: t("header.habitActions") });
    header.createEl("p", { text: t("desc.quickActions") });

    // Category 1: Sync and Integrations
    this.renderSection(container, t("actions.sectionSync"), [
      {
        icon: "wifi",
        title: t("settings.localPeerSync"),
        description: t("actions.peerSyncCard"),
        onClick: () => {
          this.currentView = "peer-sync";
          this.render();
        }
      },
      {
        icon: "cloud-download",
        title: t("actions.syncEndpointsTitle"),
        description: t("actions.syncEndpointsDesc"),
        onClick: async () => {
          this.close();
          await this.host.syncAllEndpoints();
        }
      },
      {
        icon: "heart-pulse",
        title: t("settings.companionImport"),
        description: t("desc.companionImportDesc"),
        actionButton: {
          label: t("actions.importData"),
          icon: "download",
          onClick: async () => {
            try {
              const result = await this.host.importHealthConnect?.();
              if (result) {
                await this.onTasksChanged();
              }
            } catch (error) {
              new Notice(error instanceof Error ? error.message : t("error.couldNotImportCompanion"));
            }
          }
        },
        onClick: () => {
          this.currentView = "sync-hub";
          this.render();
        }
      }
    ]);

    // Category 2: Habits and Insights
    this.renderSection(container, t("actions.sectionHabits"), [
      {
        icon: "bar-chart-2",
        title: t("actions.analyticsTitle"),
        description: t("actions.analyticsDesc"),
        onClick: () => {
          this.currentView = "analytics";
          this.render();
        }
      },
      {
        icon: "list-ordered",
        title: t("settings.configureHabits"),
        description: t("actions.configureHabitsDesc"),
        onClick: () => {
          this.currentView = "configure-habits";
          this.render();
        }
      },
      {
        icon: "plus-circle",
        title: t("settings.addHabit"),
        description: t("actions.addHabitDesc"),
        onClick: () => {
          this.previousHabitView = "menu";
          this.selectedPreset = undefined;
          this.currentView = "add-habit";
          this.render();
        }
      }
    ]);

    // Category 3: Vault Configuration
    this.renderSection(container, t("actions.sectionVault"), [
      {
        icon: "file-text",
        title: t("settings.editSettingsNote"),
        description: t("actions.editSettingsDesc"),
        onClick: async () => {
          this.close();
          await this.host.openSettingsNote();
        }
      },
      {
        icon: "layout-dashboard",
        title: t("settings.editDashboardNote"),
        description: t("desc.yamlDashboard"),
        onClick: async () => {
          this.close();
          await this.host.openDashboardConfig();
        }
      }
    ]);
  }

  private renderSection(container: HTMLElement, title: string, actions: ActionCard[]): void {
    container.createDiv({
      cls: "temperans-actions-section-title",
      text: title
    });

    const grid = container.createDiv({ cls: "temperans-actions-grid" });

    for (const action of actions) renderActionCard(grid, action);
  }

  private async renderPeerSync(container: HTMLElement): Promise<void> {
    this.renderSubpageHeader(
      container,
      "Local peer sync",
      "Transfers Habit Logs/Settings.md and dated notes with authenticated AES-256-GCM encryption."
    );

    await renderPeerSyncSettings(container, this.host.peerSync, () => this.render());
  }

  private renderSyncHub(container: HTMLElement): void {
    this.renderSubpageHeader(
      container,
      t("settings.companionImport"),
      t("actions.importCompanionShort")
    );

    renderHealthConnectPanel(container, async (weekEnding) => this.host.importHealthConnect?.(weekEnding), this.onTasksChanged, this.host.healthConnectPathControl?.());
  }

  private async renderAnalytics(container: HTMLElement): Promise<void> {
    const year = new Date().getFullYear();
    const header = this.renderSubpageHeader(
      container,
      t("header.analyticsYear", { year }),
      t("actions.analyticsSub")
    );

    const summary = await loadAnalyticsSummaryData(this.host.store, year);
    if (summary.habits.length) renderAnalyticsShareActions(header, this.app, this.host.store, summary);
    renderAnalyticsPanel(container, summary, false);
  }

  private async renderAddHabit(container: HTMLElement): Promise<void> {
    renderSubpageHeader(
      container,
      "Add a habit",
      "Configure a positive build habit, negative/avoidance habit, or zero-goal metric tracker.",
      this.previousHabitView === "configure-habits" ? t("nav.backToHabits") : t("nav.backToActions"),
      () => {
        this.currentView = this.previousHabitView;
        this.render();
      }
    );

    await renderAddHabitForm(container, this.host.store, async () => {
      this.selectedPreset = undefined;
      await this.onTasksChanged();
      this.currentView = this.previousHabitView;
      this.render();
    }, {
      initialPreset: this.selectedPreset,
      onOpenPresets: () => {
        this.currentView = "presets";
        this.render();
      }
    });
  }

  private async renderConfigureHabits(container: HTMLElement): Promise<void> {
    this.renderSubpageHeader(
      container,
      t("settings.configureHabits"),
      t("actions.configureSub")
    );

    await renderHabitsConfiguration(container, {
      app: this.app,
      store: this.host.store,
      onChanged: async () => {
        await this.onTasksChanged();
        this.render();
      },
      onAddHabit: () => {
        this.previousHabitView = "configure-habits";
        this.selectedPreset = undefined;
        this.currentView = "add-habit";
        this.render();
      }
    });
  }

  private async renderPresets(container: HTMLElement): Promise<void> {
    renderSubpageHeader(
      container,
      t("habit.browsePresets"),
      t("presets.browseDescShort"),
      t("nav.backToAddHabit"),
      () => {
        this.currentView = "add-habit";
        this.render();
      }
    );

    await renderBrowsePresets(container, this.host.store, {
      onAdded: async () => {
        await this.onTasksChanged();
      },
      onCustomize: (preset) => {
        this.selectedPreset = preset;
        this.currentView = "add-habit";
        this.render();
      }
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
