import { t, setLocale } from "./i18n";
import { App, Notice, setIcon, setTooltip } from "obsidian";
import { buildAnalyticsShareText, saveAnalyticsExport } from "./analytics-export";
import type { HabitStore } from "./data";
import type { AnalyticsSummaryData } from "./analytics-panel";

export function renderAnalyticsShareActions(
  parent: HTMLElement,
  app: App,
  store: HabitStore,
  summary: AnalyticsSummaryData
): void {
  const section = parent.createDiv({ cls: "temperans-analytics-share" });
  const shareButton = section.createEl("button", {
    cls: "temperans-analytics-share-trigger",
    attr: {
      type: "button",
      "aria-label": t("analytics.share"),
      "aria-haspopup": "menu",
      "aria-expanded": "false"
    }
  });
  setTooltip(shareButton, t("analytics.share"));
  setIcon(shareButton, "share");

  const menu = section.createDiv({ cls: "temperans-analytics-share-menu" });
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", t("analytics.share"));

  const copyButton = createMenuAction(menu, t("analytics.copyMenu"), "copy", t("analytics.copyAria"));
  const jsonButton = createMenuAction(menu, t("analytics.saveJsonMenu"), "file-json", t("analytics.saveJsonAria"));
  const csvButton = createMenuAction(menu, t("analytics.saveCsvMenu"), "file-spreadsheet", t("analytics.saveCsvAria"));

  let outsidePointerListener: ((event: PointerEvent) => void) | undefined;
  const menuButtons = [copyButton, jsonButton, csvButton];
  const setOpen = (open: boolean): void => {
    if (section.hasClass("is-open") === open) return;
    section.toggleClass("is-open", open);
    shareButton.setAttribute("aria-expanded", String(open));
    if (open) {
      outsidePointerListener = (event) => {
        if (!section.contains(event.target as Node)) setOpen(false);
      };
      section.ownerDocument.addEventListener("pointerdown", outsidePointerListener, true);
    } else if (outsidePointerListener) {
      section.ownerDocument.removeEventListener("pointerdown", outsidePointerListener, true);
      outsidePointerListener = undefined;
    }
  };

  shareButton.onclick = () => setOpen(!section.hasClass("is-open"));
  shareButton.onkeydown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      menuButtons[0].focus();
    }
  };
  section.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && section.hasClass("is-open")) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      shareButton.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const currentIndex = menuButtons.indexOf(event.target as HTMLButtonElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    menuButtons[(currentIndex + direction + menuButtons.length) % menuButtons.length].focus();
  });
  section.addEventListener("focusout", (event) => {
    if (!event.relatedTarget || !section.contains(event.relatedTarget as Node)) setOpen(false);
  });

  copyButton.onclick = () => {
    setOpen(false);
    void copyAnalyticsSummary(summary)
      .then(() => new Notice(t("notice.copied")))
      .catch((error: unknown) => new Notice(error instanceof Error ? error.message : t("analytics.copyFailed")));
  };
  jsonButton.onclick = () => saveExport("json");
  csvButton.onclick = () => saveExport("csv");

  function saveExport(format: "json" | "csv"): void {
    setOpen(false);
    void saveAnalyticsExport(app, store, summary, format)
      .then((path) => new Notice(format === "csv" ? t("notice.savedCsv", { path }) : t("notice.savedJson", { path })))
      .catch((error: unknown) => new Notice(error instanceof Error ? error.message : t("notice.couldNotSaveSummary", { format: format.toUpperCase() })));
  }
}

function createMenuAction(parent: HTMLElement, label: string, icon: string, ariaLabel: string): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "temperans-analytics-share-option",
    attr: { type: "button", role: "menuitem", "aria-label": ariaLabel }
  });
  setIcon(button, icon);
  button.createSpan({ text: label });
  return button;
}

export async function copyAnalyticsSummary(summary: AnalyticsSummaryData): Promise<void> {
  const value = buildAnalyticsShareText(summary);
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new Error(t("error.clipboardUnavailable"));
  }
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    throw new Error(t("analytics.copyFailed"));
  }
}
