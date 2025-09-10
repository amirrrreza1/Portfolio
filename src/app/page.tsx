import AboutMe from "@/Components/AboutMe/AboutMe";
import Certificate from "@/Components/Certificate/Certificate";
import GetInTouchForm from "@/Components/GetInTouch/GetInTouch";
import Hero from "@/Components/Hero/Hero";
import ProjectsSection from "@/Components/Projects/Projects";
import Skills from "@/Components/Skills/Skills";

const HomePage = () => {
  return (
    <>
      <Hero />
      <AboutMe />
      <Skills />
      <GetInTouchForm />
      <ProjectsSection />
      <Certificate />
    </>
  );
};

export default HomePage;
