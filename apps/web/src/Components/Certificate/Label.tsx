import React from "react";
import { LabelProps } from "./Types";



const Label: React.FC<LabelProps> = ({ children, className }) => {
  return (
    <span
      className={`
        w-fit relative inline-block px-3 py-1 text-secondary border-b-2 border-secondary
        ${className || ""}
      `}
    >
      {children}
    </span>
  );
};

export default Label;
