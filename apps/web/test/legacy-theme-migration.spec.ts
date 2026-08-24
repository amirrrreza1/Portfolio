import { resolveLegacyThemeMigration } from "../src/Contexts/ThemeContext";
import { describe, expect, it } from "vitest";

describe("legacy theme preference migration", () => {
  it("adopts a valid M4 localStorage theme when no M5 cookie exists", () => {
    expect(resolveLegacyThemeMigration("light", null)).toBe("light");
    expect(resolveLegacyThemeMigration("dark", null)).toBe("dark");
  });

  it("does not let an old localStorage value override a valid cookie", () => {
    expect(
      resolveLegacyThemeMigration("light", {
        v: 1,
        theme: "dark",
      })
    ).toBeNull();
  });

  it("rejects malformed and unsupported legacy values", () => {
    expect(resolveLegacyThemeMigration(null, null)).toBeNull();
    expect(resolveLegacyThemeMigration("solarized", null)).toBeNull();
    expect(resolveLegacyThemeMigration('{"theme":"light"}', null)).toBeNull();
  });
});
