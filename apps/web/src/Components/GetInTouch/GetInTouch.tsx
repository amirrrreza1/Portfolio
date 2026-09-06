"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import ScrambleText from "../UI/ScrumbleText/ScrumbleText";
import Devider from "../UI/Devider/Devider";
import Button from "../UI/Buttons/CustomBTN";
import { useToast } from "../Toast/Toast";
import { ContactUsSchema } from "@/Schemas/ContactUsForm";
import { useAutoLang } from "@/Hooks/useAutoLang";
import { FormData } from "./Types";
import type { PublicPageSection } from "@portfolio/contracts/portfolio";

/** Public contact requests go through the server-side SMTP delivery path. */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

export default function GetInTouchForm({
  title,
  content,
}: {
  readonly title: string;
  readonly content: Extract<
    PublicPageSection,
    { readonly key: "contact" }
  >["content"];
}) {
  const toast = useToast();
  const [startedAt] = useState(() => Date.now());

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(ContactUsSchema),
    defaultValues: { company: "" },
  });

  const onSubmit = async (data: FormData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/contact`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...data, startedAt }),
      });
      if (!response.ok) throw new Error("Contact request failed");

      toast(content.successMessage);
      reset();
    } catch {
      toast(content.failureMessage);
    }
  };

  const nameRef = useAutoLang<HTMLInputElement>();
  const emailRef = useAutoLang<HTMLInputElement>();
  const messageRef = useAutoLang<HTMLTextAreaElement>();

  return (
    <section
      className="Container my-10 border p-2 backdrop-blur-sm"
      id="getintouch"
    >
      <ScrambleText text={title} className="ml-3 text-3xl" speed={30} />
      <Devider />

      <form onSubmit={handleSubmit(onSubmit)} className="px-1 md:px-4 lg:px-6">
        <div
          aria-hidden="true"
          className="absolute top-auto -left-[10000px] h-px w-px overflow-hidden"
        >
          <label htmlFor="contact-company">Company</label>
          <input
            id="contact-company"
            type="text"
            autoComplete="off"
            tabIndex={-1}
            {...register("company")}
          />
        </div>
        <div className="mb-5">
          <div className="mb-1 flex items-center gap-2">
            <label className={`${errors.name?.message ? "text-danger" : ""}`}>
              {content.nameLabel}
            </label>
            {errors.name?.message && (
              <p className="text-danger text-sm">
                ({content.invalidNameMessage})
              </p>
            )}
          </div>
          <input
            type="text"
            className="FormInput"
            placeholder={content.namePlaceholder}
            {...register("name")}
            ref={(el) => {
              register("name").ref(el);
              nameRef.current = el;
            }}
          />
        </div>
        <div className="mb-5">
          <div className="mb-1 flex items-center gap-2">
            <label className={` ${errors.email?.message ? "text-danger" : ""}`}>
              {content.emailLabel}
            </label>
            {errors.email?.message && (
              <p className="text-danger text-sm">
                ({content.invalidEmailMessage})
              </p>
            )}
          </div>
          <input
            className="FormInput"
            type="text"
            placeholder={content.emailPlaceholder}
            autoComplete="off"
            {...register("email")}
            ref={(el) => {
              register("email").ref(el);
              emailRef.current = el;
            }}
          />
        </div>
        <div className="mb-5">
          <div className="mb-1 flex items-center gap-2">
            <label
              className={`mb-1 block text-sm font-medium ${
                errors.message?.message ? "text-danger" : ""
              }`}
            >
              {content.messageLabel}
            </label>
            {errors.message?.message && (
              <p className="text-danger text-sm">
                ({content.invalidMessageMessage})
              </p>
            )}
          </div>
          <textarea
            className="FormInput resize-none"
            placeholder={content.messagePlaceholder}
            rows={4}
            {...register("message")}
            ref={(el) => {
              register("message").ref(el);
              messageRef.current = el;
            }}
          />
        </div>

        <Button type="submit" disabled={isSubmitting} className="mb-5">
          {isSubmitting ? content.sendingLabel : content.submitLabel}
        </Button>
      </form>
    </section>
  );
}
