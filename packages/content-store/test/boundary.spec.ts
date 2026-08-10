import { createHmac, generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  assertContentPath,
  authenticateGitHubWebhook,
  createFetchGitContentTransport,
  GitHubAppTokenProvider,
  ContentConflictError,
  ContentStoreValidationError,
  createGitHubInstallationToken,
  GitHubContentStore,
  InMemoryWebhookDeliveryStore,
  loadContentStoreRuntimeConfig,
  synchronizeGitFile,
  reconcileGitCommit,
  translationContentPath,
  verifyGitHubWebhookSignature,
} from "../src/index.js";

describe("content-store boundary", () => {
  it("constructs only canonical article paths and rejects escape attempts", () => {
    const path = translationContentPath("clx8k2p9q0000abcd1234efg", "en");
    expect(path).toBe("content/blog/clx8k2p9q0000abcd1234efg/en.md");
    expect(() =>
      assertContentPath("content/../.github/workflows/ci.yml")
    ).toThrow(ContentStoreValidationError);
    expect(() => assertContentPath("content\\blog\\post\\en.md")).toThrow(
      ContentStoreValidationError
    );
  });

  it("writes only through the content branch and turns a stale SHA into a conflict", async () => {
    const calls: unknown[] = [];
    const store = new GitHubContentStore(
      { repository: "owner/repository", branch: "content", token: "app-token" },
      {
        request: async (request) => {
          calls.push(request);
          return { status: 201, body: { content: { sha: "a".repeat(40) } } };
        },
      }
    );
    await expect(
      store.write({
        path: "content/blog/clx8k2p9q0000abcd1234efg/en.md",
        bytes: Buffer.from("body"),
        expectedSha: null,
      })
    ).resolves.toBe("a".repeat(40));
    expect(calls).toMatchObject([
      {
        body: {
          branch: "content",
          message: "chore(content): update indexed article",
        },
      },
    ]);

    const stale = new GitHubContentStore(
      { repository: "owner/repository", branch: "content", token: "app-token" },
      { request: async () => ({ status: 409, body: {} }) }
    );
    await expect(
      stale.write({
        path: "content/blog/clx8k2p9q0000abcd1234efg/en.md",
        bytes: Buffer.from("body"),
        expectedSha: "b".repeat(40),
      })
    ).rejects.toThrow(ContentConflictError);
  });

  it("accepts only a constant-time-valid GitHub raw-body signature", () => {
    const body = Buffer.from('{"ref":"refs/heads/content"}');
    const signature =
      "sha256=" +
      createHmac("sha256", "webhook-secret").update(body).digest("hex");
    expect(
      verifyGitHubWebhookSignature("webhook-secret", body, signature)
    ).toBe(true);
    expect(
      verifyGitHubWebhookSignature(
        "webhook-secret",
        body,
        "sha256=" + "0".repeat(64)
      )
    ).toBe(false);
    expect(
      verifyGitHubWebhookSignature("webhook-secret", body, undefined)
    ).toBe(false);
  });

  it("rejects a replay only after the raw body signature authenticates", async () => {
    const body = Buffer.from('{"ref":"refs/heads/content"}');
    const signature =
      "sha256=" +
      createHmac("sha256", "webhook-secret").update(body).digest("hex");
    const deliveryStore = new InMemoryWebhookDeliveryStore();
    const input = {
      secret: "webhook-secret",
      rawBody: body,
      signature,
      deliveryId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      deliveryStore,
    };
    await expect(authenticateGitHubWebhook(input)).resolves.toBe(true);
    await expect(authenticateGitHubWebhook(input)).resolves.toBe(false);
  });

  it("exchanges a short-lived GitHub App JWT for an installation token", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const calls: Array<{ readonly headers: Readonly<Record<string, string>> }> =
      [];
    const result = await createGitHubInstallationToken(
      {
        appId: "123",
        installationId: "456",
        privateKeyPem: privateKey
          .export({ type: "pkcs8", format: "pem" })
          .toString(),
      },
      {
        request: async (request) => {
          calls.push(request);
          return {
            status: 201,
            body: {
              token: "installation-token",
              expires_at: "2030-01-01T00:00:00Z",
            },
          };
        },
      },
      new Date("2029-12-31T23:00:00Z")
    );
    expect(result.token).toBe("installation-token");
    expect(calls[0]?.headers.Authorization).toMatch(/^Bearer eyJ.+\..+\..+$/);
  });

  it("keeps installation tokens only in memory until their final minute", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    let requests = 0;
    const provider = new GitHubAppTokenProvider(
      {
        appId: "123",
        installationId: "456",
        privateKeyPem: privateKey
          .export({ type: "pkcs8", format: "pem" })
          .toString(),
      },
      {
        request: async () => {
          requests += 1;
          return {
            status: 201,
            body: {
              token: "installation-token",
              expires_at: "2030-01-01T00:00:00Z",
            },
          };
        },
      }
    );
    await provider.token(new Date("2029-12-31T23:00:00Z"));
    await provider.token(new Date("2029-12-31T23:30:00Z"));
    expect(requests).toBe(1);
  });

  it("loads only the fixed GitHub/content runtime configuration", async () => {
    const config = await loadContentStoreRuntimeConfig({
      environment: {
        CONTENT_GIT_PROVIDER: "github",
        CONTENT_GIT_REPO: "owner/repository",
        CONTENT_GIT_BRANCH: "content",
        CONTENT_GIT_CONTENT_PREFIX: "content/",
        CONTENT_GIT_APP_ID: "123",
        CONTENT_GIT_INSTALLATION_ID: "456",
        CONTENT_GIT_PRIVATE_KEY_PATH: "/run/secrets/key.pem",
        CONTENT_GIT_WEBHOOK_SECRET: "independent-webhook-secret",
      },
      readPrivateKey: async () => "private key",
    });
    expect(config).toMatchObject({
      repository: "owner/repository",
      branch: "content",
    });
  });

  it("serializes transport bodies and parses a Git JSON response", async () => {
    const transport = createFetchGitContentTransport(async (_url, init) => {
      expect(init?.body).toBe('{"value":"ok"}');
      return new Response(JSON.stringify({ sha: "a".repeat(40) }), {
        status: 200,
      });
    });
    await expect(
      transport.request({
        method: "POST",
        url: "https://example.test",
        headers: {},
        body: { value: "ok" },
      })
    ).resolves.toEqual({ status: 200, body: { sha: "a".repeat(40) } });
  });

  it("re-reads, validates, renders, and idempotently applies Git content", async () => {
    const source = [
      "---",
      "schemaVersion: 1",
      "postId: clx8k2p9q0000abcd1234efg",
      "locale: en",
      "title: Safe Markdown",
      "slug: safe-markdown",
      "excerpt: A compact description for the test article.",
      "status: draft",
      "---",
      "## Heading",
    ].join("\n");
    const applied: unknown[] = [];
    const store = new GitHubContentStore(
      { repository: "owner/repository", branch: "content", token: "app-token" },
      {
        request: async () => ({
          status: 200,
          body: {
            content: Buffer.from(source).toString("base64"),
            sha: "c".repeat(40),
          },
        }),
      }
    );
    await expect(
      synchronizeGitFile({
        store,
        commitSha: "d".repeat(40),
        path: "content/blog/clx8k2p9q0000abcd1234efg/en.md",
        index: {
          apply: async (value) => {
            applied.push(value);
            return "applied";
          },
          recordFailure: async () => undefined,
        },
      })
    ).resolves.toBe("applied");
    expect(applied).toMatchObject([
      { title: "Safe Markdown", blobSha: "c".repeat(40) },
    ]);
  });

  it("reconciles only canonical article files discovered from the Git tree", async () => {
    const source = [
      "---",
      "schemaVersion: 1",
      "postId: clx8k2p9q0000abcd1234efg",
      "locale: en",
      "title: Safe Markdown",
      "slug: safe-markdown",
      "excerpt: A compact description for the test article.",
      "status: draft",
      "---",
      "## Heading",
    ].join("\n");
    const store = new GitHubContentStore(
      { repository: "owner/repository", branch: "content", token: "app-token" },
      {
        request: async (request) =>
          request.url.includes("/git/trees/")
            ? {
                status: 200,
                body: {
                  tree: [
                    {
                      type: "blob",
                      path: "content/blog/clx8k2p9q0000abcd1234efg/en.md",
                    },
                    { type: "blob", path: ".github/workflows/ci.yml" },
                  ],
                },
              }
            : {
                status: 200,
                body: {
                  content: Buffer.from(source).toString("base64"),
                  sha: "c".repeat(40),
                },
              },
      }
    );
    await expect(
      reconcileGitCommit({
        store,
        commitSha: "d".repeat(40),
        index: {
          apply: async () => "already-applied",
          recordFailure: async () => undefined,
        },
      })
    ).resolves.toEqual({
      applied: 0,
      alreadyApplied: 1,
      missing: 0,
      invalid: 0,
    });
  });
});
