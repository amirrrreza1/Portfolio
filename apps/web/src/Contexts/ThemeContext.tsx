"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  type BlogFontKey,
  type BlogSizeStep,
  type MotionPreference,
  parseAppearanceCookie,
  PREFERENCES_COOKIE_NAME,
  type PublicAppearance,
  type ResolvedAppearance,
  serializeAppearanceCookie,
  themePreferenceSchema,
  type ThemePreference,
} from "@portfolio/contracts/appearance";

interface ThemeContextType {
  theme: ThemePreference;
  motion: MotionPreference;
  blogFont: BlogFontKey;
  blogSize: BlogSizeStep;
  appearanceOptions: PublicAppearance;
  setTheme: (theme: ThemePreference) => void;
  setMotion: (motion: MotionPreference) => void;
  setBlogFont: (font: BlogFontKey) => void;
  setBlogSize: (size: BlogSizeStep) => void;
  resetAppearance: () => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** The M4 client preference key, consumed once during the M5 cookie migration. */
export const LEGACY_THEME_STORAGE_KEY = "theme";

function readAppearanceCookie() {
  const prefix = `${PREFERENCES_COOKIE_NAME}=`;
  const raw = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length);

  return parseAppearanceCookie(raw);
}

/**
 * Returns a safe M4 theme to adopt only when M5 has no valid cookie yet.
 *
 * The legacy value is untrusted just like the cookie: old browser storage can
 * be edited by an extension or script, so only the registry's fixed theme
 * values are eligible. A valid cookie always wins because it is the visitor's
 * newer, full appearance preference.
 */
export function resolveLegacyThemeMigration(
  rawTheme: string | null,
  currentCookie: ReturnType<typeof readAppearanceCookie>
): ThemePreference | null {
  if (currentCookie !== null) return null;

  const result = themePreferenceSchema.safeParse(rawTheme);
  return result.success ? result.data : null;
}

function consumeLegacyTheme(): ThemePreference | null {
  try {
    const legacyTheme = resolveLegacyThemeMigration(
      window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY),
      readAppearanceCookie()
    );

    // Remove malformed values too: this is a one-time compatibility bridge,
    // not a second preference store that should keep influencing new visits.
    window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    return legacyTheme;
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts. The
    // server-rendered/cookie appearance remains correct without this upgrade.
    return null;
  }
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
  appearanceOptions,
}: {
  children: React.ReactNode;
  initialAppearance: ResolvedAppearance;
  defaultAppearance: ResolvedAppearance;
  appearanceOptions: PublicAppearance;
}) {
  const [appearance, setAppearance] =
    useState<Omit<ResolvedAppearance, "corrected">>(initialAppearance);

  // The server has already emitted this exact value, so this only guards
  // client-side transitions where the root layout remains mounted.
  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);

  /*
   * The one-time THEMING.md §5.6 migration.
   *
   * `localStorage` is an external system the server cannot read, so its value
   * cannot seed `useState` and cannot be read during render without breaking
   * hydration: the server has already emitted the cookie's answer, and reading
   * a different one on the client would make the first client render disagree
   * with the markup. Reading it after mount and adopting it once is the
   * supported shape for exactly this case, and it runs at most once per
   * browser — `consumeLegacyTheme` removes the key.
   *
   * `react-hooks/set-state-in-effect` cannot see that: it flags any
   * synchronous `setState` in an effect body as a cascading render. Here the
   * cascade is a single extra render for a visitor who has not yet been
   * migrated, and never again afterwards.
   */
  useEffect(() => {
    const legacyTheme = consumeLegacyTheme();
    if (legacyTheme === null) return;

    const { corrected, ...initialPreferences } = initialAppearance;
    void corrected;
    const migratedAppearance = { ...initialPreferences, theme: legacyTheme };
    persistAppearance(migratedAppearance);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setAppearance(migratedAppearance);
    applyAppearance(migratedAppearance);
  }, [initialAppearance]);

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

  const setTheme = (theme: ThemePreference) => {
    if (theme === "system" || appearanceOptions.themes.includes(theme)) {
      updateAppearance({ theme });
    }
  };
  const setMotion = (motion: MotionPreference) => {
    if (appearanceOptions.offerMotionToggle) updateAppearance({ motion });
  };
  const setBlogFont = (blogFont: BlogFontKey) => {
    if (appearanceOptions.blogFonts.some((font) => font.key === blogFont)) {
      updateAppearance({ blogFont });
    }
  };
  const setBlogSize = (blogSize: BlogSizeStep) => {
    if (appearanceOptions.blogSizes.includes(blogSize)) {
      updateAppearance({ blogSize });
    }
  };
  const resetAppearance = () => {
    persistAppearance(defaultAppearance);
    setAppearance(defaultAppearance);
    applyAppearance(defaultAppearance);
  };

  const toggleTheme = () => {
    const nextTheme = appearanceOptions.themes.find(
      (theme) => theme !== appearance.theme
    );
    if (nextTheme !== undefined) setTheme(nextTheme);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme: appearance.theme,
        motion: appearance.motion,
        blogFont: appearance.blogFont,
        blogSize: appearance.blogSize,
        appearanceOptions,
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
