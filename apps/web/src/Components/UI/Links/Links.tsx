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
      className={`text-text group relative inline-flex w-fit items-center gap-2 overflow-hidden px-3 py-1 transition-colors duration-300 ${className || ""} `}
    >
      <span className="group-hover:text-bg relative z-10 transition-colors duration-300">
        {children}
      </span>

      <ArrowRight
        size={16}
        className="group-hover:text-bg relative z-10 transition-transform duration-300 group-hover:-rotate-45"
      />

      <span className="bg-primary absolute bottom-0 left-0 h-[2px] w-full transition-all duration-500 ease-in-out group-hover:bottom-0 group-hover:h-full"></span>
    </a>
  );
};

export default AnimatedLink;
