"use client";

import AppearanceSettingsDialog from "@/Components/Appearance/AppearanceSettingsDialog";
import { scrollToSection } from "@/Components/SmoothScroll/SmoothScroll";
import ThemeToggle from "@/Components/UI/Buttons/ThemeToggle";
import Tooltip from "@/Components/UI/Tooltip/Tooltip";
import { localePath } from "@/i18n/routing";
import { getMessages } from "@/i18n/messages";
import type { Locale } from "@portfolio/contracts/common";
import type { PublicNavItem } from "@portfolio/contracts/portfolio";
import {
  Award,
  Code2,
  ExternalLink,
  Home,
  Mail,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { MouseEvent } from "react";

const iconsByTarget: Readonly<Record<string, LucideIcon>> = {
  hero: Home,
  about: Search,
  skills: Code2,
  contact: Mail,
  projects: Settings,
  certificates: Award,
  "/projects": Settings,
};

function anchorTarget(target: string): string {
  if (target === "hero") return "home";
  if (target === "contact") return "getintouch";
  return target;
}

function navigationHref(item: PublicNavItem, locale: Locale): string {
  return item.targetKind === "SECTION_ANCHOR"
    ? `#${anchorTarget(item.target)}`
    : localePath(locale, item.target);
}

function handleNavigation(event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (href.startsWith("#") && scrollToSection(href)) event.preventDefault();
}

export default function Header({
  locale,
  navigation,
}: {
  readonly locale: Locale;
  readonly navigation: readonly PublicNavItem[];
}) {
  const messages = getMessages(locale);
  return (
    <header className="fixed top-5 right-0 left-0 z-50 h-15 w-full">
      <div className="bg-secondary/20 border-secondary/20 mx-auto flex w-fit items-center gap-2 rounded border px-2 py-2 shadow-lg backdrop-blur-[5px] md:gap-4 md:px-4">
        <nav
          aria-label={messages.navigation.portfolioSections}
          className="contents"
        >
          {navigation.map((item) => {
            const href = navigationHref(item, locale);
            const Icon = iconsByTarget[item.target] ?? ExternalLink;
            return (
              <Tooltip key={item.id} title={item.label}>
                <a
                  href={href}
                  aria-label={item.label}
                  onClick={(event) => handleNavigation(event, href)}
                  className="rounded p-2 transition hover:bg-white/20"
                >
                  <Icon className="text-secondary h-6 w-6" />
                </a>
              </Tooltip>
            );
          })}
        </nav>

        <Tooltip title={messages.common.theme}>
          <ThemeToggle locale={locale} />
        </Tooltip>
        <AppearanceSettingsDialog locale={locale} />
      </div>
    </header>
  );
}
