import { describe, expect, it } from "vitest";

import { parseApiEnvironment } from "../src/config/environment.js";

const validEnvironment = {
  DATABASE_URL: "postgresql://portfolio:secret@127.0.0.1:5432/portfolio",
  SMTP_URL: "smtps://mailer:secret@smtp.example.com:465",
  CONTACT_FROM_EMAIL: "portfolio@example.com",
  MINIO_ENDPOINT: "http://127.0.0.1:9000",
  MINIO_REGION: "us-east-1",
  MINIO_BUCKET: "portfolio-media",
  MINIO_ACCESS_KEY_ID: "local-access-key",
  MINIO_SECRET_ACCESS_KEY: "local-secret-key",
  MINIO_FORCE_PATH_STYLE: "true",
};

describe("API environment", () => {
  it("applies safe listener defaults and returns validated configuration", () => {
    expect(parseApiEnvironment(validEnvironment)).toEqual({
      host: "0.0.0.0",
      port: 4_000,
      databaseUrl: validEnvironment.DATABASE_URL,
      smtpUrl: validEnvironment.SMTP_URL,
      contactFromEmail: validEnvironment.CONTACT_FROM_EMAIL,
      media: {
        endpoint: validEnvironment.MINIO_ENDPOINT,
        region: validEnvironment.MINIO_REGION,
        bucket: validEnvironment.MINIO_BUCKET,
        accessKeyId: validEnvironment.MINIO_ACCESS_KEY_ID,
        secretAccessKey: validEnvironment.MINIO_SECRET_ACCESS_KEY,
        forcePathStyle: true,
      },
    });
  });

  it("accepts explicit listener configuration", () => {
    expect(
      parseApiEnvironment({
        ...validEnvironment,
        API_HOST: "127.0.0.1",
        API_PORT: "4100",
      })
    ).toMatchObject({ host: "127.0.0.1", port: 4_100 });
  });

  it.each([
    [{ ...validEnvironment, API_PORT: "0" }, "API_PORT"],
    [{ ...validEnvironment, API_PORT: "70000" }, "API_PORT"],
    [
      { ...validEnvironment, DATABASE_URL: "mysql://root:secret@db/app" },
      "DATABASE_URL",
    ],
    [{ ...validEnvironment, SMTP_URL: "https://smtp.example.com" }, "SMTP_URL"],
    [
      { ...validEnvironment, CONTACT_FROM_EMAIL: "not-an-email" },
      "CONTACT_FROM_EMAIL",
    ],
    [
      { ...validEnvironment, MINIO_ENDPOINT: "ftp://minio.example.com" },
      "MINIO_ENDPOINT",
    ],
    [{ ...validEnvironment, MINIO_BUCKET: "UPPERCASE" }, "MINIO_BUCKET"],
    [
      { ...validEnvironment, MINIO_FORCE_PATH_STYLE: "sometimes" },
      "MINIO_FORCE_PATH_STYLE",
    ],
  ])("rejects invalid %s configuration", (environment, expectedKey) => {
    expect(() => parseApiEnvironment(environment)).toThrow(expectedKey);
  });

  it("does not include secret values in validation errors", () => {
    const invalidDatabaseUrl = "not-a-url-with-super-secret-password";

    expect(() =>
      parseApiEnvironment({
        ...validEnvironment,
        DATABASE_URL: invalidDatabaseUrl,
      })
    ).toThrowError(expect.not.stringContaining(invalidDatabaseUrl));
  });
});
