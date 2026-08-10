"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  type BlogFontKey,
  type BlogSizeStep,
  type MotionPreference,
  parseAppearanceCookie,
  PREFERENCES_COOKIE_NAME,
  type ResolvedAppearance,
  serializeAppearanceCookie,
  type ThemePreference,
} from "@portfolio/contracts/appearance";

interface ThemeContextType {
  theme: ThemePreference;
  motion: MotionPreference;
  blogFont: BlogFontKey;
  blogSize: BlogSizeStep;
  setTheme: (theme: ThemePreference) => void;
  setMotion: (motion: MotionPreference) => void;
  setBlogFont: (font: BlogFontKey) => void;
  setBlogSize: (size: BlogSizeStep) => void;
  resetAppearance: () => void;
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

function persistAppearance(preferences: Omit<ResolvedAppearance, "corrected">) {
  document.cookie = `${PREFERENCES_COOKIE_NAME}=${serializeAppearanceCookie({
    theme: preferences.theme,
    motion: preferences.motion,
    blogFont: preferences.blogFont,
    blogSize: preferences.blogSize,
  })}; Path=/; SameSite=Lax; Max-Age=31536000${
    window.location.protocol === "https:" ? "; Secure" : ""
  }`;
}

function readCurrentAppearance(initialAppearance: ResolvedAppearance) {
  const current = readAppearanceCookie();
  return current
    ? {
        theme: current.theme ?? initialAppearance.theme,
        blogFont: current.blogFont ?? initialAppearance.blogFont,
        blogSize: current.blogSize ?? initialAppearance.blogSize,
        motion: current.motion ?? initialAppearance.motion,
      }
    : initialAppearance;
}

function applyAppearance(appearance: Omit<ResolvedAppearance, "corrected">) {
  document.documentElement.dataset.theme = appearance.theme;
  document.documentElement.dataset.motion = appearance.motion;

  for (const surface of document.querySelectorAll<HTMLElement>(
    ".blog-reading-surface"
  )) {
    surface.dataset.blogFont = appearance.blogFont;
    surface.dataset.blogSize = appearance.blogSize;
  }
}

export function ThemeProvider({
  children,
  initialAppearance,
  defaultAppearance,
}: {
  children: React.ReactNode;
  initialAppearance: ResolvedAppearance;
  defaultAppearance: ResolvedAppearance;
}) {
  const [appearance, setAppearance] =
    useState<Omit<ResolvedAppearance, "corrected">>(initialAppearance);

  // The server has already emitted this exact value, so this only guards
  // client-side transitions where the root layout remains mounted.
  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);

  const updateAppearance = (
    change: Partial<Omit<ResolvedAppearance, "corrected">>
  ) => {
    const nextAppearance = {
      ...readCurrentAppearance(initialAppearance),
      ...change,
    };
    persistAppearance(nextAppearance);
    setAppearance(nextAppearance);
    applyAppearance(nextAppearance);
  };

  const setTheme = (theme: ThemePreference) => updateAppearance({ theme });
  const setMotion = (motion: MotionPreference) => updateAppearance({ motion });
  const setBlogFont = (blogFont: BlogFontKey) => updateAppearance({ blogFont });
  const setBlogSize = (blogSize: BlogSizeStep) =>
    updateAppearance({ blogSize });
  const resetAppearance = () => {
    persistAppearance(defaultAppearance);
    setAppearance(defaultAppearance);
    applyAppearance(defaultAppearance);
  };

  const toggleTheme = () => {
    setTheme(appearance.theme === "light" ? "dark" : "light");
  };

  return (
    <ThemeContext.Provider
      value={{
        theme: appearance.theme,
        motion: appearance.motion,
        blogFont: appearance.blogFont,
        blogSize: appearance.blogSize,
        setTheme,
        setMotion,
        setBlogFont,
        setBlogSize,
        resetAppearance,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
};

export function useReducedMotion(): boolean {
  const { motion } = useTheme();
  const [systemReduced, setSystemReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return motion === "reduced" || (motion === "system" && systemReduced);
}
