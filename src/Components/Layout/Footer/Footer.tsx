import Button from "@/Components/UI/Buttons/CustomBTN";
import CodeStyleText from "@/Components/UI/CodeTyleText/CodeTyleText";
import { Github, Linkedin, Heart } from "lucide-react";

const Footer = () => {
  return (
    <footer className="w-full backdrop-blur-sm border-t border-secondary/20">
      <div className="Container text-secondary text-[13px] py-3 flex flex-col gap-2">
        <div className="flex flex-col-reverse md:flex-row justify-between items-center gap-3">
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
                href="https://github.com/your-username"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-black dark:hover:bg-secondary border border-secondary p-1 transition-all duration-400"
              >
                <Github size={18} className="hover:text-primary" />
              </a>
              <a
                href="https://linkedin.com/in/your-username"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-black dark:hover:bg-secondary border border-secondary p-1 transition-all duration-400"
              >
                <Linkedin size={18} className="hover:text-primary" />
              </a>
            </div>
            <Button className="!px-3 !py-1">
              <a href="" className="flex items-center gap-2">
                <Heart size={14} className="hover:text-primary" />
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
