"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { CustomSelectProps, Option } from "./Types";

export default function CustomSelect({
  options,
  placeholder,
  defaultValue,
  onChange,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selection, setSelection] = useState<{
    value: string | null;
    defaultValue: string | undefined;
  }>({ value: defaultValue ?? null, defaultValue });
  const selectedValue =
    selection.defaultValue === defaultValue
      ? selection.value
      : (defaultValue ?? null);
  const selected =
    options.find((option) => option.value === selectedValue) ?? null;

  const handleSelect = (option: Option) => {
    setSelection({ value: option.value, defaultValue });
    onChange?.(option.value);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="bg-bg text-text border-primary flex w-full cursor-pointer items-center justify-between gap-3 rounded border px-4 py-2 shadow-sm transition hover:shadow-md"
      >
        <span>{selected ? selected.label : placeholder}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="ml-2"
        >
          <ChevronDown className="text-text h-4 w-4" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.ul
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="bg-bg border-primary absolute z-10 mt-1 w-full overflow-hidden rounded border p-2 shadow-lg"
          >
            {options.map((option) => (
              <motion.li
                key={option.value}
                onClick={() => handleSelect(option)}
                whileHover={{
                  scale: 1.03,
                  backgroundColor: "var(--color-primary)",
                  color: "var(--color-bg)",
                }}
                transition={{ duration: 0.2 }}
                className="cursor-pointer rounded px-4 py-2 transition-colors"
              >
                {option.label}
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
