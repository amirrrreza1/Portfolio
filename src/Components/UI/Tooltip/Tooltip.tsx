"use client";

import { ReactNode, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface TooltipProps {
  title: string;
  children: ReactNode;
}

const Tooltip = ({ title, children }: TooltipProps) => {
  const [show, setShow] = useState(false);

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
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50"
          >
            <div className="relative px-2 py-1 text-xs rounded-md bg-secondary text-white dark:text-primary whitespace-nowrap shadow-md">
              {title}
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-secondary"></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Tooltip;
