import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { BLOG_ADMIN_SERVICE, BlogAdminController } from "./blog.controller.js";
import { createBlogAdminService } from "./blog.runtime.js";

@Module({
  imports: [AuthModule],
  controllers: [BlogAdminController],
  providers: [
    { provide: BLOG_ADMIN_SERVICE, useFactory: createBlogAdminService },
  ],
})
export class BlogModule {}
