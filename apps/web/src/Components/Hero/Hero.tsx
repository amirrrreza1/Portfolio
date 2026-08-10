import RubikCube from "../RubikCube/RubikCube";
import CodeStyleText from "../UI/CodeTyleText/CodeTyleText";

const Hero = () => {
  return (
    <>
      <main
        className="Container flex h-screen flex-col items-center justify-center gap-5 lg:flex-row"
        id="home"
      >
        <section className="h-fit lg:w-1/2">
          <div className="flex w-full flex-col items-start justify-center gap-4 rounded p-2">
            <CodeStyleText
              strings={["Hello There!", "I'm Amirreza Azarioun"]}
              typingSpeed={50}
              deletingSpeed={30}
              className="min-w-[270px] text-xl md:text-2xl lg:text-3xl"
              pauseBetween={3000}
            />
            <p className="text-sm lg:text-center lg:text-lg">
              A Developer / Student / Learner
            </p>
          </div>
        </section>
        <section className="flex h-[300px] w-full items-end justify-center lg:w-1/2">
          <RubikCube />
        </section>
      </main>
    </>
  );
};

export default Hero;
