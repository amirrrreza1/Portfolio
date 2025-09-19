import { ButtonHTMLAttributes } from "react";

export interface CodeButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  variant?: "fill" | "outline";
}
