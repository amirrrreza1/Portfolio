"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import emailjs from "@emailjs/browser";
import ScrambleText from "../UI/ScrumbleText/ScrumbleText";
import Devider from "../UI/Devider/Devider";
import Button from "../UI/Buttons/CustomBTN";
import { useToast } from "../Toast/Toast";
import { ContactUsSchema } from "@/Schemas/ContactUsForm";
import { useAutoLang } from "@/Hooks/useAutoLang";
import { FormData } from "./Types";

/**
 * Browser-side EmailJS configuration.
 *
 * These are `NEXT_PUBLIC_`, so they are compiled into the bundle and readable
 * by every visitor — public identifiers, not secrets. The account they address
 * can be used by anyone who reads the bundle, which is why docs/SECURITY.md
 * §6 requires rotating and revoking them, and why M4 replaces this whole path
 * with a server-side SMTP submission that carries no browser credential.
 *
 * Read at module scope so a misconfigured checkout is detectable before the
 * visitor types a message, rather than throwing on a non-null assertion after
 * they press Send.
 */
const emailJsConfig = {
  serviceId: process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID,
  templateId: process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID,
  publicKey: process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY,
};

const isEmailJsConfigured = Boolean(
  emailJsConfig.serviceId && emailJsConfig.templateId && emailJsConfig.publicKey
);

export default function GetInTouchForm() {
  const toast = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(ContactUsSchema),
  });

  const onSubmit = async (data: FormData) => {
    if (!isEmailJsConfigured) {
      toast("Messaging is temporarily unavailable. Please use email instead.");
      return;
    }

    try {
      await emailjs.send(
        emailJsConfig.serviceId!,
        emailJsConfig.templateId!,
        {
          name: data.name,
          email: data.email,
          message: data.message,
        },
        emailJsConfig.publicKey!
      );
      toast("Message sent successfully!");
      reset();
    } catch (error) {
      // The provider's error can carry request detail; show the visitor a
      // generic message and keep the specifics in the console.
      console.error("[contact] EmailJS submission failed", error);
      toast("Something went wrong. Please try again in a moment.");
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
      <ScrambleText text="Get in Touch" className="ml-3 text-3xl" speed={30} />
      <Devider />

      <form onSubmit={handleSubmit(onSubmit)} className="px-1 md:px-4 lg:px-6">
        <div className="mb-5">
          <div className="mb-1 flex items-center gap-2">
            <label className={`${errors.name?.message ? "text-main-red" : ""}`}>
              Name
            </label>
            {errors.name?.message && (
              <p className="text-main-red text-sm">({errors.name?.message})</p>
            )}
          </div>
          <input
            type="text"
            className="FormInput"
            placeholder="Your name"
            {...register("name")}
            ref={(el) => {
              register("name").ref(el);
              nameRef.current = el;
            }}
          />
        </div>
        <div className="mb-5">
          <div className="mb-1 flex items-center gap-2">
            <label
              className={` ${errors.email?.message ? "text-main-red" : ""}`}
            >
              Email
            </label>
            {errors.email?.message && (
              <p className="text-main-red text-sm">({errors.email?.message})</p>
            )}
          </div>
          <input
            className="FormInput"
            type="text"
            placeholder="you@example.com"
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
                errors.message?.message ? "text-main-red" : ""
              }`}
            >
              Message
            </label>
            {errors.message?.message && (
              <p className="text-main-red text-sm">
                ({errors.message?.message})
              </p>
            )}
          </div>
          <textarea
            className="FormInput resize-none"
            placeholder="Write your message..."
            rows={4}
            {...register("message")}
            ref={(el) => {
              register("message").ref(el);
              messageRef.current = el;
            }}
          />
        </div>

        <Button type="submit" disabled={isSubmitting} className="mb-5">
          {isSubmitting ? "Sending..." : "Send Message"}
        </Button>
      </form>
    </section>
  );
}
