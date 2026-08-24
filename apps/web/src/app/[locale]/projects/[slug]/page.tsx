import InlineMarkdown from "@/Components/UI/InlineMarkdown/InlineMarkdown";
import MarkdownContent from "@/Components/UI/MarkdownContent/MarkdownContent";
import { localePath } from "@/i18n/routing";
import { getPortfolioProjectDetail } from "@/server/portfolio-project-detail";
import {
  PublicApiResponseError,
  PublicDataUnavailableError,
} from "@/server/public-api-client";
import { isLocale } from "@portfolio/contracts/common";
import {
  publicProjectSlugSchema,
  type PublicProjectDetailItem,
} from "@portfolio/contracts/portfolio";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMessages, type Messages } from "@/i18n/messages";
import { formatPublicDate } from "@/i18n/format";

type RouteParams = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({
  params,
}: Readonly<{ params: RouteParams }>): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const parsedSlug = publicProjectSlugSchema.safeParse(slug);
  if (!parsedSlug.success) return {};
  try {
    const project = await getPortfolioProjectDetail(locale, parsedSlug.data);
    if (project === null) return {};
    return { title: project.title, description: project.summary };
  } catch (error) {
    if (
      error instanceof PublicDataUnavailableError ||
      (error instanceof PublicApiResponseError && error.status === 404)
    ) {
      return {};
    }
    throw error;
  }
}

export default async function LocaleProjectDetailPage({
  params,
}: Readonly<{ params: RouteParams }>) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const parsedSlug = publicProjectSlugSchema.safeParse(slug);
  if (!parsedSlug.success) notFound();

  let project: PublicProjectDetailItem | null;
  try {
    project = await getPortfolioProjectDetail(locale, parsedSlug.data);
  } catch (error) {
    if (error instanceof PublicApiResponseError && error.status === 404) {
      notFound();
    }
    if (!(error instanceof PublicDataUnavailableError)) throw error;
    return <UnavailableProject locale={locale} />;
  }
  if (project === null) notFound();

  const text = getMessages(locale).projects;
  return (
    <article className="Container my-16 space-y-8 border p-5 md:p-8">
      <Link
        href={localePath(locale, "projects")}
        className="text-text underline-offset-4 hover:underline"
      >
        {text.all}
      </Link>

      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-bold">{project.title}</h1>
          {project.featured ? (
            <span className="border-border bg-surface border px-3 py-1 text-sm">
              {text.featured}
            </span>
          ) : null}
        </div>
        <p className="text-text-muted text-lg">
          <InlineMarkdown source={project.summary} />
        </p>
        <p className="text-sm font-medium">
          {statusLabel(project.status, text)}
        </p>
      </header>

      {project.image === null ? null : (
        <Image
          src={project.image.src}
          alt={project.image.altText}
          width={project.image.width ?? 1600}
          height={project.image.height ?? 900}
          sizes="(max-width: 768px) 100vw, 1024px"
          className="h-auto w-full border object-cover"
          unoptimized
          priority
        />
      )}

      {project.longDescription === null ? null : (
        <section className="project-reading-surface prose prose-invert max-w-none">
          <MarkdownContent source={project.longDescription} />
        </section>
      )}

      {project.startedAt === null && project.completedAt === null ? null : (
        <dl className="flex flex-wrap gap-8 border-y py-4">
          {project.startedAt === null ? null : (
            <DateFact
              label={text.started}
              value={project.startedAt}
              locale={locale}
            />
          )}
          {project.completedAt === null ? null : (
            <DateFact
              label={text.completedOn}
              value={project.completedAt}
              locale={locale}
            />
          )}
        </dl>
      )}

      <section aria-labelledby="project-technologies" className="space-y-3">
        <h2 id="project-technologies" className="text-2xl font-semibold">
          {text.technologies}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {project.skills.map((skill) => (
            <li
              key={skill.id}
              className="border-border bg-surface border px-3 py-1 text-sm"
            >
              {skill.name}
            </li>
          ))}
        </ul>
      </section>

      <nav className="flex flex-wrap gap-4" aria-label={project.title}>
        {project.demoUrl === null ? null : (
          <ExternalProjectLink href={project.demoUrl} label={text.view} />
        )}
        {project.repositoryUrl === null ? null : (
          <ExternalProjectLink
            href={project.repositoryUrl}
            label={text.repository}
          />
        )}
      </nav>
    </article>
  );
}

function ExternalProjectLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="border-primary bg-primary text-bg border px-5 py-3 font-semibold"
    >
      {label}
    </a>
  );
}

function DateFact({
  label,
  value,
  locale,
}: {
  label: string;
  value: string;
  locale: "en" | "fa";
}) {
  return (
    <div>
      <dt className="text-text-muted text-sm">{label}</dt>
      <dd>
        <time dateTime={value}>{formatPublicDate(value, locale)}</time>
      </dd>
    </div>
  );
}

function statusLabel(
  status: PublicProjectDetailItem["status"],
  text: Messages["projects"]
): string {
  if (status === "COMPLETED") return text.completed;
  if (status === "IN_PROGRESS") return text.inProgress;
  return text.planned;
}

function UnavailableProject({ locale }: { readonly locale: "en" | "fa" }) {
  return (
    <main className="Container my-20 border p-8 text-center" role="alert">
      <h1 className="text-2xl font-semibold">
        {getMessages(locale).projects.detailUnavailable}
      </h1>
    </main>
  );
}
