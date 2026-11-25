import { describe, expect, it } from "vitest";
import en from "../src/locales/en.json";
import ru from "../src/locales/ru.json";

const missingInRu = Object.keys(en).filter((k) => !(k in ru));
const extraInRu = Object.keys(ru).filter((k) => !(k in en));

describe("locales parity", () => {
  it("ru.json contains every en.json key", () => {
    expect(missingInRu).toEqual([]);
  });

  it("ru.json has no extra keys", () => {
    expect(extraInRu).toEqual([]);
  });

  it("no empty translations", () => {
    for (const [k, v] of Object.entries(ru)) {
      expect(String(v).trim().length, k).toBeGreaterThan(0);
    }
  });
});
