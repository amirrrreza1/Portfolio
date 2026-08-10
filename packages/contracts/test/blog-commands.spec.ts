import { describe, expect, it } from "vitest";

import {
  archiveTranslationSchema,
  autosaveDraftSchema,
  bodyMarkdownSchema,
  canPublish,
  importRequestSchema,
  MAX_BODY_BYTES,
  publishTranslationSchema,
  saveTranslationSchema,
  scheduleTranslationSchema,
  unpublishTranslationSchema,
  warningsSatisfied,
} from "../src/blog/commands.js";
import {
  blobShaSchema,
  isDiscoverable,
  SYNC_STATE_MEANING,
  syncStateSchema,
} from "../src/content/sync.js";
import { CURRENT_FRONTMATTER_VERSION } from "../src/content/frontmatter.js";

const POST_ID = "clx8k2p9q0000abcd1234efg";
const SHA = "a".repeat(40);

const frontmatter = {
  schemaVersion: CURRENT_FRONTMATTER_VERSION,
  postId: POST_ID,
  locale: "en",
  title: "A title",
  slug: "a-title",
  excerpt: "An excerpt.",
  status: "draft",
};

describe("bodyMarkdownSchema", () => {
  it("normalizes CRLF to LF", () => {
    expect(bodyMarkdownSchema.parse("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("strips a byte order mark", () => {
    // A BOM survives a round trip through most editors and then shows up as an
    // invisible character before the first heading.
    expect(bodyMarkdownSchema.parse("﻿## Heading")).toBe("## Heading");
  });

  it("bounds the body size", () => {
    expect(
      bodyMarkdownSchema.safeParse("a".repeat(MAX_BODY_BYTES + 1)).success
    ).toBe(false);
  });
});

describe("saveTranslationSchema", () => {
  it("accepts a save with a base SHA", () => {
    expect(
      saveTranslationSchema.safeParse({
        frontmatter,
        body: "## Heading\n\nText.",
        baseSha: SHA,
      }).success
    ).toBe(true);
  });

  it("accepts a null base SHA for a first save", () => {
    expect(
      saveTranslationSchema.safeParse({
        frontmatter,
        body: "## Heading",
        baseSha: null,
      }).success
    ).toBe(true);
  });

  it("requires baseSha to be present even when null", () => {
    // An omitted field is indistinguishable from a client that forgot it, and
    // guessing wrong silently overwrites someone else's work.
    expect(
      saveTranslationSchema.safeParse({ frontmatter, body: "## H" }).success
    ).toBe(false);
  });

  it("rejects a malformed blob SHA", () => {
    expect(
      saveTranslationSchema.safeParse({
        frontmatter,
        body: "## H",
        baseSha: "not-a-sha",
      }).success
    ).toBe(false);
  });

  it("validates the embedded frontmatter", () => {
    expect(
      saveTranslationSchema.safeParse({
        frontmatter: { ...frontmatter, status: "published" },
        body: "## H",
        baseSha: SHA,
      }).success
    ).toBe(false);
  });
});

describe("autosaveDraftSchema", () => {
  it("accepts invalid frontmatter, because a draft is work in progress", () => {
    // Validating here would make autosave fail exactly when the author most
    // needs their work kept.
    expect(
      autosaveDraftSchema.safeParse({
        body: "half a sentence",
        frontmatter: { title: "" },
        baseSha: null,
      }).success
    ).toBe(true);
  });

  it("carries no publish or status field", () => {
    expect(
      autosaveDraftSchema.safeParse({
        body: "text",
        baseSha: null,
        status: "published",
      }).success
    ).toBe(false);
  });
});

describe("publishTranslationSchema", () => {
  it("accepts a publish command", () => {
    expect(
      publishTranslationSchema.safeParse({ version: 3, expectedSha: SHA })
        .success
    ).toBe(true);
  });

  it("carries no client-supplied timestamp", () => {
    // A client-supplied publication time is either redundant or a way to
    // backdate past the scheduler and the audit trail.
    expect(
      publishTranslationSchema.safeParse({
        version: 3,
        expectedSha: SHA,
        publishedAt: "2020-01-01T00:00:00Z",
      }).success
    ).toBe(false);
  });

  it("requires the concurrency token", () => {
    expect(publishTranslationSchema.safeParse({ version: 3 }).success).toBe(
      false
    );
  });
});

describe("scheduleTranslationSchema", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();

  it("accepts a future timestamp", () => {
    expect(
      scheduleTranslationSchema.safeParse({
        version: 1,
        expectedSha: SHA,
        scheduledFor: future,
      }).success
    ).toBe(true);
  });

  it("rejects a past timestamp", () => {
    // A past scheduledFor is a publish command wearing a schedule command's
    // clothes, and it would skip the publish checklist.
    expect(
      scheduleTranslationSchema.safeParse({
        version: 1,
        expectedSha: SHA,
        scheduledFor: past,
      }).success
    ).toBe(false);
  });

  it("rejects a malformed timestamp", () => {
    expect(
      scheduleTranslationSchema.safeParse({
        version: 1,
        expectedSha: SHA,
        scheduledFor: "next tuesday",
      }).success
    ).toBe(false);
  });
});

describe("withdrawal commands require a reason", () => {
  it("rejects unpublish with no reason", () => {
    expect(unpublishTranslationSchema.safeParse({ version: 2 }).success).toBe(
      false
    );
  });

  it("rejects a blank reason", () => {
    expect(
      unpublishTranslationSchema.safeParse({ version: 2, reason: "   " })
        .success
    ).toBe(false);
  });

  it("defaults archive redirect to null so a 410 is deliberate", () => {
    const result = archiveTranslationSchema.parse({
      version: 2,
      reason: "Superseded.",
    });
    expect(result.redirectTo).toBeNull();
  });
});

describe("importRequestSchema", () => {
  it("is a dry run by default", () => {
    const result = importRequestSchema.parse({ postId: null, locale: "en" });
    expect(result.confirm).toBe(false);
  });

  it("rejects confirming without the report token", () => {
    // Otherwise "confirm" is a boolean the client sets on the first call, and
    // the author never sees the report they are confirming.
    expect(
      importRequestSchema.safeParse({
        postId: null,
        locale: "en",
        confirm: true,
      }).success
    ).toBe(false);
  });

  it("accepts confirming with the report token", () => {
    expect(
      importRequestSchema.safeParse({
        postId: null,
        locale: "en",
        confirm: true,
        reportToken: "token-from-dry-run",
      }).success
    ).toBe(true);
  });
});

describe("publish checklist", () => {
  it("blocks on any blocker", () => {
    expect(canPublish({ blockers: ["EMPTY_BODY"], warnings: [] })).toBe(false);
    expect(canPublish({ blockers: [], warnings: ["SHORT_BODY"] })).toBe(true);
  });

  it("requires every raised warning to be acknowledged", () => {
    const checklist = {
      blockers: [],
      warnings: ["SHORT_BODY", "MISSING_COVER_IMAGE"],
    } as const;

    expect(warningsSatisfied(checklist, ["SHORT_BODY"])).toBe(false);
    expect(
      warningsSatisfied(checklist, ["SHORT_BODY", "MISSING_COVER_IMAGE"])
    ).toBe(true);
  });

  it("tolerates acknowledging a warning that is no longer raised", () => {
    expect(
      warningsSatisfied({ blockers: [], warnings: [] }, ["SHORT_BODY"])
    ).toBe(true);
  });
});

describe("sync state", () => {
  it("treats only SYNCED as discoverable", () => {
    for (const state of syncStateSchema.options) {
      expect(isDiscoverable(state)).toBe(state === "SYNCED");
    }
  });

  it("explains every state for the dashboard", () => {
    for (const state of syncStateSchema.options) {
      expect(SYNC_STATE_MEANING[state].length).toBeGreaterThan(0);
    }
  });
});

describe("blobShaSchema", () => {
  it("accepts SHA-1 and SHA-256 lengths", () => {
    // GitHub is migrating; accepting only one length breaks on whichever side
    // of that transition this was not written for.
    expect(blobShaSchema.safeParse("a".repeat(40)).success).toBe(true);
    expect(blobShaSchema.safeParse("a".repeat(64)).success).toBe(true);
  });

  it.each([39, 41, 63, 65])("rejects length %s", (length) => {
    expect(blobShaSchema.safeParse("a".repeat(length)).success).toBe(false);
  });

  it("rejects uppercase hex", () => {
    expect(blobShaSchema.safeParse("A".repeat(40)).success).toBe(false);
  });
});
