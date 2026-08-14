import ProjectsGallery from "@/Components/Projects/ProjectsGallery";
import { getPortfolioProjects } from "@/server/portfolio-projects";
import { PublicDataUnavailableError } from "@/server/public-api-client";
import type { PortfolioProjectsView } from "@/server/portfolio-projects-source";
import { isLocale } from "@portfolio/contracts/common";
import { notFound } from "next/navigation";
import { getMessages } from "@/i18n/messages";
import { getPortfolioSite } from "@/server/portfolio-site";
import { getPortfolioGitHubStats } from "@/server/portfolio-github-stats";

export default async function LocaleProjectsPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  let portfolio: PortfolioProjectsView | undefined;
  let site;
  try {
    [portfolio, site] = await Promise.all([
      getPortfolioProjects(locale),
      getPortfolioSite(locale),
    ]);
  } catch (error) {
    if (!(error instanceof PublicDataUnavailableError)) throw error;
  }

  if (portfolio === undefined || site === undefined)
    return <UnavailableProjects locale={locale} />;
  const githubStats = await getPortfolioGitHubStats(
    site.settings,
    portfolio.projects
  );
  return (
    <ProjectsGallery
      locale={locale}
      projects={portfolio.projects}
      skills={portfolio.skills}
      githubStats={githubStats}
    />
  );
}

function UnavailableProjects({ locale }: { readonly locale: "en" | "fa" }) {
  return (
    <main className="Container my-20 border p-8 text-center" role="alert">
      <h1 className="text-2xl font-semibold">
        {getMessages(locale).projects.unavailable}
      </h1>
    </main>
  );
}
