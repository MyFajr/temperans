import { t } from "./i18n";
import { CADENCE_OPTIONS, UNIT_LABELS, isBooleanUnit } from "./habit-options";
import { HabitPreset } from "./habit-presets";
import { createSubpageCard, renderActionCard } from "./ui";
import { Notice, Setting, setIcon } from "obsidian";
import { HabitStore } from "./data";
import { todayInZone } from "./date";
import { createTemperansDropdown } from "./dropdown";
import { normalizeHabitCategory } from "./habit-category";
import { EndpointConfig, HabitCadence, HabitDefinition, HabitDisplayFormat, RESERVED_HABIT_IDS, TargetVersion } from "./types";

function slugify(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export interface AddHabitFormOptions {
  initialPreset?: HabitPreset;
  onOpenPresets?: () => void;
}

export async function renderAddHabitForm(
  container: HTMLElement,
  store: HabitStore,
  onCreated: () => Promise<void>,
  options?: AddHabitFormOptions
): Promise<void> {
  const settings = await store.loadSettings();
  const existingIds = new Set(settings.habits.map((h) => h.id));

  const subpageContainer = container.createDiv({ cls: "temperans-subpage-container" });

  const preset = options?.initialPreset;

  let name = preset?.name ?? "";
  let category = "";
  let habitCategory: "build" | "avoidance" | "tracker" = preset
    ? (preset.archetype === "avoidance" ? "avoidance" : (preset.archetype === "tracker" ? "tracker" : "build"))
    : "build";
  let cadence: HabitCadence = preset?.cadence ?? "daily";
  let isSessionHabit = preset?.archetype === "session";
  let minimum = preset?.min !== undefined ? String(preset.min) : "30";
  let maximum = preset?.max !== undefined ? String(preset.max) : "";
  let presetEndpoint: EndpointConfig | undefined = preset?.endpoint;
  let presetDisplayFormat: HabitDisplayFormat | undefined = preset?.displayFormat;

  // 0. Browse Presets Clickable Action Card (Single un-nested card)
  if (options?.onOpenPresets) {
    const openPresets = options.onOpenPresets;
    renderActionCard(subpageContainer, {
      icon: "sparkles",
      title: t("habit.browsePresets"),
      description: t("presets.browseDesc"),
      onClick: () => openPresets()
    });
  }

  // 1. Archetype Selection Card
  const { card: archetypeCard } = createSubpageCard(subpageContainer, "layers", t("form.step1"));

  const archetypeGrid = archetypeCard.createDiv({ cls: "temperans-archetype-grid" });

  const archetypes: Array<{ key: "build" | "avoidance" | "tracker"; icon: string; title: string; desc: string }> = [
    { key: "build", icon: "sparkles", title: t("habit.build"), desc: t("form.buildDesc") },
    { key: "avoidance", icon: "shield-alert", title: t("habit.avoidance"), desc: t("form.avoidanceDesc") },
    { key: "tracker", icon: "scale", title: t("habit.trackerForm"), desc: t("form.trackerDesc") }
  ];

  const archetypeTiles: HTMLElement[] = [];

  archetypes.forEach((item) => {
    const tile = archetypeGrid.createDiv({
      cls: `temperans-archetype-card ${item.key === habitCategory ? "is-selected" : ""}`,
      attr: { role: "button", tabindex: "0", "aria-label": item.title }
    });
    archetypeTiles.push(tile);

    const tIcon = tile.createDiv({ cls: "temperans-archetype-icon" });
    setIcon(tIcon, item.icon);
    tile.createDiv({ cls: "temperans-archetype-title", text: item.title });
    tile.createDiv({ cls: "temperans-archetype-desc", text: item.desc });

    const select = () => {
      habitCategory = item.key;
      archetypeTiles.forEach((t) => t.removeClass("is-selected"));
      tile.addClass("is-selected");
      updateDynamicTargetCard();
    };

    tile.onclick = select;
    tile.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select();
      }
    };
  });

  // 2. Identity and Cadence Card
  const { card: detailsCard } = createSubpageCard(subpageContainer, "tag", t("form.step2"));

  new Setting(detailsCard).setName(t("settings.habitName")).addText((input) => {
    if (name) input.setValue(name);
    input
      .setPlaceholder(t("ph.exampleHabit"))
      .onChange((value) => { name = value; });
  });

  new Setting(detailsCard).setName(t("habit.category")).setDesc(t("desc.optional"))
    .addText((input) => input.setPlaceholder(t("ph.exampleCategory")).onChange((value) => { category = value; }));

  let selectedUnitChoice = preset
    ? (Object.hasOwn(UNIT_LABELS, preset.unit) ? preset.unit : "custom")
    : "count";
  let customUnitValue = preset && !Object.hasOwn(UNIT_LABELS, preset.unit) ? preset.unit : "";

  const unitSetting = new Setting(detailsCard).setName(t("habit.unit"));
  const customUnitContainer = detailsCard.createDiv({ cls: "temperans-custom-unit-setting" });
  if (selectedUnitChoice !== "custom") customUnitContainer.addClass("temperans-hidden");

  new Setting(customUnitContainer)
    .setName(t("settings.customUnitName"))
    .addText((input) => {
      if (customUnitValue) input.setValue(customUnitValue);
      input.setPlaceholder(t("ph.exampleUnit")).onChange((value) => {
        customUnitValue = value.trim();
        updateDynamicTargetCard();
      });
    });

  createTemperansDropdown(unitSetting.controlEl, {
    value: selectedUnitChoice,
    options: Object.keys(UNIT_LABELS).map((value) => ({ value, label: UNIT_LABELS[value] })),
    ariaLabel: t("aria.chooseUnit"),
    onChange: (value) => {
      selectedUnitChoice = value;
      customUnitContainer.toggleClass("temperans-hidden", value !== "custom");
      updateDynamicTargetCard();
    }
  });

  const cadenceSetting = new Setting(detailsCard).setName(t("settings.goalCadence"));
  createTemperansDropdown(cadenceSetting.controlEl, {
    value: cadence,
    options: CADENCE_OPTIONS,
    ariaLabel: t("aria.chooseCadence"),
    onChange: (value) => { cadence = value as HabitCadence; }
  });

  // 3. Targets and Options Card
  const { card: targetCard } = createSubpageCard(subpageContainer, "target", t("form.step3"));

  const targetBody = targetCard.createDiv({ cls: "temperans-target-body" });

  const updateDynamicTargetCard = () => {
    targetBody.empty();

    if (isBooleanUnit(selectedUnitChoice === "custom" ? customUnitValue : selectedUnitChoice)) {
      targetBody.createEl("p", {
        cls: "temperans-subpage-card-desc",
        text: habitCategory === "avoidance" ? t("desc.avoidanceRecord")
          : habitCategory === "tracker" ? t("desc.avoidanceRecordForm")
          : t("desc.buildRecordForm")
      });
    } else if (habitCategory === "avoidance") {
      new Setting(targetBody)
        .setName(t("settings.toleranceLimit"))
        .setDesc(t("desc.abstinence"))
        .addText((input) => {
          input.setPlaceholder("0").setValue(maximum || "0").onChange((value) => { maximum = value; });
          input.inputEl.type = "number";
          input.inputEl.min = "0";
          input.inputEl.step = "any";
        });
    } else if (habitCategory === "tracker") {
      targetBody.createEl("p", {
        cls: "temperans-subpage-card-desc",
        text: t("desc.zeroGoalForm")
      });
    } else {
      new Setting(targetBody)
        .setName(t("settings.minimumTarget"))
        .setDesc(t("desc.target100"))
        .addText((input) => {
          input.setPlaceholder(t("ph.example30")).setValue(minimum).onChange((value) => { minimum = value; });
          input.inputEl.type = "number";
          input.inputEl.min = "0";
          input.inputEl.step = "any";
        });

      new Setting(targetBody)
        .setName(t("settings.maximumTarget"))
        .setDesc(t("desc.maxTarget"))
        .addText((input) => {
          input.setPlaceholder(t("ph.optional")).setValue(maximum).onChange((value) => { maximum = value; });
          input.inputEl.type = "number";
          input.inputEl.min = "0";
          input.inputEl.step = "any";
        });

      new Setting(targetBody)
        .setName(t("settings.multiEntrySessions"))
        .setDesc(t("desc.multiEntry"))
        .addToggle((toggle) => toggle.setValue(isSessionHabit).onChange((v) => { isSessionHabit = v; }));
    }
  };

  updateDynamicTargetCard();

  // Create Button Row
  const btnRow = subpageContainer.createDiv({ cls: "temperans-create-btn-row" });
  const createBtn = btnRow.createEl("button", { text: t("btn.createHabit"), attr: { type: "button" } });
  createBtn.onclick = async () => {
    const baseId = slugify(name);
    if (!name.trim() || !baseId) return new Notice(t("notice.enterName"));
    if (RESERVED_HABIT_IDS.has(baseId)) return new Notice(t("notice.reservedName"));

    let targetHistory: TargetVersion[] = [{ effectiveDate: todayInZone(settings.timezone) }];
    let finalType: HabitDefinition["type"] = "metric";
    const effectiveUnit = selectedUnitChoice === "custom" ? (customUnitValue || "count") : selectedUnitChoice;
    const booleanUnit = isBooleanUnit(effectiveUnit);

    if (booleanUnit && habitCategory !== "tracker") {
      finalType = habitCategory === "avoidance" ? "avoidance" : "metric";
      targetHistory = [{ effectiveDate: todayInZone(settings.timezone), ...(habitCategory === "avoidance" ? { max: 0 } : { min: 1 }) }];
    } else if (habitCategory === "avoidance") {
      finalType = "avoidance";
      const max = maximum.trim() ? Number(maximum) : 0;
      if (!Number.isFinite(max) || max < 0) return new Notice(t("notice.enterValidTolerance"));
      targetHistory = [{ effectiveDate: todayInZone(settings.timezone), max }];
    } else if (habitCategory === "tracker") {
      finalType = "tracker";
      targetHistory = [{ effectiveDate: todayInZone(settings.timezone) }];
    } else {
      finalType = isSessionHabit ? "session" : "metric";
      const min = Number(minimum);
      const max = maximum.trim() ? Number(maximum) : undefined;
      if (!Number.isFinite(min) || min < 0) return new Notice(t("notice.enterValidMin"));
      if (max !== undefined && (!Number.isFinite(max) || max < min)) return new Notice(t("notice.maxBelowMin"));
      targetHistory = [{ effectiveDate: todayInZone(settings.timezone), min, ...(max !== undefined ? { max } : {}) }];
    }

    let id = baseId;
    let suffix = 2;
    while (existingIds.has(id)) id = `${baseId}-${suffix++}`;
    const normalizedCategory = normalizeHabitCategory(category);

    await store.addHabit({
      id,
      name: name.trim(),
      ...(normalizedCategory ? { category: normalizedCategory } : {}),
      unit: effectiveUnit,
      cadence,
      enabled: true,
      type: finalType,
      displayFormat: booleanUnit ? "number" : presetDisplayFormat,
      targetHistory,
      ...(presetEndpoint ? { endpoint: presetEndpoint } : {})
    });

    new Notice(t("notice.created", { name: name.trim() }));
    await onCreated();
  };
}
