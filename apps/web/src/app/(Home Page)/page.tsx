import AboutMe from "@/Components/AboutMe/AboutMe";
import Certificate from "@/Components/Certificate/Certificate";
import DailyQuote from "@/Components/DailyQuote/DailyQuote";
import DownloadResume from "@/Components/DownloadResume/DownloadResume";
import GetInTouchForm from "@/Components/GetInTouch/GetInTouch";
import Hero from "@/Components/Hero/Hero";
import ProjectsSection from "@/Components/Projects/Projects";
import Skills from "@/Components/Skills/Skills";
import { getLegacyPortfolioData } from "@/server/legacy-portfolio";

const HomePage = () => {
  const portfolio = getLegacyPortfolioData();
  return (
    <>
      <Hero />
      <DailyQuote quotes={portfolio.quotes} />
      <AboutMe />
      <Skills skills={portfolio.skills} />
      <GetInTouchForm />
      <ProjectsSection
        projects={portfolio.projects}
        skills={portfolio.skills}
      />
      <Certificate certificates={portfolio.certificates} />
      <DownloadResume />
    </>
  );
};

export default HomePage;
