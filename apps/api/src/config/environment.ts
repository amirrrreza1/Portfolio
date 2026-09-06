import { z } from "zod";

function hasProtocol(value: string, protocols: readonly string[]): boolean {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const apiEnvironmentSchema = z.object({
  API_HOST: z.string().trim().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
  API_TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (value) => hasProtocol(value, ["postgres:", "postgresql:"]),
      "must be a PostgreSQL URL"
    ),
  SMTP_URL: z
    .string()
    .min(1)
    .refine(
      (value) => hasProtocol(value, ["smtp:", "smtps:"]),
      "must be an SMTP URL"
    ),
  CONTACT_FROM_EMAIL: z.email(),
  MINIO_ENDPOINT: z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) => hasProtocol(value, ["http:", "https:"]),
      "must be an HTTP(S) URL"
    ),
  MINIO_REGION: z.string().trim().min(1),
  MINIO_BUCKET: z
    .string()
    .trim()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/),
  MINIO_ACCESS_KEY_ID: z.string().min(1),
  MINIO_SECRET_ACCESS_KEY: z.string().min(1),
  MINIO_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),

  /**
   * Independent 32-byte secrets. They are separate values rather than one
   * because a single secret means a token minted for one purpose verifies for
   * another, and `assertSecrets` in `@portfolio/auth-core` refuses equal ones.
   */
  SESSION_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  RECOVERY_SECRET: z.string().min(32),

  /**
   * The WebAuthn relying party. A passkey is bound to these values at
   * enrolment, so a change invalidates every registered credential — they are
   * required configuration rather than something derived at request time from
   * a header an attacker controls.
   */
  WEBAUTHN_RP_ID: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9.-]+$/, "must be a bare hostname"),
  WEBAUTHN_RP_NAME: z.string().trim().min(1).max(120),
  WEBAUTHN_ORIGIN: z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) => hasProtocol(value, ["http:", "https:"]),
      "must be an HTTP(S) origin"
    ),
});

export type ApiEnvironment = {
  readonly host: string;
  readonly port: number;
  readonly proxyHops: number;
  readonly databaseUrl: string;
  readonly smtpUrl: string;
  readonly contactFromEmail: string;
  readonly media: {
    readonly endpoint: string;
    readonly region: string;
    readonly bucket: string;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly forcePathStyle: boolean;
  };
  readonly auth: {
    readonly sessionSecret: string;
    readonly csrfSecret: string;
    readonly recoverySecret: string;
    readonly rpId: string;
    readonly rpName: string;
    readonly origin: string;
  };
};

/**
 * Validate every configuration value used by the API before Nest constructs
 * providers or opens a listener. Error messages identify invalid keys but
 * deliberately never echo credential-bearing values.
 */
export function parseApiEnvironment(
  environment: Readonly<Record<string, string | undefined>>
): ApiEnvironment {
  const result = apiEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    const issues = result.error.issues
      .map(
        (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`
      )
      .join("; ");
    throw new Error(`Invalid API environment: ${issues}`);
  }

  return {
    host: result.data.API_HOST,
    port: result.data.API_PORT,
    proxyHops: result.data.API_TRUST_PROXY_HOPS,
    databaseUrl: result.data.DATABASE_URL,
    smtpUrl: result.data.SMTP_URL,
    contactFromEmail: result.data.CONTACT_FROM_EMAIL,
    media: {
      endpoint: result.data.MINIO_ENDPOINT,
      region: result.data.MINIO_REGION,
      bucket: result.data.MINIO_BUCKET,
      accessKeyId: result.data.MINIO_ACCESS_KEY_ID,
      secretAccessKey: result.data.MINIO_SECRET_ACCESS_KEY,
      forcePathStyle: result.data.MINIO_FORCE_PATH_STYLE,
    },
    auth: {
      sessionSecret: result.data.SESSION_SECRET,
      csrfSecret: result.data.CSRF_SECRET,
      recoverySecret: result.data.RECOVERY_SECRET,
      rpId: result.data.WEBAUTHN_RP_ID,
      rpName: result.data.WEBAUTHN_RP_NAME,
      origin: result.data.WEBAUTHN_ORIGIN,
    },
  };
}
