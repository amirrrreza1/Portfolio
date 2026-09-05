import { describe, expect, it, vi } from "vitest";

import {
  ContactSubmissionService,
  type ContactDelivery,
  type ContactMessageStore,
} from "../src/modules/contact/contact.service.js";

const submission = {
  name: "A Visitor",
  email: "visitor@example.com",
  message: "A message long enough to be valid.",
  company: "",
  startedAt: 1_000,
};

function createFixture() {
  const store: ContactMessageStore = {
    getSettings: vi.fn().mockResolvedValue({
      enabled: true,
      recipientEmail: "owner@example.com",
      retentionDays: 90,
    }),
    createPending: vi.fn().mockResolvedValue("message-1"),
    markSent: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };
  const delivery: ContactDelivery = {
    send: vi.fn().mockResolvedValue("smtp-id"),
  };
  const now = vi.fn(() => new Date("2026-08-10T00:00:05Z"));

  return {
    store,
    delivery,
    service: new ContactSubmissionService(store, delivery, now),
  };
}

describe("ContactSubmissionService", () => {
  it("persists and records a successful SMTP delivery", async () => {
    const { service, store, delivery } = createFixture();

    await service.submit(submission, "client-key");

    expect(store.createPending).toHaveBeenCalledOnce();
    expect(delivery.send).toHaveBeenCalledWith("owner@example.com", submission);
    expect(store.markSent).toHaveBeenCalledWith("message-1", "smtp-id");
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it("silently suppresses honeypot submissions", async () => {
    const { service, store, delivery } = createFixture();

    await service.submit(
      { ...submission, company: "Bot Company" },
      "client-key"
    );

    expect(store.getSettings).not.toHaveBeenCalled();
    expect(delivery.send).not.toHaveBeenCalled();
  });

  it("retains a failed delivery without exposing it to the sender", async () => {
    const { service, store, delivery } = createFixture();
    vi.mocked(delivery.send).mockRejectedValueOnce(
      new Error("SMTP unavailable")
    );

    await expect(
      service.submit(submission, "client-key")
    ).resolves.toBeUndefined();

    expect(store.markFailed).toHaveBeenCalledWith("message-1", {
      code: "smtp_delivery_failed",
      nextAttemptAt: new Date("2026-08-10T00:05:05.000Z"),
    });
  });
});
