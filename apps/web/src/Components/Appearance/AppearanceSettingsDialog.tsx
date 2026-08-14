"use client";

import { Settings } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { useTheme } from "@/Contexts/ThemeContext";
import { getMessages } from "@/i18n/messages";
import { localePreferenceCookie } from "@/i18n/locale-preference";
import { switchLocalePath } from "@/i18n/routing";
import type { Locale } from "@portfolio/contracts/common";

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
export default function AppearanceSettingsDialog({
  locale,
}: {
  readonly locale: Locale;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const messages = getMessages(locale);
  const targetLocale: Locale = locale === "en" ? "fa" : "en";
  const targetPath = switchLocalePath(pathname, targetLocale);
  const isArticleDetail = /^\/(?:en|fa)\/blog\/[^/]+$/.test(pathname);
  const {
    theme,
    motion,
    blogFont,
    blogSize,
    appearanceOptions,
    setTheme,
    setMotion,
    setBlogFont,
    setBlogSize,
    resetAppearance,
  } = useTheme();
  const themes = [...appearanceOptions.themes, "system"] as const;

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
        <span className="sr-only">{messages.appearance.open}</span>
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
                {messages.appearance.title}
              </h2>
              <p className="text-secondary/70 mt-1 text-sm">
                {messages.appearance.description}
              </p>
            </div>
            <button type="button" onClick={close} className="border px-3 py-1">
              {messages.appearance.close}
            </button>
          </div>

          <fieldset>
            <legend className="mb-2 font-medium">
              {messages.appearance.theme}
            </legend>
            <div
              className="flex flex-wrap gap-2"
              role="radiogroup"
              aria-label={messages.appearance.theme}
            >
              {themes.map((value) => (
                <OptionButton
                  key={value}
                  active={theme === value}
                  onClick={() => setTheme(value)}
                >
                  {value === "system"
                    ? messages.appearance.useSystem
                    : value === "dark"
                      ? messages.appearance.themeDark
                      : messages.appearance.themeLight}
                </OptionButton>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 font-medium">
              {messages.appearance.blogFont}
            </legend>
            <p className="text-secondary/70 mb-2 text-sm">
              {messages.appearance.blogFontHelp}
            </p>
            <select
              value={blogFont}
              onChange={(event) =>
                setBlogFont(event.target.value as typeof blogFont)
              }
              className="bg-primary border-secondary w-full border p-2"
            >
              {appearanceOptions.blogFonts.map((font) => (
                <option key={font.key} value={font.key}>
                  {font.displayName}
                </option>
              ))}
            </select>
          </fieldset>

          <fieldset>
            <legend className="mb-2 font-medium">
              {messages.appearance.blogTextSize}
            </legend>
            <div
              className="flex flex-wrap gap-2"
              role="radiogroup"
              aria-label={messages.appearance.blogTextSize}
            >
              {appearanceOptions.blogSizes.map((value) => (
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

          {appearanceOptions.offerMotionToggle ? (
            <fieldset>
              <legend className="mb-2 font-medium">
                {messages.appearance.motion}
              </legend>
              <div
                className="flex flex-wrap gap-2"
                role="radiogroup"
                aria-label={messages.appearance.motion}
              >
                {MOTION.map((value) => (
                  <OptionButton
                    key={value}
                    active={motion === value}
                    onClick={() => setMotion(value)}
                  >
                    {value === "full"
                      ? messages.appearance.fullMotion
                      : value === "reduced"
                        ? messages.appearance.reduceMotion
                        : messages.appearance.useSystem}
                  </OptionButton>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="border-secondary/30 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            {isArticleDetail ? null : (
              <a
                href={targetPath}
                hrefLang={targetLocale}
                lang={targetLocale}
                onClick={() => {
                  document.cookie = localePreferenceCookie(
                    targetLocale,
                    window.location.protocol === "https:"
                  );
                }}
                className="underline"
              >
                {messages.appearance.switchLanguage}
              </a>
            )}
            <button
              type="button"
              onClick={resetAppearance}
              className="border px-3 py-2"
            >
              {messages.appearance.reset}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
