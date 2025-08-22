import RubikCube from "../RubikCube/RubikCube";
import CodeStyleText from "../UI/CodeTyleText/CodeTyleText";

const Hero = () => {
  return (
    <>
      <main className="h-[90vh] flex flex-wrap justify-center items-center Container">
        <section>
          <CodeStyleText
            strings={["Hello There!", "I'm Amirreza Azarioun"]}
            typingSpeed={50}
            deletingSpeed={30}
            className="text-3xl"
            pauseBetween={3000}
          />
          <p className="text-secondary text-[18px] mt-4">Frontend Developer</p>
        </section>
        <section>
          <RubikCube />
        </section>
      </main>
    </>
  );
};

export default Hero;
