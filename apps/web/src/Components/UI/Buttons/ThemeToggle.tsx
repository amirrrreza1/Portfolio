"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/Contexts/ThemeContext";
import type { Locale } from "@portfolio/contracts/common";
import { getMessages } from "@/i18n/messages";

export default function ThemeToggle({ locale }: { readonly locale: Locale }) {
  const { theme, toggleTheme } = useTheme();
  const messages = getMessages(locale);

  return (
    <button
      onClick={toggleTheme}
      type="button"
      aria-label={messages.common.theme}
      className="relative flex h-7 w-7 items-center justify-center overflow-hidden"
    >
      <span className="absolute transition-transform duration-500 ease-in-out hover:translate-y-1 motion-reduce:transition-none">
        {theme === "light" ? (
          <Sun className="text-text h-6 w-6" />
        ) : (
          <Moon className="text-text h-6 w-6" />
        )}
      </span>
    </button>
  );
}
