"use client";

/**
 * The admin failure boundary.
 *
 * Its whole job is to say nothing. The public error path can afford a friendly
 * page; an admin one must not report which upstream failed, what status it
 * answered, or what the stack looked like, because the person reading it is
 * not necessarily the owner. The `requestId` an operator needs is already in
 * the server log, correlated with the same request.
 */
export default function AdminError({
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}): React.JSX.Element {
  return (
    <div className="border-border flex flex-col gap-4 border p-6" role="alert">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-text-muted text-sm">
        The admin panel could not complete that request.
      </p>
      <button
        type="button"
        onClick={reset}
        className="border-border text-text w-fit border p-2 text-sm"
      >
        Try again
      </button>
    </div>
  );
}
