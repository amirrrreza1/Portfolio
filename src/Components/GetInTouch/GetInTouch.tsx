"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import emailjs from "@emailjs/browser";
import ScrambleText from "../UI/ScrumbleText/ScrumbleText";
import Devider from "../UI/Devider/Devider";
import Button from "../UI/Buttons/CustomBTN";
import { useToast } from "../Toast/Toast";
import { ContactUsSchema } from "@/Schemas/ContactUsForm";

type FormData = z.infer<typeof ContactUsSchema>;

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
    try {
      await emailjs.send(
        process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID!,
        process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID!,
        {
          name: data.name,
          email: data.email,
          message: data.message,
        },
        process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY!
      );
      toast("Message sent successfully!");
      reset();
    } catch (err) {
      toast("Something went wrong!");
    }
  };
  return (
    <section className="Container backdrop-blur-sm p-2 border my-10" id="getintouch">
      <ScrambleText
        text="Get in Touch"
        className="text-3xl ml-3"
        delayBeforeFix={1000}
      />

      <Devider />

      <form onSubmit={handleSubmit(onSubmit)} className="px-6">
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <label className={`${errors.name?.message ? "text-main-red" : ""}`}>
              Name
            </label>
            {errors.name?.message && (
              <p className="text-main-red text-sm">({errors.name?.message})</p>
            )}
          </div>
          <input
            type="text"
            {...register("name")}
            className="FormInput"
            placeholder="Your name"
          />
        </div>
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
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
            {...register("email")}
            type="text"
            className="FormInput"
            placeholder="you@example.com"
            autoComplete="off"
          />
        </div>
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <label
              className={`block text-sm font-medium mb-1 ${
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
            {...register("message")}
            className="FormInput resize-none"
            placeholder="Write your message..."
            rows={4}
          />
        </div>

        <Button type="submit" disabled={isSubmitting} className="mb-5">
          {isSubmitting ? "Sending..." : "Send Message"}
        </Button>
      </form>
    </section>
  );
}
