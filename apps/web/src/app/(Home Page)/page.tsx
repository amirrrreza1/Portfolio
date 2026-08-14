import AboutMe from "@/Components/AboutMe/AboutMe";
import Certificate from "@/Components/Certificate/Certificate";
import DailyQuote from "@/Components/DailyQuote/DailyQuote";
import DownloadResume from "@/Components/DownloadResume/DownloadResume";
import GetInTouchForm from "@/Components/GetInTouch/GetInTouch";
import Hero from "@/Components/Hero/Hero";
import ProjectsSection from "@/Components/Projects/Projects";
import Skills from "@/Components/Skills/Skills";
import { getPortfolioHome } from "@/server/portfolio-home";
import { getPortfolioProjects } from "@/server/portfolio-projects";
import { getPortfolioSite } from "@/server/portfolio-site";
import { PublicDataUnavailableError } from "@/server/public-api-client";
import type { Locale } from "@portfolio/contracts/common";
import type {
  PublicPageSection,
  PublicSite,
} from "@portfolio/contracts/portfolio";
import { Fragment } from "react";
import { getMessages } from "@/i18n/messages";
import { getPortfolioGitHubStats } from "@/server/portfolio-github-stats";
import type { GitHubStatsByRepository } from "@/server/github-stats-source";

const HomePage = async ({ locale = "en" }: { readonly locale?: Locale }) => {
  let portfolio;
  let home;
  let site;
  try {
    [portfolio, home, site] = await Promise.all([
      getPortfolioProjects(locale),
      getPortfolioHome(locale),
      getPortfolioSite(locale),
    ]);
  } catch (error) {
    if (!(error instanceof PublicDataUnavailableError)) throw error;
    return (
      <main className="Container my-20 border p-8 text-center" role="alert">
        <h1 className="text-2xl font-semibold">
          {getMessages(locale).home.unavailable}
        </h1>
      </main>
    );
  }
  const githubStats = await getPortfolioGitHubStats(
    site.settings,
    portfolio.projects
  );
  return site.sections.map((section) => (
    <Fragment key={section.key}>
      {renderSection(section, site, locale, portfolio, home, githubStats)}
    </Fragment>
  ));
};

function renderSection(
  section: PublicPageSection,
  site: PublicSite,
  locale: Locale,
  portfolio: Awaited<ReturnType<typeof getPortfolioProjects>>,
  home: Awaited<ReturnType<typeof getPortfolioHome>>,
  githubStats: GitHubStatsByRepository
) {
  switch (section.key) {
    case "hero":
      return (
        <>
          <Hero section={section} />
          <DailyQuote quote={home.quote} />
        </>
      );
    case "about":
      return <AboutMe section={section} />;
    case "skills":
      return <Skills title={section.title} skills={portfolio.skills} />;
    case "contact":
      return site.settings.contactEnabled ? (
        <GetInTouchForm title={section.title} locale={locale} />
      ) : null;
    case "projects":
      return (
        <ProjectsSection
          title={section.title}
          locale={locale}
          projects={portfolio.projects}
          skills={portfolio.skills}
          githubStats={githubStats}
        />
      );
    case "certificates":
      return (
        <>
          <Certificate
            title={section.title}
            certificates={home.certificates}
            locale={locale}
          />
          <DownloadResume resume={home.resume} locale={locale} />
        </>
      );
  }
}

export default HomePage;
