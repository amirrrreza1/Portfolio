import { Module } from "@nestjs/common";

import { AuthModule } from "./modules/auth/auth.module.js";
import { AdminModule } from "./modules/admin/admin.module.js";
import { BlogModule } from "./modules/blog/blog.module.js";
import { ContactModule } from "./modules/contact/contact.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { PublicModule } from "./modules/public/public.module.js";

@Module({
  imports: [
    HealthModule,
    AuthModule,
    ContactModule,
    PublicModule,
    AdminModule,
    BlogModule,
  ],
})
export class AppModule {}
