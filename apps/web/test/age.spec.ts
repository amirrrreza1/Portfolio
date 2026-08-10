import { describe, expect, it } from "vitest";

import { resolveAge } from "../src/Utils/Age";

const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe("resolveAge", () => {
  it("reports an unset value rather than guessing", () => {
    expect(resolveAge(undefined)).toEqual({ status: "unset" });
    expect(resolveAge("   ")).toEqual({ status: "unset" });
  });

  it.each([
    ["2000/01/01", "slash-separated"],
    ["01-01-2000", "day first"],
    ["2000-1-1", "unpadded"],
    ["not a date", "free text"],
  ])("rejects %s (%s)", (value) => {
    expect(resolveAge(value, at("2026-08-10")).status).toBe("invalid");
  });

  it("rejects a calendar-invalid date instead of rolling it forward", () => {
    // Date.UTC(2000, 1, 30) silently becomes 2000-03-01.
    expect(resolveAge("2000-02-30", at("2026-08-10")).status).toBe("invalid");
  });

  it("rejects a future date", () => {
    expect(resolveAge("2030-01-01", at("2026-08-10")).status).toBe("invalid");
  });

  it("counts completed years only", () => {
    expect(resolveAge("2000-08-11", at("2026-08-10"))).toEqual({
      status: "ok",
      age: 25,
    });
  });

  it("increments on the birthday itself", () => {
    expect(resolveAge("2000-08-10", at("2026-08-10"))).toEqual({
      status: "ok",
      age: 26,
    });
  });

  it("handles a 29 February birth date in a non-leap year", () => {
    expect(resolveAge("2000-02-29", at("2026-02-28"))).toEqual({
      status: "ok",
      age: 25,
    });
    expect(resolveAge("2000-02-29", at("2026-03-01"))).toEqual({
      status: "ok",
      age: 26,
    });
  });

  it("is stable across the UTC day boundary", () => {
    // The old client-side implementation used local time, so a visitor east of
    // UTC could see a different age than the server rendered.
    const justBefore = new Date("2026-08-09T23:59:59.000Z");
    const justAfter = new Date("2026-08-10T00:00:01.000Z");

    expect(resolveAge("2000-08-10", justBefore)).toEqual({
      status: "ok",
      age: 25,
    });
    expect(resolveAge("2000-08-10", justAfter)).toEqual({
      status: "ok",
      age: 26,
    });
  });
});
