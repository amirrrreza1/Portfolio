import { getMessages } from "@/i18n/messages";
import { articlePath, localePath } from "@/i18n/routing";
import { getPortfolioArticleDetail } from "@/server/portfolio-article-detail";
import { isLocale, slugSchemaFor } from "@portfolio/contracts/common";
import { headers } from "next/headers";
import Link from "next/link";

export default async function ArticleNotFound() {
  const pathname = (await headers()).get("x-portfolio-pathname") ?? "";
  const match = /^\/(en|fa)\/blog\/([^/]+)$/.exec(pathname);
  const localeInput = match?.[1];
  const encodedSlug = match?.[2];
  const locale = isLocale(localeInput) ? localeInput : "en";
  const messages = getMessages(locale);
  let availableTranslations: Awaited<
    ReturnType<typeof getPortfolioArticleDetail>
  >["availableTranslations"] = [];

  if (encodedSlug !== undefined) {
    try {
      const decodedSlug = decodeURIComponent(encodedSlug);
      const slug = slugSchemaFor(locale).safeParse(decodedSlug);
      if (slug.success) {
        availableTranslations = (
          await getPortfolioArticleDetail(locale, slug.data)
        ).availableTranslations;
      }
    } catch {
      // Invalid URL encoding and unavailable data use the generic 404 safely.
    }
  }

  return (
    <main className="Container my-20 space-y-4 border p-8 text-center">
      <h1 className="text-2xl font-semibold">{messages.notFound.title}</h1>
      <p>{messages.blog.translationMissing}</p>
      <nav className="flex flex-wrap justify-center gap-4">
        {availableTranslations.map((alternate) => (
          <Link
            key={alternate.locale}
            href={articlePath(alternate.locale, alternate.slug)}
            hrefLang={alternate.locale}
            lang={alternate.locale}
            className="underline"
          >
            {messages.blog.availableIn}: {alternate.locale.toUpperCase()}
          </Link>
        ))}
        <Link href={localePath(locale, "blog")} className="underline">
          {messages.blog.backToBlog}
        </Link>
      </nav>
    </main>
  );
}
