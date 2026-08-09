import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";

import { AppModule } from "./app.module.js";
import { configureApplication } from "./configure-app.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false })
  );

  configureApplication(app);

  const port = Number.parseInt(process.env.API_PORT ?? "4000", 10);
  const host = process.env.API_HOST ?? "0.0.0.0";
  await app.listen(port, host);
}

void bootstrap();
