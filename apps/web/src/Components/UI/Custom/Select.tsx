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
        className="flex justify-between items-center gap-3 w-full px-4 py-2 bg-primary text-secondary border border-secondary shadow-sm hover:shadow-md transition rounded cursor-pointer"
      >
        <span>{selected ? selected.label : placeholder}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="ml-2"
        >
          <ChevronDown className="w-4 h-4 text-secondary" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.ul
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="absolute z-10 w-full mt-1 bg-primary border border-secondary rounded shadow-lg overflow-hidden p-2"
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
                className="px-4 py-2 cursor-pointer transition-colors rounded"
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
