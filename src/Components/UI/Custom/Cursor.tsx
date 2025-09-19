"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export default function CustomCursor() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [clicked, setClicked] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const move = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    const down = () => setClicked(true);
    const up = () => setClicked(false);

    window.addEventListener("mousemove", move);
    window.addEventListener("mousedown", down);
    window.addEventListener("mouseup", up);

    const buttons = document.querySelectorAll("button, a");
    buttons.forEach((el) => {
      el.addEventListener("mouseenter", () => setHovered(true));
      el.addEventListener("mouseleave", () => setHovered(false));
    });

    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mousedown", down);
      window.removeEventListener("mouseup", up);
      buttons.forEach((el) => {
        el.removeEventListener("mouseenter", () => setHovered(true));
        el.removeEventListener("mouseleave", () => setHovered(false));
      });
    };
  }, []);

  const isActive = clicked || hovered;

  return (
    <>
      <motion.div
        className="fixed top-0 left-0 rounded-full bg-secondary pointer-events-none z-[999]"
        animate={{
          x: pos.x - (isActive ? 12 : 4),
          y: pos.y - (isActive ? 12 : 4),
          width: isActive ? 24 : 8,
          height: isActive ? 24 : 8,
        }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />

      <motion.div
        className="fixed top-0 left-0 w-6 h-6 rounded-full border-2 border-secobg-secondary pointer-events-none z-40"
        animate={{
          x: pos.x - 12,
          y: pos.y - 12,
        }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
      />
    </>
  );
}
