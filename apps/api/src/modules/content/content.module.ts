import { Module } from "@nestjs/common";
import {
  createContentJobStore,
  createPrismaSqlExecutor,
  createWebhookDeliveryStore,
  getDatabaseClient,
} from "@portfolio/database";

import {
  CONTENT_WEBHOOK_SERVICE,
  ContentWebhookController,
} from "./content-webhook.controller.js";
import {
  createContentWebhookService,
  createUnavailableContentWebhookService,
  type ContentWebhookService,
} from "./content-webhook.service.js";
import { loadContentRuntime } from "./content.runtime.js";

@Module({
  controllers: [ContentWebhookController],
  providers: [
    {
      provide: CONTENT_WEBHOOK_SERVICE,
      useFactory: async (): Promise<ContentWebhookService> => {
        const runtime = await loadContentRuntime();
        if (runtime.state !== "configured") {
          // Deliberately not a boot failure. The public site does not depend on
          // the content store, and taking it down over an unprovisioned feature
          // is a worse outage than the missing feature.
          return createUnavailableContentWebhookService();
        }

        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) throw new Error("DATABASE_URL is required.");
        const database = getDatabaseClient({ connectionString });

        return createContentWebhookService({
          webhookSecret: runtime.config.webhookSecret,
          deliveries: createWebhookDeliveryStore(database),
          jobs: createContentJobStore(createPrismaSqlExecutor(database)),
        });
      },
    },
  ],
})
export class ContentModule {}
