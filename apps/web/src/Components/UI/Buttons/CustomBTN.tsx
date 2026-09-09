"use client";

import {
  cloneElement,
  FC,
  isValidElement,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CodeButtonProps } from "./Types";

const sizeClasses = {
  sm: "h-8 px-3 py-0 text-sm leading-none",
  md: "px-6 py-2 text-sm leading-5",
  lg: "px-8 py-3 text-base leading-6",
};

const Button: FC<CodeButtonProps> = ({
  children,
  className = "",
  size = "md",
  variant = "fill",
  asChild = false,
  ...props
}) => {
  const [hovered, setHovered] = useState(false);

  const isFill = variant === "fill";
  const buttonClassName = `group relative inline-flex items-center justify-center overflow-hidden align-middle font-mono shadow-md transition-all duration-300 hover:shadow-lg ${sizeClasses[size]} border-primary cursor-pointer border ${
    isFill ? "bg-primary text-bg" : "text-text bg-transparent"
  } active:scale-95 ${className}`;
  const renderContent = (contentChildren: ReactNode) => (
    <>
      <AnimatePresence mode="wait">
        {hovered && (
          <motion.span
            key="cover"
            className="bg-bg absolute top-0 left-0 z-10 h-full w-full"
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
              ? "text-text"
              : "text-bg"
            : hovered
              ? "text-text"
              : "text-text"
        }`}
      >
        {contentChildren}
      </span>

      <span className="pointer-events-none absolute inset-0 z-30 rounded-md bg-current opacity-0 group-active:opacity-20" />
    </>
  );

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{
      readonly children?: ReactNode;
      readonly className?: string;
      readonly onMouseEnter?: (event: MouseEvent<HTMLElement>) => void;
      readonly onMouseLeave?: (event: MouseEvent<HTMLElement>) => void;
    }>;

    return cloneElement(
      child,
      {
        className: `${buttonClassName} ${child.props.className ?? ""}`,
        onMouseEnter: (event) => {
          child.props.onMouseEnter?.(event);
          setHovered(true);
        },
        onMouseLeave: (event) => {
          child.props.onMouseLeave?.(event);
          setHovered(false);
        },
      },
      renderContent(child.props.children)
    );
  }

  return (
    <button
      {...props}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={buttonClassName}
    >
      {renderContent(children)}
    </button>
  );
};

export default Button;
