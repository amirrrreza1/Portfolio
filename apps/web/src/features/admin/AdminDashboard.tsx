"use client";

import { useEffect, useState } from "react";

import { adminRequest, describeAdminError } from "./admin-client";
import { formatUtc } from "./format";

type Dashboard = {
  readonly drafts: number;
  readonly scheduled: number;
  readonly contactMessages: number;
  readonly recentEdits: readonly {
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    createdAt: string;
    actor: { displayName: string } | null;
  }[];
  readonly securityEvents: readonly {
    id: string;
    eventType: string;
    targetType: string | null;
    outcome: string;
    createdAt: string;
  }[];
  readonly delivery: {
    readonly invalidations: Record<string, number>;
    readonly publicationJobs: Record<string, number>;
    readonly contacts: Record<string, number>;
    readonly overdueContactRetries: number;
    readonly media: Record<
      string,
      { readonly count: number; readonly bytes: number }
    >;
  };
};

export default function AdminDashboard(): React.JSX.Element {
  const [state, setState] = useState<
    { data: Dashboard } | { error: string } | null
  >(null);
  useEffect(() => {
    void adminRequest<Dashboard>("/admin/dashboard")
      .then((data) => setState({ data }))
      .catch((error: unknown) =>
        setState({ error: describeAdminError(error) })
      );
  }, []);
  if (state === null)
    return (
      <p className="text-text-muted text-sm" role="status">
        Loading content health…
      </p>
    );
  if ("error" in state)
    return (
      <p className="text-danger text-sm" role="alert">
        {state.error}
      </p>
    );
  const { data } = state;
  return (
    <div className="flex flex-col gap-6" data-testid="admin-dashboard">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="Drafts" value={data.drafts} />
        <Metric label="Scheduled" value={data.scheduled} />
        <Metric
          label="Retained contact messages"
          value={data.contactMessages}
        />
      </dl>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <EventList
          title="Recent edits"
          empty="No edits have been recorded."
          items={data.recentEdits.map((event) => ({
            id: event.id,
            label: `${event.action.toLowerCase()} ${event.entityType} · ${event.actor?.displayName ?? "Unknown actor"}`,
            at: event.createdAt,
          }))}
        />
        <EventList
          title="Recent security failures"
          empty="No failed security events."
          items={data.securityEvents.map((event) => ({
            id: event.id,
            label: event.eventType,
            at: event.createdAt,
          }))}
        />
      </div>
      <p className="text-text-muted text-sm">
        Invalidations: {formatCounts(data.delivery.invalidations)} · Publication
        jobs: {formatCounts(data.delivery.publicationJobs)}
      </p>
      <p className="text-text-muted text-sm">
        Contact delivery: {formatCounts(data.delivery.contacts)} · Overdue or
        exhausted retries: {data.delivery.overdueContactRetries} · Media:{" "}
        {formatMedia(data.delivery.media)}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}): React.JSX.Element {
  return (
    <div className="border-border flex flex-col gap-1 border p-4">
      <dt className="text-text-muted text-sm">{label}</dt>
      <dd className="text-xl font-semibold">{value}</dd>
    </div>
  );
}
function EventList({
  title,
  empty,
  items,
}: {
  readonly title: string;
  readonly empty: string;
  readonly items: readonly { id: string; label: string; at: string }[];
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-base font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="text-text-muted text-sm">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li className="border-border border p-3 text-sm" key={item.id}>
              {item.label} ·{" "}
              <span className="text-text-muted">{formatUtc(item.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
function formatCounts(counts: Record<string, number>): string {
  const values = Object.entries(counts);
  return values.length === 0
    ? "none"
    : values.map(([key, value]) => `${key.toLowerCase()} ${value}`).join(", ");
}

function formatMedia(
  states: Record<string, { readonly count: number; readonly bytes: number }>
): string {
  const values = Object.entries(states);
  return values.length === 0
    ? "none"
    : values
        .map(
          ([key, value]) =>
            `${key.toLowerCase()} ${value.count} (${formatBytes(value.bytes)})`
        )
        .join(", ");
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 ** 2) return `${(bytes / 1_024).toFixed(1)} KiB`;
  return `${(bytes / 1_024 ** 2).toFixed(1)} MiB`;
}
