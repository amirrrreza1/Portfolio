import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
} from "@nestjs/common";
import { contactSubmissionSchema } from "@portfolio/contracts/contact";
import { buildErrorBody, toFieldErrors } from "@portfolio/contracts/common";
import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";

import { createContactClientKey } from "./contact.runtime.js";
import { ContactSubmissionService } from "./contact.service.js";

export const CONTACT_SUBMISSION_SERVICE = Symbol("CONTACT_SUBMISSION_SERVICE");

@Controller("contact")
export class ContactController {
  public constructor(
    @Inject(CONTACT_SUBMISSION_SERVICE)
    private readonly contactSubmission: ContactSubmissionService
  ) {}

  @Post()
  @HttpCode(202)
  async submit(
    @Body() body: unknown,
    @Req() request: FastifyRequest
  ): Promise<{ data: { accepted: true }; meta: { requestId: string } }> {
    const requestId = randomUUID();
    const parsed = contactSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        buildErrorBody(
          "VALIDATION_FAILED",
          requestId,
          toFieldErrors(parsed.error)
        )
      );
    }

    await this.contactSubmission.submit(
      parsed.data,
      createContactClientKey(request.ip)
    );

    return { data: { accepted: true }, meta: { requestId } };
  }
}
