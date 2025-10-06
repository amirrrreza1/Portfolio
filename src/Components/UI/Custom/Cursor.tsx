"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export default function CustomCursor() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [clicked, setClicked] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [isPointerFine, setIsPointerFine] = useState(false);

  useEffect(() => {
    const checkPointer = () => {
      const mediaQuery = window.matchMedia(
        "(pointer: fine) and (hover: hover)"
      );
      setIsPointerFine(mediaQuery.matches);

      const listener = (e: MediaQueryListEvent) => setIsPointerFine(e.matches);
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    };

    return checkPointer();
  }, []);

  useEffect(() => {
    if (!isPointerFine) return;

    const move = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    const down = () => setClicked(true);
    const up = () => setClicked(false);

    window.addEventListener("mousemove", move);
    window.addEventListener("mousedown", down);
    window.addEventListener("mouseup", up);

    const buttons = document.querySelectorAll("button, a");
    const enter = () => setHovered(true);
    const leave = () => setHovered(false);

    buttons.forEach((el) => {
      el.addEventListener("mouseenter", enter);
      el.addEventListener("mouseleave", leave);
    });

    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mousedown", down);
      window.removeEventListener("mouseup", up);
      buttons.forEach((el) => {
        el.removeEventListener("mouseenter", enter);
        el.removeEventListener("mouseleave", leave);
      });
    };
  }, [isPointerFine]);

  if (!isPointerFine) return null;

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
        className="fixed top-0 left-0 w-6 h-6 rounded-full border-2 border-secondary pointer-events-none z-40"
        animate={{
          x: pos.x - 12,
          y: pos.y - 12,
        }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
      />
    </>
  );
}
