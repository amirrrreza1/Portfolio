import { z } from "zod";

/**
 * The error contract from
 * [API_SPEC.md](../../../../docs/API_SPEC.md) §2.
 *
 * Errors never expose stack traces or internal exception messages. The `code`
 * is the stable, machine-readable part; `message` is deliberately generic and
 * safe to display. Anything diagnostic lives in server logs keyed by
 * `requestId`, which is the one value that appears in both places.
 */

/** Stable codes from API_SPEC §2, plus the content-store codes from §3. */
export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "AUTHENTICATION_REQUIRED",
  "AUTHENTICATION_FAILED",
  "CSRF_FAILED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA",
  "INTERNAL_ERROR",
  "CONTENT_STORE_UNAVAILABLE",
  "CONTENT_VALIDATION_FAILED",
  "CONTENT_CONFLICT",
  "TRANSLATION_NOT_FOUND",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorCodeSchema = z.enum(ERROR_CODES);

/**
 * HTTP status for each code.
 *
 * Mapped in one place so a handler cannot answer `CONFLICT` with a `400`. The
 * status is derivable from the code, never chosen independently at the call
 * site.
 */
export const ERROR_STATUS: { readonly [K in ErrorCode]: number } = {
  VALIDATION_FAILED: 400,
  AUTHENTICATION_REQUIRED: 401,
  AUTHENTICATION_FAILED: 401,
  CSRF_FAILED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  INTERNAL_ERROR: 500,
  CONTENT_STORE_UNAVAILABLE: 503,
  CONTENT_VALIDATION_FAILED: 422,
  CONTENT_CONFLICT: 409,
  TRANSLATION_NOT_FOUND: 404,
} as const;

/**
 * Generic, safe messages.
 *
 * `AUTHENTICATION_FAILED` says the same thing whether the email is unknown or
 * the password is wrong, because a distinguishable answer is a user-enumeration
 * oracle.
 */
export const ERROR_MESSAGES: { readonly [K in ErrorCode]: string } = {
  VALIDATION_FAILED: "The request could not be accepted.",
  AUTHENTICATION_REQUIRED: "Authentication is required.",
  AUTHENTICATION_FAILED: "Those credentials could not be verified.",
  CSRF_FAILED: "The request could not be verified.",
  FORBIDDEN: "This action is not permitted.",
  NOT_FOUND: "The requested resource does not exist.",
  CONFLICT: "The resource changed since it was loaded.",
  RATE_LIMITED: "Too many requests. Try again shortly.",
  PAYLOAD_TOO_LARGE: "The request payload is too large.",
  UNSUPPORTED_MEDIA: "That media type is not supported.",
  INTERNAL_ERROR: "Something went wrong.",
  CONTENT_STORE_UNAVAILABLE: "The content store is unavailable.",
  CONTENT_VALIDATION_FAILED: "The content could not be validated.",
  CONTENT_CONFLICT: "The content changed since it was loaded.",
  TRANSLATION_NOT_FOUND: "That translation is not available.",
} as const;

/**
 * Per-field validation messages.
 *
 * Field-level detail is safe because it describes the request the client just
 * sent, not server state. Keys are dotted paths so nested and array positions
 * survive: `translations.1.title`.
 */
export const fieldErrorsSchema = z.record(
  z.string(),
  z.array(z.string()).min(1)
);

export type FieldErrors = z.infer<typeof fieldErrorsSchema>;

export const errorBodySchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string().min(1),
    fields: fieldErrorsSchema.optional(),
    requestId: z.string().min(1),
  }),
});

export type ErrorBody = z.infer<typeof errorBodySchema>;

/** `meta` carried by every response, error or not. */
export const responseMetaSchema = z.object({
  requestId: z.string().min(1),
});

export type ResponseMeta = z.infer<typeof responseMetaSchema>;

/** Single-resource success envelope ([API_SPEC.md](../../../../docs/API_SPEC.md) §2). */
export function successEnvelopeSchema<T extends z.ZodType>(data: T) {
  return z.object({
    data,
    meta: responseMetaSchema,
  });
}

/** List success envelope, adding the cursor for the next page. */
export function listEnvelopeSchema<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    meta: responseMetaSchema.extend({
      nextCursor: z.string().nullable(),
    }),
  });
}

/**
 * Builds an error body with the correct generic message for its code.
 *
 * Taking the message from `ERROR_MESSAGES` rather than a parameter is the point:
 * it removes the call site's opportunity to pass an exception message through
 * to a client.
 */
export function buildErrorBody(
  code: ErrorCode,
  requestId: string,
  fields?: FieldErrors
): ErrorBody {
  return {
    error: {
      code,
      message: ERROR_MESSAGES[code],
      requestId,
      ...(fields && Object.keys(fields).length > 0 ? { fields } : {}),
    },
  };
}

/**
 * Converts a Zod failure into `fields`, with a cap.
 *
 * The cap is not cosmetic: a deeply nested payload can produce thousands of
 * issues, and echoing all of them turns a rejected request into an amplification
 * vector against the client and the logs.
 */
export const MAX_REPORTED_FIELDS = 50;

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const fields: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join(".") : "_";
    const existing = fields[path];

    if (existing) {
      existing.push(issue.message);
      continue;
    }

    if (Object.keys(fields).length >= MAX_REPORTED_FIELDS) break;
    fields[path] = [issue.message];
  }

  return fields;
}
