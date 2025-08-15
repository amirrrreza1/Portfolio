"use client";

import { Moon, Sun } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/Contexts/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative flex items-center justify-center w-7 h-7 border-b-2 border-secondary bg-primary  overflow-hidden"
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
            <Sun className="w-6 h-6 text-secondary" />
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
            <Moon className="w-6 h-6 text-secondary" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
