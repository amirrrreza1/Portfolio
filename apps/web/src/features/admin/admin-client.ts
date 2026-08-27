import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@portfolio/contracts/auth";

/**
 * The browser's half of the admin API conversation.
 *
 * Everything here goes to `NEXT_PUBLIC_API_BASE_URL`, a **same-origin** path
 * that `next.config.ts` rewrites to the API. That is not a convenience: the
 * session cookie is `SameSite=Strict` and `__Host-`-prefixed, so a
 * cross-origin call could not carry it even if CORS allowed one, and the API's
 * real origin never has to appear in a client bundle.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

/** The closed error-code list from API_SPEC.md §2. */
export type AdminErrorCode =
  | "VALIDATION_FAILED"
  | "AUTHENTICATION_REQUIRED"
  | "AUTHENTICATION_FAILED"
  | "CSRF_FAILED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR";

export class AdminRequestError extends Error {
  public constructor(
    public readonly code: AdminErrorCode,
    public readonly status: number,
    public readonly fields: Record<string, readonly string[]> = {}
  ) {
    super(code);
    this.name = "AdminRequestError";
  }

  /** True when the server is asking for a fresh proof of identity. */
  public get needsReauthentication(): boolean {
    return this.code === "FORBIDDEN" && "reauthentication" in this.fields;
  }

  public get retryAfterSeconds(): number | null {
    const raw = this.fields.retryAfterSeconds?.[0];
    if (raw === undefined) return null;
    const seconds = Number(raw);
    return Number.isFinite(seconds) ? seconds : null;
  }
}

/**
 * The CSRF token is deliberately readable by script.
 *
 * It has to be, because the defence is that it travels in a *header* — and a
 * header is exactly what a cross-site form or image cannot set. The session
 * cookie is the credential and stays `HttpOnly`; this one is a value the page
 * has to be able to echo.
 */
function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const names = [CSRF_COOKIE_NAME, CSRF_COOKIE_NAME.replace(/^__Host-/, "")];
  for (const entry of document.cookie.split(";")) {
    const [name, ...rest] = entry.trim().split("=");
    if (name !== undefined && names.includes(name)) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

interface RequestOptions {
  readonly method?: "GET" | "POST" | "DELETE";
  readonly body?: unknown;
  /**
   * Whether this call is a state change that needs the CSRF header. Named
   * rather than inferred from the method, so that adding a mutating `GET` (an
   * anti-pattern the API does not have) cannot silently skip the token.
   */
  readonly mutation?: boolean;
}

export async function adminRequest<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (options.mutation === true) {
    const token = readCsrfToken();
    // Send the request without it rather than failing here: the server's
    // refusal is the authoritative one, and a client that decides for itself
    // that a request "would have failed" reports a different error than the
    // one that actually applies.
    if (token !== null) headers[CSRF_HEADER_NAME] = token;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      // Same-origin only. `include` would be a request to send credentials
      // cross-origin, which is precisely what this deployment disables.
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new AdminRequestError("NETWORK_ERROR", 0);
  }

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new AdminRequestError(
      errorCodeOf(payload) ?? "INTERNAL_ERROR",
      response.status,
      fieldsOf(payload)
    );
  }

  return (payload as { data: T }).data;
}

function errorCodeOf(payload: unknown): AdminErrorCode | null {
  if (typeof payload !== "object" || payload === null) return null;
  const error = (payload as { error?: { code?: unknown } }).error;
  return typeof error?.code === "string"
    ? (error.code as AdminErrorCode)
    : null;
}

function fieldsOf(payload: unknown): Record<string, readonly string[]> {
  if (typeof payload !== "object" || payload === null) return {};
  const fields = (payload as { error?: { fields?: unknown } }).error?.fields;
  return typeof fields === "object" && fields !== null
    ? (fields as Record<string, readonly string[]>)
    : {};
}

/**
 * What the panel shows for each refusal.
 *
 * The API's own messages are deliberately uniform — an authentication failure
 * says nothing about which half failed, because a distinguishable answer is a
 * user-enumeration oracle. These strings preserve that: there is exactly one
 * message for "that did not work", and it does not change depending on whether
 * the email, the password, or the passkey was wrong.
 */
export function describeAdminError(error: unknown): string {
  if (!(error instanceof AdminRequestError)) {
    return "Something went wrong. Try again.";
  }
  switch (error.code) {
    case "AUTHENTICATION_FAILED":
      return "Those credentials were not accepted.";
    case "AUTHENTICATION_REQUIRED":
      return "Your session has ended. Sign in again.";
    case "RATE_LIMITED": {
      const seconds = error.retryAfterSeconds;
      return seconds === null
        ? "Too many attempts. Wait before trying again."
        : `Too many attempts. Wait ${seconds} seconds before trying again.`;
    }
    case "FORBIDDEN":
      return error.needsReauthentication
        ? "That action needs a fresh sign-in."
        : "You are not allowed to do that.";
    case "CSRF_FAILED":
      return "That request could not be verified. Reload and try again.";
    case "VALIDATION_FAILED":
      return "Check the values you entered.";
    case "NETWORK_ERROR":
      return "The admin API could not be reached.";
    default:
      return "Something went wrong. Try again.";
  }
}
