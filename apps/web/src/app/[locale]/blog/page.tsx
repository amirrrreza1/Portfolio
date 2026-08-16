import { formatNumber, formatPublicTimestamp } from "@/i18n/format";
import { getMessages } from "@/i18n/messages";
import { articlePath, localePath } from "@/i18n/routing";
import { getPortfolioArticles } from "@/server/portfolio-articles";
import { PublicDataUnavailableError } from "@/server/public-api-client";
import { isLocale } from "@portfolio/contracts/common";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type RouteParams = Promise<{ locale: string }>;

export async function generateMetadata({
  params,
}: Readonly<{ params: RouteParams }>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const messages = getMessages(locale).blog;
  return {
    title: messages.title,
    description: messages.description,
    alternates: {
      canonical: localePath(locale, "blog"),
      languages: {
        en: localePath("en", "blog"),
        fa: localePath("fa", "blog"),
        "x-default": localePath("en", "blog"),
      },
    },
    openGraph: {
      type: "website",
      locale,
      alternateLocale: [locale === "en" ? "fa" : "en"],
      title: messages.title,
      description: messages.description,
      url: localePath(locale, "blog"),
    },
  };
}

export default async function LocaleBlogPage({
  params,
}: Readonly<{ params: RouteParams }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const messages = getMessages(locale).blog;
  let articles;
  try {
    articles = await getPortfolioArticles(locale);
  } catch (error) {
    if (!(error instanceof PublicDataUnavailableError)) throw error;
    return <UnavailableBlog locale={locale} />;
  }

  return (
    <section className="Container my-16 space-y-8 border p-5 md:p-8">
      <header className="space-y-3">
        <h1 className="text-4xl font-bold">{messages.title}</h1>
        <p className="text-text-muted max-w-3xl">{messages.description}</p>
      </header>

      {articles.posts.length === 0 ? (
        <p>{messages.empty}</p>
      ) : (
        <ol className="space-y-6">
          {articles.posts.map((article) => (
            <li key={article.id} className="border-border border p-5">
              <article className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-semibold">
                    <Link
                      href={articlePath(locale, article.slug)}
                      className="underline-offset-4 hover:underline"
                    >
                      {article.title}
                    </Link>
                  </h2>
                  {article.featured ? (
                    <span className="border-border bg-surface border px-2 py-1 text-sm">
                      {messages.featured}
                    </span>
                  ) : null}
                </div>
                <p className="text-text-muted">{article.excerpt}</p>
                <p className="text-text-muted flex flex-wrap gap-2 text-sm">
                  <time dateTime={article.publishedAt}>
                    {formatPublicTimestamp(article.publishedAt, locale)}
                  </time>
                  <span aria-hidden="true">·</span>
                  <span>
                    {formatNumber(article.readingMinutes, locale)}{" "}
                    {messages.minuteRead}
                  </span>
                </p>
                <Link
                  href={articlePath(locale, article.slug)}
                  className="inline-block underline"
                >
                  {messages.readArticle}
                </Link>
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function UnavailableBlog({ locale }: { readonly locale: "en" | "fa" }) {
  return (
    <main className="Container my-20 border p-8 text-center" role="alert">
      <h1 className="text-2xl font-semibold">
        {getMessages(locale).blog.unavailable}
      </h1>
    </main>
  );
}
