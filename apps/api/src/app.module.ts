import { Module } from "@nestjs/common";

import { AuthModule } from "./modules/auth/auth.module.js";
import { ContactModule } from "./modules/contact/contact.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { PublicModule } from "./modules/public/public.module.js";

@Module({
  imports: [HealthModule, AuthModule, ContactModule, PublicModule],
})
export class AppModule {}
