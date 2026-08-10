import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  buildErrorBody,
  ERROR_CODES,
  ERROR_MESSAGES,
  ERROR_STATUS,
  errorBodySchema,
  listEnvelopeSchema,
  MAX_REPORTED_FIELDS,
  successEnvelopeSchema,
  toFieldErrors,
} from "../src/common/errors.js";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  paginationQuerySchema,
} from "../src/common/pagination.js";

describe("error code table", () => {
  it("maps every code to a status and a message", () => {
    // A code without a status would be answered with whatever the handler
    // guessed, which is how CONFLICT ends up as a 400.
    for (const code of ERROR_CODES) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
      expect(ERROR_MESSAGES[code].length).toBeGreaterThan(0);
    }
  });

  it("gives the same message whether authentication failed or the user is unknown", () => {
    // A distinguishable answer is a user-enumeration oracle.
    expect(ERROR_MESSAGES.AUTHENTICATION_FAILED).not.toMatch(
      /password|email|user/i
    );
  });

  it("keeps every message free of internal detail", () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_MESSAGES[code]).not.toMatch(/stack|exception|sql|prisma/i);
    }
  });
});

describe("buildErrorBody", () => {
  it("takes the message from the table rather than the caller", () => {
    // The call site has no parameter through which an exception message could
    // reach a client.
    const body = buildErrorBody("NOT_FOUND", "req-1");

    expect(body.error.message).toBe(ERROR_MESSAGES.NOT_FOUND);
    expect(errorBodySchema.safeParse(body).success).toBe(true);
  });

  it("omits fields when there are none", () => {
    expect(
      buildErrorBody("INTERNAL_ERROR", "req-1").error.fields
    ).toBeUndefined();
  });

  it("includes field errors when present", () => {
    const body = buildErrorBody("VALIDATION_FAILED", "req-1", {
      title: ["Required"],
    });

    expect(body.error.fields).toEqual({ title: ["Required"] });
    expect(errorBodySchema.safeParse(body).success).toBe(true);
  });
});

describe("toFieldErrors", () => {
  const schema = z.object({
    title: z.string().min(1),
    nested: z.object({ slug: z.string().min(1) }),
  });

  it("uses dotted paths so nested positions survive", () => {
    const result = schema.safeParse({ title: "", nested: { slug: "" } });
    expect(result.success).toBe(false);

    if (!result.success) {
      const fields = toFieldErrors(result.error);
      expect(Object.keys(fields).sort()).toEqual(["nested.slug", "title"]);
    }
  });

  it("caps the number of reported fields", () => {
    // A deeply nested payload can produce thousands of issues; echoing all of
    // them turns a rejected request into an amplification vector.
    const wide = z.object(
      Object.fromEntries(
        Array.from({ length: MAX_REPORTED_FIELDS + 20 }, (_, index) => [
          `field${index}`,
          z.string(),
        ])
      )
    );

    const result = wide.safeParse({});
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(
        Object.keys(toFieldErrors(result.error)).length
      ).toBeLessThanOrEqual(MAX_REPORTED_FIELDS);
    }
  });
});

describe("response envelopes", () => {
  it("validates a single-resource response", () => {
    const schema = successEnvelopeSchema(z.object({ id: z.string() }));

    expect(
      schema.safeParse({ data: { id: "a" }, meta: { requestId: "r" } }).success
    ).toBe(true);
  });

  it("requires nextCursor on a list response, allowing null", () => {
    const schema = listEnvelopeSchema(z.object({ id: z.string() }));

    expect(
      schema.safeParse({
        data: [{ id: "a" }],
        meta: { requestId: "r", nextCursor: null },
      }).success
    ).toBe(true);

    expect(
      schema.safeParse({ data: [], meta: { requestId: "r" } }).success
    ).toBe(false);
  });
});

describe("paginationQuerySchema", () => {
  it("applies the default page size", () => {
    expect(paginationQuerySchema.parse({}).limit).toBe(DEFAULT_PAGE_SIZE);
  });

  it("coerces a string limit from a query string", () => {
    expect(paginationQuerySchema.parse({ limit: "50" }).limit).toBe(50);
  });

  it("rejects rather than silently clamping an oversized limit", () => {
    // Answering a request for 10,000 rows with 100 hides the client's
    // misunderstanding until it becomes a performance incident.
    expect(
      paginationQuerySchema.safeParse({ limit: MAX_PAGE_SIZE + 1 }).success
    ).toBe(false);
  });

  it("rejects a non-positive limit", () => {
    expect(paginationQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it("rejects a cursor containing non-URL-safe characters", () => {
    expect(paginationQuerySchema.safeParse({ cursor: "a/b+c=" }).success).toBe(
      false
    );
  });
});
