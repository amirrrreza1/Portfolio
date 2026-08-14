import { Module } from "@nestjs/common";
import { getDatabaseClient } from "@portfolio/database";

import { parseApiEnvironment } from "../../config/environment.js";
import {
  PUBLIC_APPEARANCE_SERVICE,
  PublicAppearanceController,
} from "./public-appearance.controller.js";
import { PublicAppearanceService } from "./public-appearance.service.js";
import {
  PUBLIC_ARTICLES_SERVICE,
  PublicArticlesController,
} from "./public-articles.controller.js";
import { PublicArticlesService } from "./public-articles.service.js";
import {
  PUBLIC_HOME_SERVICE,
  PublicHomeController,
} from "./public-home.controller.js";
import { PublicHomeService } from "./public-home.service.js";
import { createPublicMediaReader } from "./public-media.reader.js";
import {
  PUBLIC_PROJECTS_SERVICE,
  PublicProjectsController,
} from "./public-projects.controller.js";
import { PublicProjectsService } from "./public-projects.service.js";
import {
  PUBLIC_SITE_SERVICE,
  PublicSiteController,
} from "./public-site.controller.js";
import { PublicSiteService } from "./public-site.service.js";

@Module({
  controllers: [
    PublicProjectsController,
    PublicSiteController,
    PublicAppearanceController,
    PublicHomeController,
    PublicArticlesController,
  ],
  providers: [
    {
      provide: PUBLIC_PROJECTS_SERVICE,
      useFactory: (): PublicProjectsService => {
        const environment = parseApiEnvironment(process.env);
        return new PublicProjectsService(
          getDatabaseClient({ connectionString: environment.databaseUrl }),
          createPublicMediaReader(environment.media)
        );
      },
    },
    {
      provide: PUBLIC_SITE_SERVICE,
      useFactory: (): PublicSiteService => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) throw new Error("DATABASE_URL is required.");
        return new PublicSiteService(getDatabaseClient({ connectionString }));
      },
    },
    {
      provide: PUBLIC_APPEARANCE_SERVICE,
      useFactory: (): PublicAppearanceService => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) throw new Error("DATABASE_URL is required.");
        return new PublicAppearanceService(
          getDatabaseClient({ connectionString })
        );
      },
    },
    {
      provide: PUBLIC_HOME_SERVICE,
      useFactory: (): PublicHomeService => {
        const environment = parseApiEnvironment(process.env);
        return new PublicHomeService(
          getDatabaseClient({ connectionString: environment.databaseUrl }),
          createPublicMediaReader(environment.media)
        );
      },
    },
    {
      provide: PUBLIC_ARTICLES_SERVICE,
      useFactory: (): PublicArticlesService => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) throw new Error("DATABASE_URL is required.");
        return new PublicArticlesService(
          getDatabaseClient({ connectionString })
        );
      },
    },
  ],
})
export class PublicModule {}
