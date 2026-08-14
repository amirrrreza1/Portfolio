import { Module } from "@nestjs/common";

import { HealthController } from "./modules/health/health.controller.js";
import { ContactModule } from "./modules/contact/contact.module.js";
import { PublicModule } from "./modules/public/public.module.js";

@Module({
  controllers: [HealthController],
  imports: [ContactModule, PublicModule],
})
export class AppModule {}
