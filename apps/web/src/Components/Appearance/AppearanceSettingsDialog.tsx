"use client";

import { Settings } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { useTheme } from "@/Contexts/ThemeContext";

const THEMES = ["dark", "light", "system"] as const;
const BLOG_SIZES = ["sm", "md", "lg", "xl"] as const;
const MOTION = ["system", "full", "reduced"] as const;

function OptionButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`border px-3 py-2 text-sm ${
        active ? "bg-secondary text-primary" : "border-secondary/40"
      }`}
    >
      {children}
    </button>
  );
}

/** Native dialog supplies modal focus containment and Escape-to-close. */
export default function AppearanceSettingsDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const locale = pathname.startsWith("/fa") ? "fa" : "en";
  const {
    theme,
    motion,
    blogFont,
    blogSize,
    setTheme,
    setMotion,
    setBlogFont,
    setBlogSize,
    resetAppearance,
  } = useTheme();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="border-secondary/40 flex h-10 w-10 items-center justify-center rounded border"
      >
        <Settings aria-hidden="true" className="h-5 w-5" />
        <span className="sr-only">Appearance settings</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-modal="true"
        aria-labelledby={headingId}
        onClose={close}
        className="text-secondary bg-primary border-secondary w-[min(94vw,38rem)] border p-0 backdrop:bg-black/70"
      >
        <div className="space-y-6 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={headingId} className="text-xl font-semibold">
                Appearance settings
              </h2>
              <p className="text-secondary/70 mt-1 text-sm">
                Changes apply immediately. Press Escape to close.
              </p>
            </div>
            <button type="button" onClick={close} className="border px-3 py-1">
              Close
            </button>
          </div>

          <fieldset>
            <legend className="mb-2 font-medium">Theme</legend>
            <div
              className="flex flex-wrap gap-2"
              role="radiogroup"
              aria-label="Theme"
            >
              {THEMES.map((value) => (
                <OptionButton
                  key={value}
                  active={theme === value}
                  onClick={() => setTheme(value)}
                >
                  {value === "system" ? "Use system" : value}
                </OptionButton>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 font-medium">Blog font</legend>
            <p className="text-secondary/70 mb-2 text-sm">
              Applies only to article reading pages.
            </p>
            <select
              value={blogFont}
              onChange={(event) =>
                setBlogFont(event.target.value as typeof blogFont)
              }
              className="bg-primary border-secondary w-full border p-2"
            >
              <option value="jetbrains-mono">JetBrains Mono</option>
              <option value="vazir-code">Vazir Code</option>
              <option value="system-sans">System sans</option>
            </select>
          </fieldset>

          <fieldset>
            <legend className="mb-2 font-medium">Blog text size</legend>
            <div
              className="flex flex-wrap gap-2"
              role="radiogroup"
              aria-label="Blog text size"
            >
              {BLOG_SIZES.map((value) => (
                <OptionButton
                  key={value}
                  active={blogSize === value}
                  onClick={() => setBlogSize(value)}
                >
                  {value.toUpperCase()}
                </OptionButton>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 font-medium">Motion</legend>
            <div
              className="flex flex-wrap gap-2"
              role="radiogroup"
              aria-label="Motion"
            >
              {MOTION.map((value) => (
                <OptionButton
                  key={value}
                  active={motion === value}
                  onClick={() => setMotion(value)}
                >
                  {value === "full"
                    ? "Full motion"
                    : value === "reduced"
                      ? "Reduce motion"
                      : "Use system"}
                </OptionButton>
              ))}
            </div>
          </fieldset>

          <div className="border-secondary/30 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <a href={`/${locale === "en" ? "fa" : "en"}`} className="underline">
              Switch to {locale === "en" ? "Persian" : "English"}
            </a>
            <button
              type="button"
              onClick={resetAppearance}
              className="border px-3 py-2"
            >
              Reset to site defaults
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
