import type { WebhookDeliveryStore } from "@portfolio/content-store";

import type { Database } from "./client.js";

/** PostgreSQL-backed replay guard: the delivery ID primary key is the claim. */
export function createWebhookDeliveryStore(
  database: Database
): WebhookDeliveryStore {
  return {
    async claim(deliveryId, expiresAt) {
      try {
        await database.webhookDelivery.create({
          data: { deliveryId, expiresAt },
        });
        return true;
      } catch (error: any) {
        if (error?.code === "P2002") return false;
        throw error;
      }
    },
  };
}
