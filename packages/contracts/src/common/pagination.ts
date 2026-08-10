import { z } from "zod";

/**
 * Cursor pagination, per
 * [API_SPEC.md](../../../../docs/API_SPEC.md) §2–§3.
 *
 * Cursors rather than offsets because every paginated list here is ordered by
 * publication time and mutates while being read. With `OFFSET`, publishing one
 * article shifts every subsequent page by one row, so a reader paging through
 * the blog silently skips an entry.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Server-capped page size.
 *
 * The cap is enforced here rather than clamped silently: a client asking for
 * 10,000 rows has misunderstood the contract, and answering with 100 hides that
 * from them until it becomes a performance incident.
 */
export const pageSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_PAGE_SIZE)
  .default(DEFAULT_PAGE_SIZE);

/**
 * An opaque cursor.
 *
 * Opaque so its encoding can change without a version bump, and bounded so a
 * crafted value cannot become an expensive decode. Its contents are validated
 * by whoever issued it; a cursor that does not decode is `VALIDATION_FAILED`,
 * never a silent restart from the first page.
 */
export const cursorSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/, "Must be an opaque URL-safe cursor.");

export type Cursor = z.infer<typeof cursorSchema>;

export const paginationQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: pageSizeSchema,
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * Sort direction for the small number of endpoints that expose one.
 *
 * Public list filters use explicit allowlists and arbitrary field sorting is
 * forbidden ([API_SPEC.md](../../../../docs/API_SPEC.md) §3), so a *field* name
 * never comes from the client — only its direction.
 */
export const sortDirectionSchema = z.enum(["asc", "desc"]).default("desc");

export type SortDirection = z.infer<typeof sortDirectionSchema>;
