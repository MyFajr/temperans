// src/i18n.ts — лёгкий слой локализации (ТЗ русской локализации).
import en from "./locales/en.json";
import ru from "./locales/ru.json";

export type LocaleKey = keyof typeof en;
const dictionaries: Record<string, Partial<Record<LocaleKey, string>>> = { en, ru };

let current = "en";
let dict: Partial<Record<LocaleKey, string>> = en;

export function setLocale(locale: string): void {
  current = dictionaries[locale] ? locale : "en";
  dict = dictionaries[current] ?? en;
}

export function getLocale(): string { return current; }

/** Русская плюрализация: forms = [1 день, 2 дня, 5 дней]. */
export function plural(n: number, formsTag: LocaleKey): string {
  const forms = (dict[formsTag] ?? en[formsTag]).split(",");
  const abs = Math.abs(n) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (d > 1 && d < 5) return forms[1];
  if (d === 1) return forms[0];
  return forms[2];
}

export function t(key: LocaleKey, vars?: Record<string, string | number>): string {
  const raw = dict[key] ?? en[key];
  if (!vars) return raw;
  return raw.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(vars[name] ?? ""));
}
