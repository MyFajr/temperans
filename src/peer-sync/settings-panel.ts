import { t, plural } from "../../i18n";
import { createSubpageCard } from "../ui";
import { Notice, Platform, Setting, setIcon } from "obsidian";
import { PeerSyncComparison, PeerSyncService, PeerSyncTransferResult } from "./service";
import { PeerSyncAction, PeerSyncPlanItem } from "./protocol";
import { createPairingUri, generateQrSvg, parsePairingPayload } from "./qr";

function statusLabel(item: PeerSyncPlanItem): string {
  if (item.status === "same") return t("peer.status.same");
  if (item.status === "local-only") return t("peer.status.localOnly");
  if (item.status === "remote-only") return t("peer.status.remoteOnly");
  return t("peer.status.different");
}

export class PeerSyncPanelController {
  private comparison: PeerSyncComparison | null = null;
  private results: PeerSyncTransferResult[] = [];
  private actions = new Map<string, PeerSyncAction>();
  private selectedPaths = new Set<string>();
  private rowUpdaters = new Map<string, () => void>();
  private selectablePathCount = 0;
  private selectAllInput: HTMLInputElement | null = null;
  private selectionCountEl: HTMLElement | null = null;
  private transferSummaryEl: HTMLElement | null = null;
  private transferButton: HTMLButtonElement | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly service: PeerSyncService,
    private readonly onRefresh?: () => void
  ) {}

  async render(): Promise<void> {
    const { container } = this;
    container.empty();

    const subpageContainer = container.createDiv({ cls: "temperans-subpage-container" });

    // 1. Desktop Host Card (desktop only)
    if (Platform.isDesktopApp) {
      await this.renderHostCard(subpageContainer);
    }

    // 2. Client Connection / Paired Status
    if (this.comparison) {
      await this.renderConnectedHeader(subpageContainer);
      this.renderComparison(subpageContainer);
      if (this.results.length) {
        this.renderResults(subpageContainer);
      }
    } else {
      await this.renderClientConnectionCard(subpageContainer);
      if (this.results.length) {
        this.renderResults(subpageContainer);
      }
    }
  }

  private async renderHostCard(container: HTMLElement): Promise<void> {
    const { card: hostCard, header: hostHeader } = createSubpageCard(container, "server", t("peer.hostCard"));

    const isHosting = this.service.isHosting;
    hostHeader.createSpan({
      cls: `temperans-badge ${isHosting ? "is-online" : "is-offline"}`,
      text: isHosting ? t("peer.hostActive") : t("peer.hostStopped")
    });

    if (isHosting) {
      const info = this.service.activeHostInfo!;
      const code = await this.service.getHostPairingCode();
      const primaryIp = info.addresses[0];
      const primaryAddress = primaryIp ? `http://${primaryIp}:${info.port}` : "";

      if (primaryAddress) {
        const uri = createPairingUri(primaryIp, info.port, code);
        const qrBlock = hostCard.createDiv({ cls: "temperans-peer-sync-qr-block" });
        const svgMarkup = generateQrSvg(uri, 180);
        try {
          const parsed = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
          const svgNode = parsed.querySelector("svg");
          if (svgNode) qrBlock.appendChild(qrBlock.ownerDocument.importNode(svgNode, true));
        } catch {
          // Fallback
        }
        qrBlock.createSpan({
          text: t("peer.scanHint"),
          cls: "temperans-scanner-status"
        });

        const addressBoxes = hostCard.createDiv({ cls: "temperans-peer-sync-selectable-values" });
        this.createSelectableValue(addressBoxes, t("peer.desktopAddress"), primaryAddress, t("peer.desktopAddress"));
      } else {
        hostCard.createEl("p", {
          text: t("peer.noLan", { port: info.port }),
          cls: "temperans-peer-sync-host-info"
        });
      }

      const pairingBox = hostCard.createDiv({ cls: "temperans-peer-sync-selectable-values" });
      this.createSelectableValue(pairingBox, t("peer.pairingCode"), code, t("peer.pairingCodeAria"));

      new Setting(hostCard)
        .addButton((button) => button.setButtonText(t("peer.stopHost")).onClick(async () => {
          await this.service.stopHost();
          this.comparison = null;
          await this.render();
          this.onRefresh?.();
        }))
        .addButton((button) => button.setButtonText(t("peer.regenerateCode")).setDestructive().onClick(async () => {
          await this.service.regenerateHostPairingCode();
          new Notice(t("notice.peer.regenerated"));
          await this.render();
        }));
      return;
    }

    let port = String(this.service.activeHostInfo?.port ?? this.service.configuredPort);
    new Setting(hostCard)
      .setName(t("peer.localPort"))
      .setDesc(t("peer.localPortDesc"))
      .addText((input) => {
        input.setValue(port).onChange((value) => { port = value; });
        input.inputEl.type = "number";
        input.inputEl.min = "1024";
        input.inputEl.max = "65535";
      })
      .addButton((button) => button.setButtonText(t("peer.startHost")).onClick(async () => {
        const parsedPort = Number(port);
        try {
          await this.service.setHostPort(parsedPort);
          await this.service.startHost();
          await this.render();
          this.onRefresh?.();
        } catch (error) {
          new Notice(error instanceof Error ? error.message : t("error.peer.startHost"));
        }
      }))
      .addButton((button) => button.setButtonText(t("peer.regeneratePairingCode")).setDestructive().onClick(async () => {
        await this.service.regenerateHostPairingCode();
        new Notice(t("notice.peer.regenerated2"));
      }));
  }

  private async renderConnectedHeader(container: HTMLElement): Promise<void> {
    const profile = await this.service.getRemoteProfile();
    const { card, header } = createSubpageCard(container, "smartphone", t("peer.pairedHeader"));

    header.createSpan({
      cls: "temperans-badge is-online",
      text: t("peer.connected")
    });

    const infoRow = card.createDiv({ cls: "temperans-card-actions-row" });
    infoRow.createSpan({
      text: profile.url ? t("peer.connectedTo", { url: profile.url }) : t("peer.connectedDesktop"),
      cls: "temperans-task-title"
    });

    const refreshBtn = infoRow.createEl("button", { text: t("peer.refresh"), attr: { type: "button" } });
    refreshBtn.onclick = async () => {
      refreshBtn.disabled = true;
      refreshBtn.setText(t("peer.checking"));
      try {
        await this.refreshComparison();
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.setText(t("peer.refresh"));
      }
    };

    const disconnectBtn = infoRow.createEl("button", { text: t("peer.changeConnection"), attr: { type: "button" } });
    disconnectBtn.onclick = async () => {
      this.comparison = null;
      await this.render();
    };
  }

  private async renderClientConnectionCard(container: HTMLElement): Promise<void> {
    const { card: clientCard } = createSubpageCard(container, "smartphone", t("peer.clientCard"));
    const profile = await this.service.getRemoteProfile();
    let currentInput = profile.url && profile.secret ? `${profile.url}#${profile.secret}` : (profile.url || "");
    const isPaired = Boolean(profile.url && profile.secret);

    const connectionSetting = new Setting(clientCard)
      .setName(t("peer.connectionDetail"))
      .setDesc(isPaired
        ? t("peer.savedDesktop", { url: profile.url })
        : t("peer.pasteDesc"));

    let textInputEl: HTMLInputElement | null = null;
    connectionSetting.addText((input) => {
      textInputEl = input.inputEl;
      input.setPlaceholder(t("ph.peer.link"));
      input.setValue(currentInput);
      input.onChange((value) => {
        currentInput = value.trim();
        const parsed = parsePairingPayload(currentInput);
        if (parsed) {
          void this.service.saveRemoteProfile(parsed.url, parsed.secret);
        }
      });
      input.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void connectAndCompare();
        }
      });
    });

    const pasteConnectionDetails = async (): Promise<void> => {
      try {
        const text = await navigator.clipboard.readText();
        const parsed = parsePairingPayload(text);
        if (!parsed) {
          new Notice(t("notice.peer.clipboardInvalid"));
          return;
        }
        currentInput = `${parsed.url}#${parsed.secret}`;
        if (textInputEl) textInputEl.value = currentInput;
        await this.service.saveRemoteProfile(parsed.url, parsed.secret);
        new Notice(t("notice.peer.clipboardConfigured"));
        await connectAndCompare();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : t("error.peer.clipboardRead"));
      }
    };

    connectionSetting.addExtraButton((button) => {
      button.setIcon("clipboard-paste");
      button.setTooltip(t("peer.pasteTooltip"));
      button.onClick(() => { void pasteConnectionDetails(); });
    });

    let connectBtn: HTMLButtonElement | null = null;
    const connectAndCompare = async () => {
      if (connectBtn) {
        connectBtn.disabled = true;
        connectBtn.setText(t("peer.connecting"));
      }
      try {
        const parsed = parsePairingPayload(currentInput);
        if (parsed) {
          await this.service.saveRemoteProfile(parsed.url, parsed.secret);
        } else {
          const active = await this.service.getRemoteProfile();
          if (!active.url || !active.secret) {
            new Notice(t("notice.peer.enterAddress"));
            return;
          }
        }
        this.results = [];
        this.comparison = await this.service.compare();
        this.resetTransferSelection(this.comparison);
        await this.render();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : t("error.peer.connect"));
      } finally {
        if (connectBtn) {
          connectBtn.disabled = false;
          connectBtn.setText(t("peer.connect"));
        }
      }
    };

    const clientActions = clientCard.createDiv({ cls: "temperans-card-actions-row" });
    const connectButtonEl = clientActions.createEl("button", { text: t("peer.connect"), attr: { type: "button" } });
    connectBtn = connectButtonEl;
    connectButtonEl.onclick = connectAndCompare;

    const forgetBtn = clientActions.createEl("button", { text: t("peer.forget"), cls: "mod-warning", attr: { type: "button" } });
    forgetBtn.onclick = async () => {
      await this.service.forgetRemoteProfile();
      currentInput = "";
      if (textInputEl) textInputEl.value = "";
      this.comparison = null;
      new Notice(t("notice.peer.forgotten"));
      await this.render();
    };
  }

  private renderComparison(container: HTMLElement): void {
    const comparison = this.comparison;
    if (!comparison) return;
    const changedItems = comparison.plan.filter((item) => item.status !== "same");

    const { card, header: heading } = createSubpageCard(container, "files", t("peer.preview"));
    card.addClass("temperans-peer-sync-preview");

    const refresh = heading.createEl("button", {
      cls: "temperans-peer-sync-preview-refresh",
      attr: { type: "button", "aria-label": t("peer.refreshPreviewAria"), "aria-description": t("peer.refreshPreviewDesc") }
    });
    setIcon(refresh, "rotate-cw");
    refresh.setAttribute("title", t("peer.refreshPreviewTitle"));
    refresh.onclick = () => void this.refreshComparison();

    if (!changedItems.length) {
      const empty = card.createDiv({ cls: "temperans-peer-sync-empty" });
      setIcon(empty.createSpan({ cls: "temperans-peer-sync-empty-icon" }), "circle-check");
      empty.createEl("strong", { text: t("peer.allCaughtUp") });
      empty.createSpan({ text: t("peer.filesMatch") });
      return;
    }

    const summary = card.createDiv({ cls: "temperans-peer-sync-summary" });
    for (const [status, label] of [["local-only", t("peer.status.localOnly")], ["remote-only", t("peer.onlyPaired")], ["different", t("peer.diffShort")]]) {
      const stat = summary.createDiv({ cls: `temperans-peer-sync-stat is-${status}` });
      stat.createEl("strong", { text: String(changedItems.filter(item => item.status === status).length) });
      stat.createSpan({ text: label });
    }

    const syncContainer = card.createDiv({ cls: "temperans-peer-sync-container" });
    this.selectablePathCount = changedItems.length;
    this.rowUpdaters.clear();

    // 1. Batch Toolbar
    this.renderBatchToolbar(syncContainer, changedItems);

    // 2. Scrollable File List
    const scrollList = syncContainer.createDiv({
      cls: "temperans-peer-sync-scroll-list",
      attr: { role: "region", "aria-label": t("peer.differingAria"), tabindex: "0" }
    });
    for (const item of changedItems) {
      this.renderFileRow(scrollList, item);
    }

    // 3. Action Bar with Transfer Button
    const actionBar = syncContainer.createDiv({ cls: "temperans-peer-sync-actions" });
    this.transferSummaryEl = actionBar.createSpan({ cls: "temperans-peer-sync-transfer-summary", attr: { "aria-live": "polite" } });
    const transferBtn = actionBar.createEl("button", {
      cls: "mod-cta",
      attr: { type: "button" }
    });
    this.transferButton = transferBtn;
    transferBtn.onclick = async () => {
      const selectedActions = new Map(comparison.plan.map((item) => [
        item.path,
        this.selectedPaths.has(item.path) ? (this.actions.get(item.path) ?? item.defaultAction) : "skip"
      ]));
      transferBtn.disabled = true;
      transferBtn.setText(t("peer.transferring"));
      try {
        const results = await this.service.transfer(comparison.plan, selectedActions);
        this.results = results.length ? results : [{ path: "", action: "skip", ok: true, message: t("notice.peer.nothingSelected") }];
        await this.refreshComparison({ preserveResults: true });
      } catch (error) {
        new Notice(error instanceof Error ? error.message : t("error.peer.transfer"));
      } finally {
        this.updateTransferUI();
      }
    };

    this.updateTransferUI(changedItems);
  }

  private renderBatchToolbar(container: HTMLElement, items: PeerSyncPlanItem[]): void {
    const toolbar = container.createDiv({ cls: "temperans-peer-sync-toolbar" });

    const selectGroup = toolbar.createDiv({ cls: "temperans-peer-sync-select-group" });
    const selectAllLabel = selectGroup.createEl("label", { cls: "temperans-peer-sync-select-all" });
    const selectAll = selectAllLabel.createEl("input", {
      attr: { type: "checkbox", "aria-label": t("peer.selectAllAria") }
    });
    this.selectAllInput = selectAll;

    selectAllLabel.createSpan({ text: t("peer.selectAll") });
    this.selectionCountEl = selectGroup.createSpan({ cls: "temperans-peer-sync-selection-count" });

    selectAll.onchange = () => {
      const shouldSelect = selectAll.checked;
      for (const item of items) {
        if (shouldSelect) {
          this.selectedPaths.add(item.path);
          if (!this.actions.has(item.path) || this.actions.get(item.path) === "skip") {
            const defAction = item.defaultAction !== "skip" ? item.defaultAction : (item.local ? "upload" : "download");
            this.actions.set(item.path, defAction);
          }
        } else {
          this.selectedPaths.delete(item.path);
        }
      }
      this.refreshRowViews();
      this.updateTransferUI(items);
    };

    const batchButtons = toolbar.createDiv({ cls: "temperans-peer-sync-batch-buttons" });

    const sendAllBtn = batchButtons.createEl("button", {
      cls: "temperans-peer-sync-direction-btn",
      text: t("peer.sendSelected"),
      attr: { type: "button", title: t("peer.sendSelectedTitle") }
    });
    sendAllBtn.onclick = () => {
      let count = 0;
      for (const item of items) {
        if (this.selectedPaths.has(item.path) && item.local) {
          this.actions.set(item.path, "upload");
          count += 1;
        }
      }
      if (count > 0) new Notice(t("notice.peer.setSend", { n: count, form: plural(count, "peer.pluralFile") }));
      else new Notice(t("notice.peer.noSend"));
      this.refreshRowViews();
      this.updateTransferUI(items);
    };

    const receiveAllBtn = batchButtons.createEl("button", {
      cls: "temperans-peer-sync-direction-btn",
      text: t("peer.receiveSelected"),
      attr: { type: "button", title: t("peer.receiveSelectedTitle") }
    });
    receiveAllBtn.onclick = () => {
      let count = 0;
      for (const item of items) {
        if (this.selectedPaths.has(item.path) && item.remote) {
          this.actions.set(item.path, "download");
          count += 1;
        }
      }
      if (count > 0) new Notice(t("notice.peer.setReceive", { n: count, form: plural(count, "peer.pluralFile") }));
      else new Notice(t("notice.peer.noReceive"));
      this.refreshRowViews();
      this.updateTransferUI(items);
    };
  }

  private renderFileRow(container: HTMLElement, item: PeerSyncPlanItem): void {
    const row = container.createDiv({ cls: "temperans-peer-sync-row" });

    // Left: Checkbox + File Info
    const left = row.createDiv({ cls: "temperans-peer-sync-row-left" });
    const checkbox = left.createEl("input", {
      attr: { type: "checkbox", "aria-label": t("peer.selectFile", { path: item.path }) }
    });

    setIcon(left.createSpan({ cls: "temperans-peer-sync-file-icon" }), item.path === "Settings.md" ? "settings-2" : "file-text");
    const info = left.createDiv({ cls: "temperans-peer-sync-row-info" });
    const filename = item.path.split("/").pop()!;
    info.createSpan({ text: filename === "Settings.md" ? t("peer.habitSettings") : filename.replace(/\.md$/, ""), cls: "temperans-peer-sync-row-name" });
    info.createSpan({ text: item.path, cls: "temperans-peer-sync-row-path", attr: { title: item.path } });
    info.createSpan({ text: statusLabel(item), cls: `temperans-peer-sync-row-status is-${item.status}` });

    const actionsContainer = row.createDiv({ cls: "temperans-peer-sync-row-actions" });

    let uploadBtn: HTMLButtonElement | null = null;
    let downloadBtn: HTMLButtonElement | null = null;

    if (item.local) {
      uploadBtn = actionsContainer.createEl("button", {
        cls: "temperans-peer-sync-direction-btn",
        text: t("peer.send"),
        attr: { type: "button", title: t("peer.sendTitle"), "aria-label": t("peer.sendAria", { path: item.path }), "aria-pressed": "false" }
      });
      uploadBtn.onclick = () => {
        this.selectedPaths.add(item.path);
        this.actions.set(item.path, "upload");
        this.refreshRowViews();
        this.updateTransferUI();
      };
    }

    if (item.remote) {
      downloadBtn = actionsContainer.createEl("button", {
        cls: "temperans-peer-sync-direction-btn",
        text: t("peer.receive"),
        attr: { type: "button", title: t("peer.receiveTitle"), "aria-label": t("peer.receiveAria", { path: item.path }), "aria-pressed": "false" }
      });
      downloadBtn.onclick = () => {
        this.selectedPaths.add(item.path);
        this.actions.set(item.path, "download");
        this.refreshRowViews();
        this.updateTransferUI();
      };
    }

    const updateView = () => {
      const isSelected = this.selectedPaths.has(item.path);
      const action = this.actions.get(item.path) ?? (isSelected ? item.defaultAction : "skip");

      checkbox.checked = isSelected;
      row.toggleClass("is-selected", isSelected);

      if (uploadBtn) {
        uploadBtn.toggleClass("is-active", isSelected && action === "upload");
        uploadBtn.setAttribute("aria-pressed", String(isSelected && action === "upload"));
      }
      if (downloadBtn) {
        downloadBtn.toggleClass("is-active", isSelected && action === "download");
        downloadBtn.setAttribute("aria-pressed", String(isSelected && action === "download"));
      }
    };

    checkbox.onchange = () => {
      if (checkbox.checked) {
        this.selectedPaths.add(item.path);
        if (!this.actions.has(item.path) || this.actions.get(item.path) === "skip") {
          const defAction = item.defaultAction !== "skip" ? item.defaultAction : (item.local ? "upload" : "download");
          this.actions.set(item.path, defAction);
        }
      } else {
        this.selectedPaths.delete(item.path);
      }
      updateView();
      this.updateTransferUI();
    };

    this.rowUpdaters.set(item.path, updateView);
    updateView();
  }

  private updateTransferUI(items?: PeerSyncPlanItem[]): void {
    const list = items ?? this.comparison?.plan.filter((i) => i.status !== "same") ?? [];
    const totalSelected = this.selectedPaths.size;

    let uploadCount = 0;
    let downloadCount = 0;

    for (const item of list) {
      if (!this.selectedPaths.has(item.path)) continue;
      const action = this.actions.get(item.path) ?? item.defaultAction;
      if (action === "upload") uploadCount += 1;
      else if (action === "download") downloadCount += 1;
    }

    if (this.selectionCountEl) {
      this.selectionCountEl.setText(t("peer.selectionCount", { n: totalSelected, total: this.selectablePathCount }));
    }

    if (this.selectAllInput) {
      this.selectAllInput.checked = this.selectablePathCount > 0 && totalSelected === this.selectablePathCount;
      this.selectAllInput.indeterminate = totalSelected > 0 && totalSelected < this.selectablePathCount;
    }

    if (this.transferSummaryEl) {
      this.transferSummaryEl.setText(totalSelected
        ? t("peer.summaryCounts", { up: uploadCount, down: downloadCount }) : t("peer.summaryEmpty"));
    }

    if (this.transferButton) {
      this.transferButton.disabled = totalSelected === 0;
      if (totalSelected === 0) {
        this.transferButton.setText("Select files to transfer");
      } else {
        this.transferButton.setText(t("peer.transferN", { n: totalSelected, form: plural(totalSelected, "peer.pluralFile") }));
      }
    }
  }

  private refreshRowViews(): void {
    for (const update of this.rowUpdaters.values()) {
      update();
    }
  }

  private async refreshComparison(options: { preserveResults?: boolean } = {}): Promise<void> {
    try {
      this.comparison = await this.service.compare();
      this.resetTransferSelection(this.comparison);
      if (!options.preserveResults) this.results = [];
      await this.render();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : t("error.peer.refreshPreview"));
    }
  }

  private resetTransferSelection(comparison: PeerSyncComparison): void {
    this.actions = new Map(comparison.plan.map((item) => [item.path, item.defaultAction]));
    this.selectedPaths = new Set(comparison.plan
      .filter((item) => item.status !== "same" && item.defaultAction !== "skip")
      .map((item) => item.path));
  }

  private renderResults(container: HTMLElement): void {
    const { card } = createSubpageCard(container, "list-checks", t("peer.results"));
    const list = card.createDiv({ cls: "temperans-peer-sync-results", attr: { "aria-live": "polite" } });
    for (const result of this.results) {
      const row = list.createDiv({ cls: result.ok ? "is-success" : "is-error" });
      setIcon(row.createSpan({ cls: "temperans-peer-sync-result-icon" }), result.ok ? "circle-check" : "circle-alert");
      const detail = row.createDiv();
      if (result.path) detail.createEl("strong", { text: result.path });
      detail.createDiv({ text: result.message });
    }
  }

  private createSelectableValue(container: HTMLElement, label: string, value: string, ariaLabel: string): void {
    const row = container.createDiv({ cls: "temperans-peer-sync-selectable-row" });
    row.createSpan({ text: label });
    const input = row.createEl("input", {
      cls: "temperans-peer-sync-selectable-value",
      attr: { type: "text", readonly: "true", "aria-label": ariaLabel, spellcheck: "false" }
    });
    input.value = value;
    const selectValue = () => input.select();
    input.addEventListener("focus", selectValue);
    input.addEventListener("click", selectValue);
  }
}

export async function renderPeerSyncSettings(
  container: HTMLElement,
  service: PeerSyncService | undefined,
  onRefresh?: () => void
): Promise<void> {
  if (!service) {
    container.createEl("p", { text: t("peer.serviceUnavailable") });
    return;
  }
  const controller = new PeerSyncPanelController(container, service, onRefresh);
  await controller.render();
}
