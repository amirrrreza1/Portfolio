import React from "react";
import { LabelProps } from "./Types";

const Label: React.FC<LabelProps> = ({ children, className }) => {
  return (
    <span
      className={`text-text border-primary relative inline-block w-fit border-b-2 px-3 py-1 ${className || ""} `}
    >
      {children}
    </span>
  );
};

export default Label;
