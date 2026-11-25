import { t, setLocale } from "./i18n";
successfully downloaded text file (SHA: b42a91595e1cefa155c871f09c2f94e1f1d22f4f)export const UNIT_LABELS: Record<string, string> = {
  count: t("unit.count"),
  boolean: t("unit.boolean"),
  minutes: t("unit.minutes"),
  hours: t("unit.hours"),
  reps: t("unit.reps"),
  steps: t("unit.steps"),
  km: t("unit.km"),
  miles: t("unit.miles"),
  pages: t("unit.pages"),
  chapters: t("unit.chapters"),
  words: t("unit.words"),
  kcal: t("unit.kcal"),
  ml: t("unit.ml"),
  glasses: t("unit.glasses"),
  incidents: t("unit.incidents"),
  kg: t("unit.kg"),
  lbs: t("unit.lbs"),
  tests: t("unit.tests"),
  custom: t("unit.custom")
};

export function isBooleanUnit(unit: string): boolean {
  return unit.trim().toLowerCase() === "boolean";
}

export const CADENCE_OPTIONS = [
  { value: "daily", label: t("cadence.daily") },
  { value: "weekly", label: t("cadence.weekly") },
  { value: "monthly", label: t("cadence.monthly") },
  { value: "quarterly", label: t("cadence.quarterly") },
  { value: "annual", label: t("cadence.annual") }
];
