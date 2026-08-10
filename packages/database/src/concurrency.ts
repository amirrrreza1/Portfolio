/**
 * Optimistic concurrency and transaction helpers.
 *
 * [API_SPEC.md](../../../docs/API_SPEC.md) §3: a mutation on an existing
 * resource carries an `If-Match` version, and a stale value returns `409
 * CONFLICT` and makes **no write**. "Makes no write" is the hard part — it is
 * why the version predicate belongs in the `WHERE` clause of the update rather
 * than in a read-then-write check, which has a window between the two
 * statements.
 */

/** Thrown when the caller's version no longer matches the stored row. */
export class OptimisticConcurrencyError extends Error {
  readonly code = "CONFLICT" as const;

  readonly entity: string;
  readonly id: string;
  readonly expectedVersion: number;
  readonly currentVersion: number | null;

  // Explicit field assignment rather than TypeScript parameter properties.
  // Parameter properties emit code rather than only erasing types, so they are
  // rejected by Node's built-in type stripping — and this package's seed and
  // scripts are exactly the kind of thing that ends up run that way.
  constructor(
    entity: string,
    id: string,
    expectedVersion: number,
    currentVersion: number | null
  ) {
    super(
      currentVersion === null
        ? `${entity} ${id} no longer exists.`
        : `${entity} ${id} has moved from version ${expectedVersion} to ${currentVersion}.`
    );
    this.name = "OptimisticConcurrencyError";
    this.entity = entity;
    this.id = id;
    this.expectedVersion = expectedVersion;
    this.currentVersion = currentVersion;
  }
}

/**
 * The minimum a Prisma model delegate must expose for the helper below.
 *
 * Structural rather than importing Prisma's generated types, so this module
 * compiles before `prisma generate` has ever run — otherwise a clean checkout
 * cannot typecheck until someone has a database.
 */
export interface VersionedDelegate<T> {
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  findUnique(args: {
    where: { id: string };
    select: { version: true };
  }): Promise<{ version: number } | null>;
  findUniqueOrThrow(args: { where: { id: string } }): Promise<T>;
}

/**
 * Updates a row only if its version still matches, incrementing it atomically.
 *
 * `updateMany` rather than `update` is deliberate: it accepts a compound
 * `where`, so the version check and the write are one statement. A `count` of
 * zero means someone else got there first, and nothing was written.
 */
export async function updateWithVersion<T>(
  delegate: VersionedDelegate<T>,
  entity: string,
  id: string,
  expectedVersion: number,
  data: Record<string, unknown>
): Promise<T> {
  const result = await delegate.updateMany({
    where: { id, version: expectedVersion },
    data: { ...data, version: { increment: 1 } },
  });

  if (result.count === 0) {
    // Distinguish "changed underneath you" from "deleted underneath you". The
    // admin UI shows a diff for the first and a different message for the
    // second, and conflating them makes a deleted record look like a conflict
    // the user could resolve by retrying.
    const current = await delegate.findUnique({
      where: { id },
      select: { version: true },
    });

    throw new OptimisticConcurrencyError(
      entity,
      id,
      expectedVersion,
      current?.version ?? null
    );
  }

  return delegate.findUniqueOrThrow({ where: { id } });
}

/**
 * Advisory lock keys for the scheduler and sync worker (ADR-013).
 *
 * PostgreSQL advisory locks take a 64-bit integer, so a stable name has to be
 * hashed into one. This is FNV-1a folded to 63 bits — deterministic across
 * processes and restarts, which is the whole requirement, since two replicas
 * must derive the same key from the same name or the lock does not exclude
 * anything.
 */
export function advisoryLockKey(name: string): bigint {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (const byte of new TextEncoder().encode(name)) {
    hash = ((hash ^ BigInt(byte)) * prime) & mask;
  }

  // Fold to 63 bits: pg_advisory_lock takes a signed bigint, and a value with
  // the sign bit set would be a different number than the one intended.
  return hash & 0x7fffffffffffffffn;
}

export const ADVISORY_LOCKS = {
  scheduler: advisoryLockKey("portfolio:scheduler"),
  contentSync: advisoryLockKey("portfolio:content-sync"),
  reconciliation: advisoryLockKey("portfolio:reconciliation"),
} as const;

/**
 * Minimal transaction surface, again structural so this compiles without the
 * generated client.
 */
export interface TransactionCapable {
  $transaction<R>(
    fn: (tx: unknown) => Promise<R>,
    options?: { maxWait?: number; timeout?: number; isolationLevel?: string }
  ): Promise<R>;
  $queryRawUnsafe<R = unknown>(query: string, ...values: unknown[]): Promise<R>;
}

/**
 * Runs work while holding a session-level advisory lock, or returns `null` if
 * another process holds it.
 *
 * `pg_try_advisory_lock` rather than `pg_advisory_lock`: the scheduler should
 * skip a tick it cannot claim, not queue up behind the previous one. Queuing is
 * how a slow run turns into a backlog that publishes everything at once.
 *
 * The lock is session-scoped, so the release in `finally` matters — and if the
 * process dies without it, the connection closing releases the lock anyway.
 */
export async function withAdvisoryLock<R>(
  db: TransactionCapable,
  key: bigint,
  fn: () => Promise<R>
): Promise<R | null> {
  const rows = await db.$queryRawUnsafe<Array<{ locked: boolean }>>(
    "SELECT pg_try_advisory_lock($1) AS locked",
    key
  );

  if (!rows[0]?.locked) return null;

  try {
    return await fn();
  } finally {
    await db.$queryRawUnsafe("SELECT pg_advisory_unlock($1)", key);
  }
}
