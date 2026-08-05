"use client";

import { createContext, useContext, useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as ThemeMode;
    if (savedTheme) {
      setThemeState(savedTheme);
      applyTheme(savedTheme);
    } else {
      applyTheme("dark");
    }
  }, []);

  const applyTheme = (mode: ThemeMode) => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");

    if (mode === "light") {
      root.classList.add("light");
    } else if (mode === "dark") {
      root.classList.add("dark");
    } else {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        root.classList.add("dark");
      } else {
        root.classList.add("light");
      }
    }
  };

  const setTheme = (mode: ThemeMode) => {
    localStorage.setItem("theme", mode);
    setThemeState(mode);
    applyTheme(mode);
  };

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
};
