"use client";

import React, { useEffect, useRef, useState } from "react";
import { ScrumbleTextProps } from "./Types";

const ScrambleText: React.FC<ScrumbleTextProps> = ({
  text,
  speed = 50,
  scrambleChars = "!@#$%^&*()_+-=<>?/[]{}abcdefghijklmnopqrstuvwxyz",
  className = "",
  delayBeforeFix = 1000,
}) => {
  const [displayed, setDisplayed] = useState<string>("");
  const [visible, setVisible] = useState(false);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: "0px 0px -1% 0px" }
    );

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;

    const delayInterval = setInterval(() => {
      const scrambled = text
        .split("")
        .map(
          () => scrambleChars[Math.floor(Math.random() * scrambleChars.length)]
        )
        .join("");
      setDisplayed(scrambled);
    }, speed);

    const delayTimer = setTimeout(() => {
      setStarted(true);
      clearInterval(delayInterval);
    }, delayBeforeFix);

    return () => {
      clearInterval(delayInterval);
      clearTimeout(delayTimer);
    };
  }, [visible, text, scrambleChars, delayBeforeFix, speed]);

  useEffect(() => {
    if (!started) return;

    let frame = 0;
    const maxFrames = text.length * 3;

    const interval = setInterval(() => {
      frame++;
      const progress = Math.min(frame / maxFrames, 1);

      const revealedCount = Math.floor(progress * text.length);
      const revealed = text.slice(0, revealedCount);

      const scrambled = text
        .slice(revealedCount)
        .split("")
        .map(
          () => scrambleChars[Math.floor(Math.random() * scrambleChars.length)]
        )
        .join("");

      setDisplayed(revealed + scrambled);

      if (progress === 1) {
        clearInterval(interval);
        setDisplayed(text);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [started, text, speed, scrambleChars]);

  return (
    <span ref={ref} className={className}>
      {visible ? displayed : ""}
    </span>
  );
};

export default ScrambleText;
