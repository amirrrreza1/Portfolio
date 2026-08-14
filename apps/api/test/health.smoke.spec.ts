import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { afterEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApplication } from "../src/configure-app.js";
import { CONTACT_SUBMISSION_SERVICE } from "../src/modules/contact/contact.controller.js";
import { PUBLIC_APPEARANCE_SERVICE } from "../src/modules/public/public-appearance.controller.js";
import { PUBLIC_ARTICLES_SERVICE } from "../src/modules/public/public-articles.controller.js";
import { PUBLIC_HOME_SERVICE } from "../src/modules/public/public-home.controller.js";
import { PUBLIC_PROJECTS_SERVICE } from "../src/modules/public/public-projects.controller.js";
import { PUBLIC_SITE_SERVICE } from "../src/modules/public/public-site.controller.js";

describe("API health smoke", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("serves the versioned health contract without leaking internals", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CONTACT_SUBMISSION_SERVICE)
      .useValue({ submit: async () => undefined })
      .overrideProvider(PUBLIC_PROJECTS_SERVICE)
      .useValue({ read: async () => undefined })
      .overrideProvider(PUBLIC_SITE_SERVICE)
      .useValue({ read: async () => undefined })
      .overrideProvider(PUBLIC_APPEARANCE_SERVICE)
      .useValue({ read: async () => undefined })
      .overrideProvider(PUBLIC_ARTICLES_SERVICE)
      .useValue({ list: async () => undefined, detail: async () => undefined })
      .overrideProvider(PUBLIC_HOME_SERVICE)
      .useValue({ read: async () => undefined })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false })
    );
    configureApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
