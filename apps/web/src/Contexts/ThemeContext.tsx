"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  parseAppearanceCookie,
  PREFERENCES_COOKIE_NAME,
  serializeAppearanceCookie,
  type ThemePreference,
} from "@portfolio/contracts/appearance";

interface ThemeContextType {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function readAppearanceCookie() {
  const prefix = `${PREFERENCES_COOKIE_NAME}=`;
  const raw = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length);

  return parseAppearanceCookie(raw);
}

function persistTheme(theme: ThemePreference) {
  const current = readAppearanceCookie();
  const preferences = current
    ? {
        theme,
        blogFont: current.blogFont,
        blogSize: current.blogSize,
        motion: current.motion,
      }
    : { theme };
  const secure = window.location.protocol === "https:" ? "; Secure" : "";

  document.cookie = `${PREFERENCES_COOKIE_NAME}=${serializeAppearanceCookie(
    preferences
  )}; Path=/; SameSite=Lax; Max-Age=31536000${secure}`;
}

function applyTheme(theme: ThemePreference) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme: ThemePreference;
}) {
  const [theme, setThemeState] = useState<ThemePreference>(initialTheme);

  // The server has already emitted this exact value, so this only guards
  // client-side transitions where the root layout remains mounted.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = (nextTheme: ThemePreference) => {
    persistTheme(nextTheme);
    setThemeState(nextTheme);
    applyTheme(nextTheme);
  };

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
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
