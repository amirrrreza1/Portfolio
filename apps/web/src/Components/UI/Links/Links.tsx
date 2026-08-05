import React from "react";
import { ArrowRight } from "lucide-react";
import { AnimatedLinkProps } from "./Types";



const AnimatedLink: React.FC<AnimatedLinkProps> = ({
  href,
  children,
  className,
}) => {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`
        w-fit relative inline-flex items-center gap-2 px-3 py-1 text-secondary
        transition-colors duration-300
        group overflow-hidden
        ${className || ""}
      `}
    >
      <span className="relative z-10 transition-colors duration-300 group-hover:text-primary">
        {children}
      </span>

      <ArrowRight
        size={16}
        className="
          relative z-10 transition-transform duration-300
          group-hover:-rotate-45 group-hover:text-primary
        "
      />

      <span
        className="
          absolute left-0 bottom-0 w-full h-[2px] bg-secondary
          transition-all duration-500 ease-in-out
          group-hover:h-full group-hover:bottom-0
        "
      ></span>
    </a>
  );
};

export default AnimatedLink;
