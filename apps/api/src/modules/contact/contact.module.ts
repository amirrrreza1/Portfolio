import { Module } from "@nestjs/common";

import {
  ContactController,
  CONTACT_SUBMISSION_SERVICE,
} from "./contact.controller.js";
import {
  createContactStoreFromEnvironment,
  createSmtpContactDelivery,
} from "./contact.runtime.js";
import { ContactSubmissionService } from "./contact.service.js";

@Module({
  controllers: [ContactController],
  providers: [
    {
      provide: CONTACT_SUBMISSION_SERVICE,
      useFactory: (): ContactSubmissionService =>
        new ContactSubmissionService(
          createContactStoreFromEnvironment(),
          createSmtpContactDelivery(
            process.env.SMTP_URL,
            process.env.CONTACT_FROM_EMAIL
          )
        ),
    },
  ],
})
export class ContactModule {}
