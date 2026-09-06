import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";

import { AppModule } from "./app.module.js";
import { parseApiEnvironment } from "./config/environment.js";
import { APPLICATION_OPTIONS, configureApplication } from "./configure-app.js";

async function bootstrap(): Promise<void> {
  const environment = parseApiEnvironment(process.env);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      // Only deployment configuration may opt into forwarded client
      // addresses. The bounded hop count prevents an arbitrary X-Forwarded-For
      // value from bypassing the contact and authentication throttles.
      trustProxy: environment.proxyHops > 0 ? environment.proxyHops : false,
    }),
    APPLICATION_OPTIONS
  );

  configureApplication(app);

  await app.listen(environment.port, environment.host);
}

void bootstrap();
