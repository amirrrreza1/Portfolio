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
      className={`
        relative overflow-hidden font-mono transition-all duration-300 shadow-md hover:shadow-lg group
        ${sizeClasses[size]}
        border border-secondary cursor-pointer
        ${
          isFill ? "bg-secondary text-primary" : "bg-transparent text-secondary"
        }
        active:scale-95
        ${className}
      `}
    >
      <AnimatePresence mode="wait">
        {hovered && (
          <motion.span
            key="cover"
            className="absolute top-0 left-0 h-full w-full bg-primary z-10"
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

      <span className="absolute inset-0 bg-current opacity-0 group-active:opacity-20 rounded-md pointer-events-none z-30"></span>
    </button>
  );
};

export default Button;
