import { describe, expect, it } from "vitest";

import {
  hexColorSchema,
  httpsUrlSchema,
  internalPathSchema,
  isoDateSchema,
  mailtoUrlSchema,
  multilineTextSchema,
  normalizedEmailSchema,
  sortOrderSchema,
  trimmedTextSchema,
} from "../src/common/values.js";

describe("hexColorSchema", () => {
  it("accepts and lowercases a six-digit hex colour", () => {
    expect(hexColorSchema.parse("#F7DF1E")).toBe("#f7df1e");
  });

  it.each(["#fff", "f7df1e", "red", "#f7df1", "#f7df1eff", "rgb(0,0,0)"])(
    "rejects %s",
    (value) => {
      expect(hexColorSchema.safeParse(value).success).toBe(false);
    }
  );

  it("accepts the legacy #000000 values so migration can report them", () => {
    // Two legacy skill colours are pure black. They are valid hex and must
    // parse; the contrast check that flags them belongs to the appearance
    // layer, and conflating the two would make the migration fail on data it
    // is supposed to report.
    expect(hexColorSchema.parse("#000000")).toBe("#000000");
  });
});

describe("httpsUrlSchema", () => {
  it("accepts an absolute https URL", () => {
    expect(httpsUrlSchema.safeParse("https://example.com/a").success).toBe(
      true
    );
  });

  it.each([
    ["javascript:alert(1)", "javascript"],
    ["data:text/html,<script>", "data"],
    ["vbscript:msgbox", "vbscript"],
    ["file:///etc/passwd", "file"],
    ["http://example.com", "plain http"],
    ["//example.com", "protocol-relative"],
    ["/relative", "relative"],
    ["not a url", "free text"],
  ])("rejects %s (%s)", (value) => {
    expect(httpsUrlSchema.safeParse(value).success).toBe(false);
  });

  it("rejects embedded credentials", () => {
    expect(
      httpsUrlSchema.safeParse("https://user:pass@example.com").success
    ).toBe(false);
  });
});

describe("mailtoUrlSchema", () => {
  it("accepts a single address", () => {
    expect(mailtoUrlSchema.safeParse("mailto:owner@example.com").success).toBe(
      true
    );
  });

  it("rejects a non-mailto scheme", () => {
    expect(mailtoUrlSchema.safeParse("https://example.com").success).toBe(
      false
    );
  });

  it("rejects a malformed address", () => {
    expect(mailtoUrlSchema.safeParse("mailto:not-an-address").success).toBe(
      false
    );
  });
});

describe("internalPathSchema", () => {
  it("accepts a site-relative path", () => {
    expect(internalPathSchema.safeParse("/projects").success).toBe(true);
  });

  it("rejects a protocol-relative path", () => {
    // A browser treats //host as absolute, so allowing it would turn a nav
    // item into an off-site redirect.
    expect(internalPathSchema.safeParse("//evil.example").success).toBe(false);
  });

  it("rejects a backslash-prefixed path", () => {
    expect(internalPathSchema.safeParse("/\\evil.example").success).toBe(false);
  });

  it("rejects an absolute URL", () => {
    expect(internalPathSchema.safeParse("https://evil.example").success).toBe(
      false
    );
  });

  it("rejects parent-directory traversal", () => {
    expect(internalPathSchema.safeParse("/../../etc/passwd").success).toBe(
      false
    );
  });

  it("rejects control characters", () => {
    expect(internalPathSchema.safeParse("/proj\u0009ects").success).toBe(false);
    expect(internalPathSchema.safeParse("/proj\u000Aects").success).toBe(false);
    expect(internalPathSchema.safeParse("/proj\u0000ects").success).toBe(false);
  });
});

describe("isoDateSchema", () => {
  it("accepts a real date", () => {
    expect(isoDateSchema.safeParse("2024-05-26").success).toBe(true);
  });

  it("accepts a leap day in a leap year", () => {
    expect(isoDateSchema.safeParse("2024-02-29").success).toBe(true);
  });

  it("rejects a leap day in a non-leap year", () => {
    expect(isoDateSchema.safeParse("2023-02-29").success).toBe(false);
  });

  it("rejects a date that Date.UTC would roll forward", () => {
    expect(isoDateSchema.safeParse("2024-02-30").success).toBe(false);
    expect(isoDateSchema.safeParse("2024-13-01").success).toBe(false);
  });

  it("rejects the legacy slash format so migration must normalize it", () => {
    expect(isoDateSchema.safeParse("2024/05/26").success).toBe(false);
  });
});

describe("trimmedTextSchema", () => {
  it("trims and collapses interior whitespace", () => {
    expect(trimmedTextSchema({ max: 50 }).parse("  a   b \n c  ")).toBe(
      "a b c"
    );
  });

  it("rejects a value that is only whitespace", () => {
    expect(trimmedTextSchema({ max: 50 }).safeParse("   ").success).toBe(false);
  });

  it("enforces the maximum after trimming", () => {
    const schema = trimmedTextSchema({ max: 3 });
    expect(schema.safeParse("  abc  ").success).toBe(true);
    expect(schema.safeParse("abcd").success).toBe(false);
  });
});

describe("multilineTextSchema", () => {
  it("normalizes CRLF to LF", () => {
    expect(multilineTextSchema({ max: 100 }).parse("a\r\nb")).toBe("a\nb");
  });

  it("preserves a single paragraph break but collapses longer runs", () => {
    expect(multilineTextSchema({ max: 100 }).parse("a\n\n\n\nb")).toBe(
      "a\n\nb"
    );
  });
});

describe("sortOrderSchema", () => {
  it("accepts zero", () => {
    expect(sortOrderSchema.safeParse(0).success).toBe(true);
  });

  it.each([-1, 1.5, 10_001])("rejects %s", (value) => {
    expect(sortOrderSchema.safeParse(value).success).toBe(false);
  });
});

describe("normalizedEmailSchema", () => {
  it("lowercases the domain only", () => {
    // RFC 5321 makes the local part case-sensitive. Rewriting it would change
    // an address the owner may have entered deliberately.
    expect(normalizedEmailSchema.parse("Owner@Example.COM")).toBe(
      "Owner@example.com"
    );
  });

  it.each(["no-at-sign", "a@b", "a@@b.com", "a b@example.com"])(
    "rejects %s",
    (value) => {
      expect(normalizedEmailSchema.safeParse(value).success).toBe(false);
    }
  );
});
