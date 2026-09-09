"use client";

import { scrollToSection } from "@/Components/SmoothScroll/SmoothScroll";
import ThemeToggle from "@/Components/UI/Buttons/ThemeToggle";
import Tooltip from "@/Components/UI/Tooltip/Tooltip";
import { localePath } from "@/i18n/routing";
import { getMessages } from "@/i18n/messages";
import { getLocaleDefinition, type Locale } from "@portfolio/contracts/common";
import {
  Award,
  Code2,
  Home,
  Languages,
  Mail,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";

type PortfolioNavigationItem = {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly targetKind: "SECTION_ANCHOR" | "INTERNAL_ROUTE";
  readonly target: string;
};

const PORTFOLIO_NAVIGATION = [
  { label: "Home", icon: Home, targetKind: "SECTION_ANCHOR", target: "hero" },
  {
    label: "About",
    icon: Search,
    targetKind: "SECTION_ANCHOR",
    target: "about",
  },
  {
    label: "Skills",
    icon: Code2,
    targetKind: "SECTION_ANCHOR",
    target: "skills",
  },
  {
    label: "Projects",
    icon: Settings,
    targetKind: "INTERNAL_ROUTE",
    target: "/projects",
  },
  {
    label: "Certificates",
    icon: Award,
    targetKind: "SECTION_ANCHOR",
    target: "certificates",
  },
  {
    label: "Contact",
    icon: Mail,
    targetKind: "SECTION_ANCHOR",
    target: "contact",
  },
] as const satisfies readonly PortfolioNavigationItem[];

function anchorTarget(target: string): string {
  if (target === "hero") return "home";
  if (target === "contact") return "getintouch";
  return target;
}

function navigationHref(item: PortfolioNavigationItem, locale: Locale): string {
  return item.targetKind === "SECTION_ANCHOR"
    ? `#${anchorTarget(item.target)}`
    : localePath(locale, item.target);
}

function handleNavigation(event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (href.startsWith("#") && scrollToSection(href)) event.preventDefault();
}

export default function Header({ locale }: { readonly locale: Locale }) {
  const pathname = usePathname();
  const isProjectsPage =
    /^\/(?:(?:en|fa)\/)?projects(?:\/|$)/.test(pathname);
  const isBlogPage = /^\/(?:en|fa)\/blog(?:\/|$)/.test(pathname);
  const blogLocale: Locale = pathname.startsWith("/fa/blog") ? "fa" : "en";
  const messages = getMessages(isBlogPage ? blogLocale : locale);
  const targetBlogLocale: Locale = blogLocale === "en" ? "fa" : "en";
  const targetLanguage = getLocaleDefinition(targetBlogLocale).nativeName;
  const languageLabel = `${messages.blog.switchLanguage}: ${targetLanguage}`;

  if (isProjectsPage) return null;

  return (
    <header className="sticky top-0 z-50 w-full py-5">
      <div className="bg-surface border-border mx-auto flex w-fit items-center gap-2 rounded border px-2 py-2 shadow-lg backdrop-blur-[5px] md:gap-4 md:px-4">
        <nav
          aria-label={
            isBlogPage
              ? messages.blog.navigation
              : messages.navigation.portfolioSections
          }
          className="contents"
        >
          {isBlogPage ? (
            <>
              <Tooltip title={messages.blog.home}>
                <a
                  href={localePath(blogLocale)}
                  aria-label={messages.blog.home}
                  className="hover:bg-surface rounded p-2 transition"
                >
                  <Home className="text-text h-6 w-6" />
                </a>
              </Tooltip>
              <Tooltip title={languageLabel}>
                <a
                  href={localePath(targetBlogLocale, "blog")}
                  hrefLang={targetBlogLocale}
                  lang={targetBlogLocale}
                  aria-label={languageLabel}
                  className="hover:bg-surface flex items-center gap-1 rounded p-2 transition"
                >
                  <Languages className="text-text h-6 w-6" />
                  <span className="text-xs font-semibold uppercase">
                    {targetBlogLocale}
                  </span>
                </a>
              </Tooltip>
            </>
          ) : (
            <>
              {PORTFOLIO_NAVIGATION.map((item) => {
                const href = navigationHref(item, locale);
                const Icon = item.icon;
                return (
                  <Tooltip key={item.target} title={item.label}>
                    <a
                      href={href}
                      aria-label={item.label}
                      onClick={(event) => handleNavigation(event, href)}
                      className="hover:bg-surface rounded p-2 transition"
                    >
                      <Icon className="text-text h-6 w-6" />
                    </a>
                  </Tooltip>
                );
              })}
            </>
          )}
        </nav>

        <Tooltip title={messages.common.theme}>
          <ThemeToggle locale={isBlogPage ? blogLocale : locale} />
        </Tooltip>
      </div>
    </header>
  );
}
