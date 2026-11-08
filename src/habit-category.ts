/** Keep category labels readable while treating blank or non-text values as unassigned. */
export function normalizeHabitCategory(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}
