"use client";

import { scrollToSection } from "@/Components/SmoothScroll/SmoothScroll";
import ThemeToggle from "@/Components/UI/Buttons/ThemeToggle";
import Tooltip from "@/Components/UI/Tooltip/Tooltip";
import { Home, Search, Settings, Code2, Mail, Award } from "lucide-react";

const Header = () => {
  return (
    <header className="sticky top-5 z-50 w-full h-15 mt-5">
      <div
        className="w-fit mx-auto flex items-center gap-2 md:gap-4 px-2 md:px-4 py-2
        backdrop-blur-[5px] bg-secondary/20 rounded
        border border-secondary/20 
        shadow-lg"
      >
        <Tooltip title="Home">
          <button
            onClick={() => scrollToSection("#home")}
            className="p-2 rounded hover:bg-white/20 transition"
          >
            <Home className="w-6 h-6 text-secondary" />
          </button>
        </Tooltip>

        <Tooltip title="About Me">
          <button
            onClick={() => scrollToSection("#about")}
            className="p-2 rounded hover:bg-white/20 transition"
          >
            <Search className="w-6 h-6 text-secondary" />
          </button>
        </Tooltip>

        <Tooltip title="Skills">
          <button
            onClick={() => scrollToSection("#skills")}
            className="p-2 rounded hover:bg-white/20 transition"
          >
            <Code2 className="w-6 h-6 text-secondary" />
          </button>
        </Tooltip>

        <Tooltip title="Get In Touch">
          <button
            onClick={() => scrollToSection("#getintouch")}
            className="p-2 rounded hover:bg-white/20 transition"
          >
            <Mail className="w-6 h-6 text-secondary" />
          </button>
        </Tooltip>

        <Tooltip title="Projects">
          <button
            onClick={() => scrollToSection("#projects")}
            className="p-2 rounded hover:bg-white/20 transition"
          >
            <Settings className="w-6 h-6 text-secondary" />
          </button>
        </Tooltip>

        <Tooltip title="Certificates">
          <button
            onClick={() => scrollToSection("#certificates")}
            className="p-2 rounded hover:bg-white/20 transition"
          >
            <Award className="w-6 h-6 text-secondary" />
          </button>
        </Tooltip>

        <Tooltip title="Theme">
          <ThemeToggle />
        </Tooltip>
      </div>
    </header>
  );
};

export default Header;
