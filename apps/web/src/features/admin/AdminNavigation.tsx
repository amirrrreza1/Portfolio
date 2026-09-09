"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileClock,
  Globe2,
  Images,
  Layers3,
  LayoutDashboard,
  Newspaper,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

type NavigationItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly matches?: readonly string[];
};

const groups: readonly {
  readonly label: string;
  readonly items: readonly NavigationItem[];
}[] = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/site", label: "Site content", icon: Globe2 },
      {
        href: "/admin/collections",
        label: "Portfolio collections",
        icon: Layers3,
      },
      {
        href: "/admin/articles",
        label: "Articles",
        icon: Newspaper,
        matches: ["/admin/blog"],
      },
      { href: "/admin/media", label: "Media & resume", icon: Images },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/history", label: "History & access", icon: FileClock },
      { href: "/admin/security", label: "Security", icon: ShieldCheck },
    ],
  },
] as const;

const allItems = groups.flatMap((group) => group.items);

export default function AdminNavigation({
  mobile = false,
}: {
  readonly mobile?: boolean;
}): React.JSX.Element {
  const pathname = usePathname();

  if (mobile) {
    return (
      <nav aria-label="Admin pages" className="overflow-x-auto px-3 pb-3">
        <ul className="flex w-max gap-1">
          {allItems.map((item) => (
            <li key={item.href}>
              <NavigationLink item={item} pathname={pathname} mobile />
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Admin pages" className="flex-1 overflow-y-auto px-3 py-5">
      {groups.map((group) => (
        <div className="mb-5" key={group.label}>
          <p className="text-text-muted px-3 pb-2 text-xs font-medium tracking-[0.16em] uppercase">
            {group.label}
          </p>
          <ul className="flex flex-col gap-1">
            {group.items.map((item) => (
              <li key={item.href}>
                <NavigationLink item={item} pathname={pathname} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function NavigationLink({
  item,
  pathname,
  mobile = false,
}: {
  readonly item: NavigationItem;
  readonly pathname: string;
  readonly mobile?: boolean;
}): React.JSX.Element {
  const active = isActive(item, pathname);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`focus-visible:ring-accent flex items-center rounded-lg text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none ${
        mobile ? "min-h-9 px-3 whitespace-nowrap" : "min-h-11 gap-3 px-3"
      } ${
        active
          ? "bg-secondary text-text font-medium"
          : "text-text-muted hover:bg-secondary hover:text-text"
      }`}
    >
      {mobile ? null : <Icon aria-hidden="true" size={18} strokeWidth={1.8} />}
      {item.label}
    </Link>
  );
}

function isActive(item: NavigationItem, pathname: string): boolean {
  if (item.href === "/admin") return pathname === item.href;
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
    return true;
  }
  return item.matches?.some((prefix) => pathname.startsWith(prefix)) ?? false;
}
