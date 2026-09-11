import { cloneElement, isValidElement, useId, type ReactNode } from "react";

export const inputClass =
  "FormInput mt-1 w-full border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none disabled:opacity-60";

/**
 * A labelled control.
 *
 * The label is a **sibling** bound by `htmlFor`, not a wrapper. That
 * distinction is not stylistic: when a `<label>` wraps its control, the
 * control's accessible name is the label element's whole text content — and
 * for a `<select>` that includes every option. Every select in this panel was
 * announced as "RoleEditorOwner" or "CategoryNo categoryengineering" rather
 * than "Role" or "Category". Inputs and textareas contribute no text, which is
 * why the fault was invisible until a select appeared.
 *
 * The id is generated and injected into a single element child, so callers
 * keep writing `<Field label="X"><input /></Field>` and get the correct
 * association without having to invent an id each time.
 */
export function Field({
  label,
  children,
  hint,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly hint?: string;
}): React.JSX.Element {
  const id = useId();
  const hintId = `${id}-hint`;
  const control = isValidElement(children)
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id,
        ...(hint === undefined ? {} : { "aria-describedby": hintId }),
      })
    : children;
  return (
    <div className="flex min-w-0 flex-col text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      {control}
      {hint === undefined ? null : (
        <span id={hintId} className="text-text-muted mt-1 text-xs font-normal">
          {hint}
        </span>
      )}
    </div>
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
      className="bg-primary text-bg focus-visible:ring-accent self-start px-4 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
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
}: {
  readonly title: string;
}): React.JSX.Element {
  return <h3 className="text-lg font-semibold">{title}</h3>;
}
