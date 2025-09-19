import { ContactUsSchema } from "@/Schemas/ContactUsForm";
import z from "zod";

export type FormData = z.infer<typeof ContactUsSchema>;
