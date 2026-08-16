import { Module } from "@nestjs/common";

import { ContactModule } from "./modules/contact/contact.module.js";
import { ContentModule } from "./modules/content/content.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { PublicModule } from "./modules/public/public.module.js";

@Module({
  imports: [HealthModule, ContactModule, ContentModule, PublicModule],
})
export class AppModule {}
