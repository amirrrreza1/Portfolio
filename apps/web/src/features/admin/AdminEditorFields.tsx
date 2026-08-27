import type { ReactNode } from "react";

export const inputClass =
  "FormInput mt-1 w-full border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none disabled:opacity-60";

export function Field({
  label,
  children,
  hint,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly hint?: string;
}): React.JSX.Element {
  return (
    <label className="flex min-w-0 flex-col text-sm font-medium">
      {label}
      {children}
      {hint === undefined ? null : (
        <span className="text-text-muted mt-1 text-xs font-normal">{hint}</span>
      )}
    </label>
  );
}

export function Check({
  name,
  label,
  defaultChecked,
  value,
}: {
  readonly name: string;
  readonly label: string;
  readonly defaultChecked?: boolean;
  readonly value?: string;
}): React.JSX.Element {
  return (
    <label className="border-border flex min-h-11 items-center gap-3 border px-3 py-2 text-sm">
      <input
        name={name}
        type="checkbox"
        value={value}
        defaultChecked={defaultChecked}
        className="accent-accent h-4 w-4"
      />
      <span>{label}</span>
    </label>
  );
}

export function SaveButton({
  busy,
  children = "Save changes",
}: {
  readonly busy: boolean;
  readonly children?: ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="submit"
      disabled={busy}
      className="bg-primary text-bg focus-visible:ring-accent self-start px-4 py-2 text-sm font-semibold disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      {busy ? "Saving…" : children}
    </button>
  );
}

export function EditorStatus({
  message,
  error,
}: {
  readonly message: string | null;
  readonly error?: boolean;
}): React.JSX.Element {
  return (
    <p
      className={`min-h-5 text-sm ${error ? "text-danger" : "text-text-muted"}`}
      role={error ? "alert" : "status"}
      aria-live="polite"
    >
      {message ?? " "}
    </p>
  );
}

export function LocaleBadge({
  locale,
  present,
}: {
  readonly locale: "en" | "fa";
  readonly present: boolean;
}): React.JSX.Element {
  return (
    <span
      className={`border px-2 py-1 font-mono text-xs ${
        present ? "border-success text-success" : "border-danger text-danger"
      }`}
    >
      {locale.toUpperCase()} · {present ? "ready" : "missing"}
    </span>
  );
}

export function ResourceHeading({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-text-muted max-w-3xl text-sm">{description}</p>
    </div>
  );
}
