"use client";

import { Moon, Sun } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
      <AnimatePresence initial={false} mode="wait">
        {theme === "light" ? (
          <motion.span
            key="sun"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            whileHover={{ y: 4 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="absolute"
          >
            <Sun className="text-text h-6 w-6" />
          </motion.span>
        ) : (
          <motion.span
            key="moon"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            whileHover={{ y: 4 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="absolute"
          >
            <Moon className="text-text h-6 w-6" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
