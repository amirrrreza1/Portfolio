import Button from "@/Components/UI/Buttons/CustomBTN";
import CodeStyleText from "@/Components/UI/CodeTyleText/CodeTyleText";
import type { Locale } from "@portfolio/contracts/common";
import type {
  PublicSiteSettings,
  PublicSocialLink,
} from "@portfolio/contracts/portfolio";
import {
  BookOpen,
  ExternalLink,
  Github,
  Heart,
  Linkedin,
  Mail,
  Send,
} from "lucide-react";
import { getMessages } from "@/i18n/messages";
import { localePath } from "@/i18n/routing";
import Link from "next/link";

function SocialIcon({ link }: { readonly link: PublicSocialLink }) {
  if (link.kind === "EMAIL") {
    return <Mail size={19} className="hover:text-bg" />;
  }
  if (link.kind === "DONATE") {
    return <Heart size={19} className="hover:text-bg" />;
  }
  const hostname = new URL(link.url).hostname;
  if (hostname === "github.com") {
    return <Github size={19} className="hover:text-bg" />;
  }
  if (hostname === "linkedin.com" || hostname.endsWith(".linkedin.com")) {
    return <Linkedin size={19} className="hover:text-bg" />;
  }
  if (hostname === "t.me") {
    return <Send size={19} className="hover:text-bg" />;
  }
  return <ExternalLink size={19} className="hover:text-bg" />;
}

function PublicLink({ link }: { readonly link: PublicSocialLink }) {
  const external = link.kind !== "EMAIL";
  return (
    <a
      href={link.url}
      aria-label={link.label}
      title={link.label}
      target={external ? "_blank" : undefined}
      rel={external ? (link.rel ?? "noopener noreferrer") : undefined}
      className="border-primary hover:bg-primary hover:text-bg border p-1 transition-all duration-400"
    >
      <SocialIcon link={link} />
    </a>
  );
}

export default function Footer({
  locale,
  settings,
  socialLinks,
}: {
  readonly locale: Locale;
  readonly settings: PublicSiteSettings;
  readonly socialLinks: readonly PublicSocialLink[];
}) {
  const standardLinks = socialLinks.filter((link) => link.kind !== "DONATE");
  const donateLinks = socialLinks.filter((link) => link.kind === "DONATE");
  const messages = getMessages(locale);
  const year = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
    useGrouping: false,
  }).format(new Date().getFullYear());

  return (
    <footer className="border-border w-full border-t backdrop-blur-sm">
      <div className="Container text-text flex flex-col gap-2 py-3 text-[13px]">
        <div className="flex flex-col-reverse items-center justify-between gap-3 md:flex-row">
          <p className="FooterSmallText">
            <CodeStyleText
              strings={[
                `${messages.footer.copyright} ${year} ${settings.siteName}`,
                ...settings.footerLines,
                messages.footer.rights,
              ]}
              typingSpeed={50}
              deletingSpeed={30}
            />
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <div className="flex gap-3">
              {standardLinks.map((link) => (
                <PublicLink key={link.id} link={link} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button
                asChild
                size="sm"
                className="focus-visible:ring-2 focus-visible:outline-none"
              >
                <Link href={localePath(locale, "blog")}>
                  <span className="inline-flex items-center gap-2">
                    <BookOpen aria-hidden="true" size={18} />
                    {messages.blog.title}
                  </span>
                </Link>
              </Button>
              {donateLinks.map((link) => {
                return (
                  <Button
                    asChild
                    size="sm"
                    className="focus-visible:ring-2 focus-visible:outline-none"
                    key={link.id}
                  >
                    <a
                      href={link.url}
                      target="_blank"
                      rel={link.rel ?? "noopener noreferrer"}
                    >
                      <span className="inline-flex items-center gap-2">
                        <SocialIcon link={link} />
                        {link.label}
                      </span>
                    </a>
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
