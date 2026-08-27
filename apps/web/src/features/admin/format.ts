/**
 * Timestamps in a security list are absolute UTC, never localized.
 *
 * Two reasons, and the second is the one that bites. An owner comparing a
 * session's last-seen time against an audit record or a server log needs the
 * same clock in both places, and "yesterday at 14:02" in an unstated zone is
 * not evidence of anything. And because these rows are server-rendered first
 * and hydrated second, a formatter that reads the local zone produces one
 * string on the server and a different one in the browser — a hydration
 * mismatch that React resolves by silently replacing the markup.
 */
const FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatUtc(isoTimestamp: string): string {
  const value = new Date(isoTimestamp);
  if (Number.isNaN(value.getTime())) return "unknown";
  return `${FORMATTER.format(value)} UTC`;
}
