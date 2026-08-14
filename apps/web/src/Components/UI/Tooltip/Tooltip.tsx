"use client";

import { useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TooltipProps } from "./Types";

const hoverMediaQuery = "(hover: hover) and (pointer: fine)";

function subscribeToHoverCapability(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(hoverMediaQuery);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getHoverCapability() {
  return window.matchMedia(hoverMediaQuery).matches;
}

function getServerHoverCapability() {
  return false;
}

const Tooltip = ({ title, children }: TooltipProps) => {
  const [show, setShow] = useState(false);
  const canHover = useSyncExternalStore(
    subscribeToHoverCapability,
    getHoverCapability,
    getServerHoverCapability
  );

  if (!canHover) return <>{children}</>;

  return (
    <div
      className="relative flex items-center justify-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2"
          >
            <div className="bg-secondary dark:text-primary relative rounded-md px-2 py-1 text-xs whitespace-nowrap text-white shadow-md">
              {title}
              <div className="bg-secondary absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45"></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Tooltip;
