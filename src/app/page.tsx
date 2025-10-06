import AboutMe from "@/Components/AboutMe/AboutMe";
import Certificate from "@/Components/Certificate/Certificate";
import DailyQuote from "@/Components/DailyQuote/DailyQuote";
import DownloadResume from "@/Components/DownloadResume/DownloadResume";
import GetInTouchForm from "@/Components/GetInTouch/GetInTouch";
import Hero from "@/Components/Hero/Hero";
import ProjectsSection from "@/Components/Projects/Projects";
import Skills from "@/Components/Skills/Skills";

const HomePage = () => {
  return (
    <>
      <Hero />
      <DailyQuote />
      <AboutMe />
      <Skills />
      <GetInTouchForm />
      <ProjectsSection />
      <Certificate />
      <DownloadResume />
    </>
  );
};

export default HomePage;
