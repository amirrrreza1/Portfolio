import { z } from "zod";

const headerSafeText = (label: string) =>
  z
    .string()
    .trim()
    .min(2, { message: `${label} must be at least 2 characters` })
    .max(160, { message: `${label} is too long` })
    .refine((value) => !/[\r\n\0]/.test(value), {
      message: `${label} contains unsupported characters`,
    });

/** Shared bounded public input. The two optional fields are abuse signals. */
export const contactSubmissionSchema = z
  .object({
    name: headerSafeText("Name"),
    email: z
      .string()
      .trim()
      .max(254, { message: "Email is too long" })
      .email({ message: "Invalid email address" })
      .refine((value) => !/[\r\n\0]/.test(value), {
        message: "Invalid email address",
      })
      .transform((value) => value.toLowerCase()),
    message: z
      .string()
      .trim()
      .min(10, { message: "Message must be at least 10 characters" })
      .max(5_000, { message: "Message is too long" }),
    company: z.string().max(200).optional(),
    startedAt: z.number().int().positive().optional(),
  })
  .strict();

export type ContactSubmission = z.infer<typeof contactSubmissionSchema>;
