import type { Database } from "@portfolio/database";
import { describe, expect, it, vi } from "vitest";

import {
  AdminInvariantError,
  AdminPortfolioService,
} from "../src/modules/admin/admin.service.js";

function serviceWithSection(key: string): AdminPortfolioService {
  const transaction = {
    pageSection: {
      findUnique: vi.fn().mockResolvedValue({
        id: "herosection0000000000000",
        key,
      }),
    },
  };
  const database = {
    $transaction: vi.fn(async (run: (tx: typeof transaction) => unknown) =>
      run(transaction)
    ),
  } as unknown as Database;

  return new AdminPortfolioService(database);
}

describe("fixed homepage structure admin boundary", () => {
  it("rejects section setting changes for every section", async () => {
    await expect(
      serviceWithSection("about").updateSection(
        "adminuser0000000000000000",
        "herosection0000000000000",
        1,
        {
          key: "about",
          content: {},
          enabled: false,
          sortOrder: 10,
        }
      )
    ).rejects.toBeInstanceOf(AdminInvariantError);
  });

  it("rejects fixed-section translation changes", async () => {
    await expect(
      serviceWithSection("contact").updateSectionTranslation(
        "adminuser0000000000000000",
        "herosection0000000000000",
        "en",
        1,
        {
          key: "contact",
          translation: {
            title: "Get in Touch",
            content: {
              nameLabel: "Changed",
              namePlaceholder: "Changed",
              emailLabel: "Changed",
              emailPlaceholder: "Changed",
              messageLabel: "Changed",
              messagePlaceholder: "Changed",
              sendingLabel: "Changed",
              submitLabel: "Changed",
              successMessage: "Changed",
              failureMessage: "Changed",
              invalidNameMessage: "Changed",
              invalidEmailMessage: "Changed",
              invalidMessageMessage: "Changed",
            },
          },
        }
      )
    ).rejects.toBeInstanceOf(AdminInvariantError);
  });
});
