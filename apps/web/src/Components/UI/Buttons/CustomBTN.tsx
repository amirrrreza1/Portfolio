"use client";

import { FC, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CodeButtonProps } from "./Types";

const sizeClasses = {
  sm: "px-3 py-1 text-sm",
  md: "px-6 py-2 text-sm",
  lg: "px-8 py-3 text-base",
};

const Button: FC<CodeButtonProps> = ({
  children,
  className = "",
  size = "md",
  variant = "fill",
  ...props
}) => {
  const [hovered, setHovered] = useState(false);

  const isFill = variant === "fill";

  return (
    <button
      {...props}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative overflow-hidden font-mono shadow-md transition-all duration-300 hover:shadow-lg ${sizeClasses[size]} border-secondary cursor-pointer border ${
        isFill ? "bg-secondary text-primary" : "text-secondary bg-transparent"
      } active:scale-95 ${className} `}
    >
      <AnimatePresence mode="wait">
        {hovered && (
          <motion.span
            key="cover"
            className="bg-primary absolute top-0 left-0 z-10 h-full w-full"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          />
        )}
      </AnimatePresence>

      <span
        className={`relative z-20 transition-colors duration-300 ${
          isFill
            ? hovered
              ? "text-secondary"
              : "text-primary"
            : hovered
              ? "text-secondary"
              : "text-secondary"
        }`}
      >
        {children}
      </span>

      <span className="pointer-events-none absolute inset-0 z-30 rounded-md bg-current opacity-0 group-active:opacity-20"></span>
    </button>
  );
};

export default Button;
