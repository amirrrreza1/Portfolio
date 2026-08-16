import {
  Controller,
  Inject,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { buildErrorBody } from "@portfolio/contracts/common";
import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { ContentWebhookService } from "./content-webhook.service.js";

export const CONTENT_WEBHOOK_SERVICE = Symbol("CONTENT_WEBHOOK_SERVICE");

/** Populated by Nest's `rawBody` option; see APPLICATION_OPTIONS. */
interface RawBodyRequest extends FastifyRequest {
  readonly rawBody?: Buffer;
}

@Controller("content")
export class ContentWebhookController {
  public constructor(
    @Inject(CONTENT_WEBHOOK_SERVICE)
    private readonly webhook: ContentWebhookService
  ) {}

  /**
   * The Git host's push notification.
   *
   * This endpoint does exactly one thing: authenticate the delivery and put a
   * job on the queue. It never reads the payload as article data
   * (CONTENT_PIPELINE.md §7) and never reconciles inline — a webhook handler
   * that does real work is one whose retries are the Git host's retry policy
   * rather than ours, and whose failures are invisible.
   */
  @Post("webhook")
  async receive(
    @Req() request: RawBodyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<{
    data: { status: "accepted" | "duplicate" };
    meta: { requestId: string };
  }> {
    const requestId = randomUUID();

    if (!this.webhook.available()) {
      throw new ServiceUnavailableException(
        buildErrorBody("CONTENT_STORE_UNAVAILABLE", requestId)
      );
    }

    // Signature verification is over the raw bytes. A re-serialized body is a
    // different byte string, so verifying the parsed object would reject every
    // legitimate delivery and, worse, could be "fixed" by not verifying.
    const rawBody = request.rawBody;
    if (rawBody === undefined) {
      throw new UnauthorizedException(
        buildErrorBody("AUTHENTICATION_FAILED", requestId)
      );
    }

    const outcome = await this.webhook.receive({
      rawBody,
      signature: header(request, "x-hub-signature-256"),
      deliveryId: header(request, "x-github-delivery"),
    });

    if (outcome === "rejected") {
      // AUTHENTICATION_FAILED rather than a webhook-specific code: the delivery
      // failed to authenticate, and the response deliberately says no more than
      // that. Telling a caller whether it was the signature, the secret, or a
      // missing delivery id hands them a verification oracle.
      throw new UnauthorizedException(
        buildErrorBody("AUTHENTICATION_FAILED", requestId)
      );
    }

    // A duplicate is a success from the sender's point of view: the delivery
    // was accepted once and re-delivering it must not look like an error, or
    // the Git host will keep retrying something already done.
    reply.status(outcome === "accepted" ? 202 : 200);
    return { data: { status: outcome }, meta: { requestId } };
  }
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
