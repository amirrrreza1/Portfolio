"use client";

import ThemeToggle from "@/Components/UI/Buttons/ThemeToggle";
import Tooltip from "@/Components/UI/Tooltip/Tooltip";
import { Home, Search, Settings } from "lucide-react";

const Header = () => {
  return (
    <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
      <div
        className="flex items-center gap-4 px-6 py-2
        backdrop-blur-[5px] bg-secondary/20 rounded
        border border-secondary/20 
        shadow-lg"
      >
        <Tooltip title="Home">
          <button className="p-2 rounded hover:bg-white/20 transition">
            <Home className="w-6 h-6 text-secondary" />
          </button>
        </Tooltip>

        <Tooltip title="Search">
          <button className="p-2 rounded hover:bg-white/20 transition">
            <Search className="w-6 h-6 text-secondary" />
          </button>
        </Tooltip>

        <Tooltip title="Settings">
          <button className="p-2 rounded hover:bg-white/20 transition">
            <Settings className="w-6 h-6 text-secondary" />
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
