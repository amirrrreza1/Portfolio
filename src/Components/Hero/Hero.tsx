import RubikCube from "../RubikCube/RubikCube";
import CodeStyleText from "../UI/CodeTyleText/CodeTyleText";

const Hero = () => {
  return (
    <>
      <main
        className="h-[calc(100vh-80px)] mt-[100px] flex flex-col lg:flex-row justify-center items-center gap-5 Container"
        id="home"
      >
        <section className="lg:w-1/2 h-fit">
          <div className="w-fit flex flex-col justify-center items-start gap-4 p-2 rounded">
            <CodeStyleText
              strings={["Hello There!", "I'm Amirreza Azarioun"]}
              typingSpeed={50}
              deletingSpeed={30}
              className="text-xl lg:text-3xl"
              pauseBetween={3000}
            />
            <p className="text-sm lg:text-lg lg:text-center">
              A Developer / Student / Learner
            </p>
          </div>
        </section>
        <section className="w-full lg:w-1/2 h-full flex justify-center items-end">
          <RubikCube />
        </section>
      </main>
    </>
  );
};

export default Hero;
