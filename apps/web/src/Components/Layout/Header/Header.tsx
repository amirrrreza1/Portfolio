"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { scrollToSection } from "@/Components/SmoothScroll/SmoothScroll";
import ThemeToggle from "@/Components/UI/Buttons/ThemeToggle";
import AppearanceSettingsDialog from "@/Components/Appearance/AppearanceSettingsDialog";
import Tooltip from "@/Components/UI/Tooltip/Tooltip";
import { Home, Search, Settings, Code2, Mail, Award } from "lucide-react";

const Header = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <header className="fixed top-5 right-0 left-0 z-50 h-15 w-full">
      <div className="bg-secondary/20 border-secondary/20 mx-auto flex w-fit items-center gap-2 rounded border px-2 py-2 shadow-lg backdrop-blur-[5px] md:gap-4 md:px-4">
        <Tooltip title="Home">
          <button
            onClick={() => scrollToSection("#home")}
            className="rounded p-2 transition hover:bg-white/20"
          >
            <Home className="text-secondary h-6 w-6" />
          </button>
        </Tooltip>

        <Tooltip title="About Me">
          <button
            onClick={() => scrollToSection("#about")}
            className="rounded p-2 transition hover:bg-white/20"
          >
            <Search className="text-secondary h-6 w-6" />
          </button>
        </Tooltip>

        <Tooltip title="Skills">
          <button
            onClick={() => scrollToSection("#skills")}
            className="rounded p-2 transition hover:bg-white/20"
          >
            <Code2 className="text-secondary h-6 w-6" />
          </button>
        </Tooltip>

        <Tooltip title="Get In Touch">
          <button
            onClick={() => scrollToSection("#getintouch")}
            className="rounded p-2 transition hover:bg-white/20"
          >
            <Mail className="text-secondary h-6 w-6" />
          </button>
        </Tooltip>

        <Tooltip title="Projects">
          <button
            onClick={() => scrollToSection("#projects")}
            className="rounded p-2 transition hover:bg-white/20"
          >
            <Settings className="text-secondary h-6 w-6" />
          </button>
        </Tooltip>

        <Tooltip title="Certificates">
          <button
            onClick={() => scrollToSection("#certificates")}
            className="rounded p-2 transition hover:bg-white/20"
          >
            <Award className="text-secondary h-6 w-6" />
          </button>
        </Tooltip>

        <Tooltip title="Theme">
          <ThemeToggle />
        </Tooltip>
        <AppearanceSettingsDialog />
      </div>
    </header>,
    document.body
  );
};

export default Header;
