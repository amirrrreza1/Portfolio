import { describe, expect, it } from "vitest";

import { getMessages, messageCatalogs } from "../src/i18n/messages";
import { formatNumber, formatPublicDate } from "../src/i18n/format";

function flatten(
  value: Readonly<Record<string, unknown>>,
  prefix = ""
): Readonly<Record<string, string>> {
  const entries: [string, string][] = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix.length === 0 ? key : `${prefix}.${key}`;
    if (typeof child === "string") entries.push([path, child]);
    else
      entries.push(
        ...Object.entries(flatten(child as Record<string, unknown>, path))
      );
  }
  return Object.fromEntries(entries);
}

describe("typed public message catalogs", () => {
  it("has exact English/Persian key parity with no empty or HTML values", () => {
    const english = flatten(messageCatalogs.en);
    const persian = flatten(messageCatalogs.fa);
    expect(Object.keys(persian).sort()).toEqual(Object.keys(english).sort());
    for (const catalog of [english, persian]) {
      for (const value of Object.values(catalog)) {
        expect(value.trim().length).toBeGreaterThan(0);
        expect(value).not.toMatch(/<\/?[a-z][^>]*>/i);
      }
    }
  });

  it("localizes blog copy while portfolio copy stays English", () => {
    expect(getMessages("en").projects.all).toBe("All projects");
    expect(getMessages("fa").projects.all).toBe("All projects");
    expect(getMessages("fa").blog.title).toBe("وبلاگ");
  });

  it("formats visitor-facing numbers and Persian dates by locale", () => {
    expect(formatNumber(1234, "en")).toBe("1,234");
    expect(formatNumber(1234, "fa")).toMatch(/[۱۲۳۴]/);
    expect(formatPublicDate("2026-08-14", "en")).toContain("2026");
    expect(formatPublicDate("2026-08-14", "fa")).toMatch(/[۰-۹]/);
    expect(formatPublicDate("not-a-date", "fa")).toBe("not-a-date");
  });
});
