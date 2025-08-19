import CodeStyleText from "../UI/CodeTyleText/CodeTyleText";

const Hero = () => {
  return (
    <>
      <main className="h-[90vh] flex flex-col justify-center Container">
        <CodeStyleText
          strings={["Hello There!", "I'm Amirreza Azarioun"]}
          typingSpeed={50}
          deletingSpeed={30}
          className="text-3xl"
          pauseBetween={3000}
        />
        <p className="text-secondary text-[18px] mt-4">Frontend Developer</p>
      </main>
    </>
  );
};

export default Hero;
