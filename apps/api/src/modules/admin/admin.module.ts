import { Module } from "@nestjs/common";

import { AdminPortfolioController, ADMIN_PORTFOLIO_SERVICE } from "./admin.controller.js";
import { createAdminPortfolioService } from "./admin.runtime.js";

@Module({
  controllers: [AdminPortfolioController],
  providers: [{ provide: ADMIN_PORTFOLIO_SERVICE, useFactory: createAdminPortfolioService }],
})
export class AdminModule {}
