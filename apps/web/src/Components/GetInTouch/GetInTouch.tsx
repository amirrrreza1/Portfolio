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

/** Public contact requests go through the server-side SMTP delivery path. */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

export default function GetInTouchForm() {
  const toast = useToast();
  const [startedAt] = useState(() => Date.now());

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(ContactUsSchema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/contact`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...data, company: "", startedAt }),
      });
      if (!response.ok) throw new Error("Contact request failed");

      toast("Thanks - your message has been received.");
      reset();
    } catch {
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
