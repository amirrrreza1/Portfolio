"use client";

import ThemeToggle from "@/Components/UI/Buttons/ThemeToggle";
import Tooltip from "@/Components/UI/Tooltip/Tooltip";
import { Home, Search, Settings, Code2, Mail, Award } from "lucide-react";
import Link from "next/link";

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
          <Link
            href="#home"
            className="p-2 rounded hover:bg-white/20 transition"
          >
            <Home className="w-6 h-6 text-secondary" />
          </Link>
        </Tooltip>

        <Tooltip title="About Me">
          <Link
            href="#about"
            className="p-2 rounded hover:bg-white/20 transition"
          >
            <Search className="w-6 h-6 text-secondary" />
          </Link>
        </Tooltip>

        <Tooltip title="Skills">
          <Link
            href="#skills"
            className="p-2 rounded hover:bg-white/20 transition"
          >
            <Code2 className="w-6 h-6 text-secondary" />
          </Link>
        </Tooltip>

        <Tooltip title="Projects">
          <Link
            href="#projects"
            className="p-2 rounded hover:bg-white/20 transition"
          >
            <Settings className="w-6 h-6 text-secondary" />
          </Link>
        </Tooltip>

        <Tooltip title="Certificates">
          <Link
            href="#certificates"
            className="p-2 rounded hover:bg-white/20 transition"
          >
            <Award className="w-6 h-6 text-secondary" />
          </Link>
        </Tooltip>

        <Tooltip title="Get In Touch">
          <Link
            href="#getintouch"
            className="p-2 rounded hover:bg-white/20 transition"
          >
            <Mail className="w-6 h-6 text-secondary" />
          </Link>
        </Tooltip>

        <Tooltip title="Theme">
          <ThemeToggle />
        </Tooltip>
      </div>
    </header>
  );
};

export default Header;
