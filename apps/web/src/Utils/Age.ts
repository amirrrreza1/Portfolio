/**
 * Computes the owner's age from the server-only `BIRTH_DATE` value.
 *
 * This was previously `NEXT_PUBLIC_BIRTHDAY`, read inside a client component
 * and declared in no environment file — so a fresh checkout rendered "Hello,
 * I'm Amirreza Azarioun,  years old". Two separate problems, fixed together:
 *
 * 1. The `NEXT_PUBLIC_` prefix inlined a personal date of birth into the client
 *    bundle, where it is permanently readable, for a value the visitor only
 *    ever sees as a single derived integer.
 * 2. Computing it in the browser makes the rendered age depend on the visitor's
 *    clock and timezone, so the server HTML and the hydrated output could
 *    disagree by a year on a birthday.
 *
 * Both go away by computing on the server in UTC. Database mode now derives
 * age inside the API from `SiteSettings`; this helper remains only for the
 * isolated legacy rollback adapter and never enters the client graph.
 */

/** `YYYY-MM-DD`, validated rather than trusted, since it comes from the environment. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type AgeResult =
  | { readonly status: "ok"; readonly age: number }
  | { readonly status: "unset" }
  | { readonly status: "invalid"; readonly reason: string };

export function resolveAge(
  raw: string | undefined,
  now: Date = new Date()
): AgeResult {
  const value = raw?.trim();

  if (!value) return { status: "unset" };

  const match = ISO_DATE.exec(value);
  if (!match) {
    return {
      status: "invalid",
      reason: "BIRTH_DATE must be an ISO calendar date in YYYY-MM-DD form.",
    };
  }

  const [, year, month, day] = match.map(Number);
  const birth = new Date(Date.UTC(year, month - 1, day));

  // Rejects calendar-invalid dates such as 2000-02-30, which `Date.UTC` would
  // otherwise roll forward into March without complaint.
  if (
    birth.getUTCFullYear() !== year ||
    birth.getUTCMonth() !== month - 1 ||
    birth.getUTCDate() !== day
  ) {
    return {
      status: "invalid",
      reason: `BIRTH_DATE ${value} is not a real date.`,
    };
  }

  if (birth.getTime() > now.getTime()) {
    return { status: "invalid", reason: "BIRTH_DATE is in the future." };
  }

  let age = now.getUTCFullYear() - year;
  const beforeBirthday =
    now.getUTCMonth() < month - 1 ||
    (now.getUTCMonth() === month - 1 && now.getUTCDate() < day);

  if (beforeBirthday) age -= 1;

  return { status: "ok", age };
}

/**
 * Returns the age to render, or `null` when it cannot be determined.
 *
 * An invalid value is logged and treated as absent: a malformed environment
 * variable should not take down the home page, but it should also not fail
 * silently.
 */
export function getAge(): number | null {
  const result = resolveAge(process.env.BIRTH_DATE);

  if (result.status === "invalid") {
    console.warn(`[about] ${result.reason} Rendering without an age.`);
  }

  return result.status === "ok" ? result.age : null;
}
