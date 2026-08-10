import Button from "@/Components/UI/Buttons/CustomBTN";
import CodeStyleText from "@/Components/UI/CodeTyleText/CodeTyleText";
import { Github, Linkedin, Heart, Mail } from "lucide-react";

const Footer = () => {
  return (
    <footer className="border-secondary/20 w-full border-t backdrop-blur-sm">
      <div className="Container text-secondary flex flex-col gap-2 py-3 text-[13px]">
        <div className="flex flex-col-reverse items-center justify-between gap-3 md:flex-row">
          <p className="FooterSmallText">
            <CodeStyleText
              strings={[
                `© ${new Date().getFullYear()} Amirreza Azarioun`,
                "All rights reserved",
              ]}
              typingSpeed={50}
              deletingSpeed={30}
            />
          </p>

          <div className="flex items-center gap-4">
            <div className="flex gap-3">
              <a
                href="https://github.com/amirrrreza1"
                target="_blank"
                rel="noopener noreferrer"
                className="dark:hover:bg-secondary border-secondary border p-1 transition-all duration-400 hover:text-black"
              >
                <Github size={19} className="hover:text-primary" />
              </a>
              <a
                href="https://www.linkedin.com/in/amirrrreza1/"
                target="_blank"
                rel="noopener noreferrer"
                className="dark:hover:bg-secondary border-secondary border p-1 transition-all duration-400 hover:text-black"
              >
                <Linkedin size={19} className="hover:text-primary" />
              </a>
              <a
                href="mailto:arazarioun83@gmail.com"
                className="dark:hover:bg-secondary border-secondary border p-1 transition-all duration-400 hover:text-black"
              >
                <Mail size={19} className="hover:text-primary" />
              </a>
            </div>
            <Button className="!px-3 !py-1">
              <a
                href="https://www.coffeebede.com/amirrrreza1"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <Heart size={19} className="hover:text-primary" />
                Donate
              </a>
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
