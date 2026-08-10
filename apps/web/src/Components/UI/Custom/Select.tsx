"use client";

import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { CustomSelectProps, Option } from "./Types";

export default function CustomSelect({
  options,
  placeholder = "Select...",
  defaultValue,
  onChange,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<Option | null>(null);

  useEffect(() => {
    if (defaultValue) {
      const defaultOption =
        options.find((o) => o.value === defaultValue) || null;
      setSelected(defaultOption);
    }
  }, [defaultValue, options]);

  const handleSelect = (option: Option) => {
    setSelected(option);
    onChange?.(option.value);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="bg-primary text-secondary border-secondary flex w-full cursor-pointer items-center justify-between gap-3 rounded border px-4 py-2 shadow-sm transition hover:shadow-md"
      >
        <span>{selected ? selected.label : placeholder}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="ml-2"
        >
          <ChevronDown className="text-secondary h-4 w-4" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.ul
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="bg-primary border-secondary absolute z-10 mt-1 w-full overflow-hidden rounded border p-2 shadow-lg"
          >
            {options.map((option) => (
              <motion.li
                key={option.value}
                onClick={() => handleSelect(option)}
                whileHover={{
                  scale: 1.03,
                  backgroundColor: "var(--color-secondary)",
                  color: "var(--color-primary)",
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
