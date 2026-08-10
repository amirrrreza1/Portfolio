import { Module } from "@nestjs/common";

import { HealthController } from "./modules/health/health.controller.js";
import { ContactModule } from "./modules/contact/contact.module.js";

@Module({
  controllers: [HealthController],
  imports: [ContactModule],
})
export class AppModule {}
