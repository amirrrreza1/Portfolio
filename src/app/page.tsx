import CodeStyleText from "@/Components/UI/CodeTyleText/CodeTyleText";
import ScrambleText from "@/Components/UI/ScrumbleText/ScrumbleText";

export default function HomePage() {
  return (
    <main className="min-h-dvh grid place-items-center p-8">
      <div className="text-center">
        <p className="text-xl font-mono" style={{ marginTop: 10000 }}>
          <ScrambleText text="Projects" speed={50} delayBeforeFix={1000} />
        </p>
        <CodeStyleText
          strings={[
            "Hello, I'm Amirreza",
            "I'm a Frontend Developer",
            "I'm currently working at",
            "The Digital Venture Hub",
            "in the United Arab Emirates",
          ]}
          typingSpeed={70}
          deletingSpeed={40}
          pauseBetween={1200}
          loop={true}
          className="text-xl"
          cursorClassName="bg-black text-white"
        />
      </div>
    </main>
  );
}
