"use client";

import { useCallback, useEffect, useState } from "react";

import { adminRequest, describeAdminError } from "./admin-client";
import {
  EditorStatus,
  Field,
  inputClass,
  ResourceHeading,
  SaveButton,
} from "./AdminEditorFields";
import { formatUtc } from "./format";

type Revision = {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly entityVersion: number;
  readonly action: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly createdAt: string;
  readonly actor: { readonly displayName: string } | null;
};
type Audit = {
  readonly id: string;
  readonly eventType: string;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly outcome: string;
  readonly metadata: unknown;
  readonly createdAt: string;
  readonly actor: { readonly displayName: string } | null;
};
type User = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: "OWNER" | "EDITOR";
  readonly status: "ACTIVE" | "LOCKED" | "DISABLED";
  readonly lastLoginAt: string | null;
  readonly createdAt: string;
  readonly version: number;
};

export default function AdminHistoryEditor(): React.JSX.Element {
  const [revisions, setRevisions] = useState<readonly Revision[] | null>(null);
  const [audits, setAudits] = useState<readonly Audit[]>([]);
  const [users, setUsers] = useState<readonly User[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      const nextRevisions =
        await adminRequest<readonly Revision[]>("/admin/revisions");
      const [auditResult, userResult] = await Promise.allSettled([
        adminRequest<readonly Audit[]>("/admin/audit-events"),
        adminRequest<readonly User[]>("/admin/users"),
      ]);
      setRevisions(nextRevisions);
      setAudits(auditResult.status === "fulfilled" ? auditResult.value : []);
      setUsers(userResult.status === "fulfilled" ? userResult.value : []);
      setFailed(false);
    } catch (error) {
      setMessage(describeAdminError(error));
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function mutate(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await load();
      setMessage(success);
      setFailed(false);
    } catch (error) {
      setMessage(describeAdminError(error));
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  if (revisions === null)
    return (
      <EditorStatus message={message ?? "Loading history…"} error={failed} />
    );
  return (
    <div className="flex flex-col gap-10">
      <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 border p-4">
        <div>
          <p className="font-semibold">Recovery ledger</p>
          <p className="text-text-muted text-sm">
            {revisions.length} recent revisions · {audits.length} recent audit
            events
          </p>
        </div>
        <EditorStatus message={message} error={failed} />
      </div>
      <RevisionHistory revisions={revisions} busy={busy} mutate={mutate} />
      <AuditHistory events={audits} />
      <UserEditor users={users} busy={busy} mutate={mutate} />
    </div>
  );
}

function RevisionHistory({
  revisions,
  busy,
  mutate,
}: {
  readonly revisions: readonly Revision[];
  readonly busy: boolean;
  readonly mutate: Mutate;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-5">
      <ResourceHeading
        title="Revision history"
        description="Preview the stored before/after snapshots. Restoring validates the historical content against today's contract and creates a new revision—history is never rewritten."
      />
      <div className="flex flex-col gap-3">
        {revisions.length === 0 ? (
          <p className="text-text-muted text-sm">
            No content revisions have been recorded.
          </p>
        ) : (
          revisions.map((revision) => (
            <details className="border-border border" key={revision.id}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4">
                <span>
                  <span className="font-semibold">
                    {revision.action.toLowerCase()} {revision.entityType}
                  </span>
                  <span className="text-text-muted ml-2 font-mono text-xs">
                    v{revision.entityVersion}
                  </span>
                </span>
                <span className="text-text-muted text-xs">
                  {revision.actor?.displayName ?? "Unknown actor"} ·{" "}
                  {formatUtc(revision.createdAt)}
                </span>
              </summary>
              <div className="border-border grid gap-4 border-t p-4 lg:grid-cols-2">
                <Snapshot title="Before" value={revision.before} />
                <Snapshot title="After" value={revision.after} />
                <div className="lg:col-span-2">
                  <button
                    type="button"
                    disabled={busy || revision.after === null}
                    className="border-border border px-4 py-2 text-sm disabled:opacity-50"
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Restore ${revision.entityType} to revision v${revision.entityVersion}? This creates a new revision.`
                        )
                      )
                        return;
                      void mutate(
                        () =>
                          adminRequest(
                            `/admin/revisions/${revision.id}/restore`,
                            {
                              method: "POST",
                              mutation: true,
                              body: { confirm: true },
                            }
                          ),
                        "Revision restored as a new validated change."
                      );
                    }}
                  >
                    Restore this version
                  </button>
                </div>
              </div>
            </details>
          ))
        )}
      </div>
    </section>
  );
}
function Snapshot({
  title,
  value,
}: {
  readonly title: string;
  readonly value: unknown;
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      <pre className="bg-secondary max-h-72 overflow-auto p-3 text-xs whitespace-pre-wrap">
        {value === null ? "No snapshot" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function AuditHistory({
  events,
}: {
  readonly events: readonly Audit[];
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-5">
      <ResourceHeading
        title="Audit events"
        description="Append-only action categories, outcomes, actors, and safe metadata. Request fingerprints and credentials are never displayed."
      />
      {events.length === 0 ? (
        <p className="text-text-muted text-sm">
          No audit events are available for this role.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li
              className="border-border flex flex-wrap items-center justify-between gap-3 border p-3 text-sm"
              key={event.id}
            >
              <span>
                <span
                  className={
                    event.outcome === "SUCCESS" ? "text-success" : "text-danger"
                  }
                >
                  {event.outcome.toLowerCase()}
                </span>{" "}
                · {event.eventType}
                {event.targetType === null ? "" : ` · ${event.targetType}`}
              </span>
              <span className="text-text-muted text-xs">
                {event.actor?.displayName ?? "System"} ·{" "}
                {formatUtc(event.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function UserEditor({
  users,
  busy,
  mutate,
}: {
  readonly users: readonly User[];
  readonly busy: boolean;
  readonly mutate: Mutate;
}): React.JSX.Element {
  const [recoveryCodes, setRecoveryCodes] = useState<readonly string[] | null>(
    null
  );
  return (
    <section className="flex flex-col gap-5">
      <ResourceHeading
        title="Users and permissions"
        description="Owners may provision an editor or another owner. Ten recovery codes are shown once so the new account can establish its first session and enrol a passkey."
      />
      {users.length === 0 ? (
        <p className="text-text-muted text-sm">
          User management is available only to an owner with recent
          authentication.
        </p>
      ) : (
        <>
          <form
            className="border-border grid gap-3 border p-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void mutate(async () => {
                const result = await adminRequest<{
                  readonly recoveryCodes: readonly string[];
                }>("/admin/users", {
                  method: "POST",
                  mutation: true,
                  body: {
                    email: text(form, "email"),
                    displayName: text(form, "displayName"),
                    role: text(form, "role"),
                    password: String(form.get("password") ?? ""),
                  },
                });
                setRecoveryCodes(result.recoveryCodes);
              }, "User created. Save the one-time recovery codes now.");
            }}
          >
            <h4 className="font-semibold md:col-span-2">Provision user</h4>
            <Field label="Email">
              <input
                className={inputClass}
                name="email"
                type="email"
                required
              />
            </Field>
            <Field label="Display name">
              <input className={inputClass} name="displayName" required />
            </Field>
            <Field label="Role">
              <select className={inputClass} name="role" defaultValue="EDITOR">
                <option value="EDITOR">Editor</option>
                <option value="OWNER">Owner</option>
              </select>
            </Field>
            <Field
              label="Initial password"
              hint="Share it separately from the recovery code."
            >
              <input
                className={inputClass}
                name="password"
                type="password"
                minLength={14}
                required
                autoComplete="new-password"
              />
            </Field>
            <div className="md:col-span-2">
              <SaveButton busy={busy}>Create user</SaveButton>
            </div>
          </form>
          {recoveryCodes === null ? null : (
            <aside className="border-danger border p-4" role="status">
              <h4 className="font-semibold">Recovery codes — shown once</h4>
              <p className="text-text-muted mt-1 text-sm">
                Store these securely before leaving this view. Only keyed hashes
                are retained.
              </p>
              <ul className="mt-3 grid gap-2 font-mono text-sm sm:grid-cols-2">
                {recoveryCodes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
            </aside>
          )}
          {users.map((user) => (
            <form
              className="border-border grid gap-3 border p-4 md:grid-cols-3"
              key={user.id}
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void mutate(
                  () =>
                    adminRequest(`/admin/users/${user.id}`, {
                      method: "PATCH",
                      mutation: true,
                      ifMatch: user.version,
                      body: {
                        displayName: text(form, "displayName"),
                        role: text(form, "role"),
                        status: text(form, "status"),
                      },
                    }),
                  "User access updated and active sessions revoked when required."
                );
              }}
            >
              <div className="md:col-span-3">
                <span className="font-semibold">{user.email}</span>
                <p className="text-text-muted text-xs">
                  Created {formatUtc(user.createdAt)} · Last login{" "}
                  {user.lastLoginAt === null
                    ? "never"
                    : formatUtc(user.lastLoginAt)}
                </p>
              </div>
              <Field label="Display name">
                <input
                  className={inputClass}
                  name="displayName"
                  required
                  defaultValue={user.displayName}
                />
              </Field>
              <Field label="Role">
                <select
                  className={inputClass}
                  name="role"
                  defaultValue={user.role}
                >
                  <option value="OWNER">Owner</option>
                  <option value="EDITOR">Editor</option>
                </select>
              </Field>
              <Field label="Status">
                <select
                  className={inputClass}
                  name="status"
                  defaultValue={user.status}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="LOCKED">Locked</option>
                  <option value="DISABLED">Disabled</option>
                </select>
              </Field>
              <div className="md:col-span-3">
                <SaveButton busy={busy}>Update access</SaveButton>
              </div>
            </form>
          ))}
        </>
      )}
    </section>
  );
}

type Mutate = (
  action: () => Promise<unknown>,
  success: string
) => Promise<void>;
function text(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}
