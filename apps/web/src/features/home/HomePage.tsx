import AboutMe from "@/Components/AboutMe/AboutMe";
import Certificate from "@/Components/Certificate/Certificate";
import DailyQuote from "@/Components/DailyQuote/DailyQuote";
import DownloadResume from "@/Components/DownloadResume/DownloadResume";
import GetInTouchForm from "@/Components/GetInTouch/GetInTouch";
import Hero from "@/Components/Hero/Hero";
import ProjectsSection from "@/Components/Projects/Projects";
import Skills from "@/Components/Skills/Skills";
import { getMessages } from "@/i18n/messages";
import { getPortfolioGitHubStats } from "@/server/portfolio-github-stats";
import { getPortfolioHome } from "@/server/portfolio-home";
import { getPortfolioProjects } from "@/server/portfolio-projects";
import { getPortfolioSite } from "@/server/portfolio-site";
import { PublicDataUnavailableError } from "@/server/public-api-client";
import type { Locale } from "@portfolio/contracts/common";

const HomePage = async ({ locale }: { readonly locale: Locale }) => {
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
  const about = site.sections.find((section) => section.key === "about");

  return (
    <>
      <Hero locale={locale} />
      <DailyQuote quote={home.quote} />
      {about === undefined ? null : <AboutMe section={about} />}
      <Skills skills={portfolio.skills} />
      <ProjectsSection
        locale={locale}
        projects={portfolio.projects}
        skills={portfolio.skills}
        githubStats={githubStats}
      />
      <Certificate certificates={home.certificates} locale={locale} />
      <DownloadResume resume={home.resume} locale={locale} />
      {site.settings.contactEnabled ? <GetInTouchForm /> : null}
    </>
  );
};

export default HomePage;
