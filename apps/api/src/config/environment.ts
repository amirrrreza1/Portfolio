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
});

export type ApiEnvironment = {
  readonly host: string;
  readonly port: number;
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
  };
}
