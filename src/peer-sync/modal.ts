import { t } from "../i18n";
import { App, Modal } from "obsidian";
import { PeerSyncService } from "./service";
import { renderPeerSyncSettings } from "./settings-panel";

export class PeerSyncModal extends Modal {
  constructor(app: App, private readonly service: PeerSyncService) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("temperans-modal", "temperans-peer-sync-modal");
    this.contentEl.createEl("h2", { text: t("peer.title") });
    this.contentEl.createEl("p", { text: t("peer.subtitle") });
    void renderPeerSyncSettings(this.contentEl, this.service, () => {});
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
