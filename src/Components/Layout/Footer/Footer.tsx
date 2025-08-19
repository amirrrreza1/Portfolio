import CodeStyleText from "@/Components/UI/CodeTyleText/CodeTyleText";
import ScrambleText from "@/Components/UI/ScrumbleText/ScrumbleText";

const Footer = () => {
  return (
    <>
      <footer className="w-full h-11 bg-primary border-t border-secondary/20 ">
        <div className="flex flex-wrap-reverse justify-between items-center py-2 Container text-secondary text-[13px]">
          <p className="FooterSmallText">
            <CodeStyleText
              strings={[
                `© ${new Date().getFullYear()} Amirreza Azarioun | All rights reserved`,
              ]}
              typingSpeed={50}
              deletingSpeed={30}
            />
          </p>

          <ScrambleText
            delayBeforeFix={1000}
            className="FooterSmallText"
            speed={50}
            text="Made with ❤️ by Amirreza"
          />
        </div>
      </footer>
    </>
  );
};

export default Footer;
