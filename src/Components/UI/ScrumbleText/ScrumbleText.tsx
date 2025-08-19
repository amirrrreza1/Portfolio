"use client";

import React, { useEffect, useRef, useState } from "react";

type Props = {
  text: string;
  speed?: number;
  scrambleChars?: string;
  className?: string;
  delayBeforeFix?: number;
};

const ScrambleText: React.FC<Props> = ({
  text,
  speed = 50,
  scrambleChars = "!@#$%^&*()_+-=<>?/[]{}abcdefghijklmnopqrstuvwxyz",
  className = "",
  delayBeforeFix = 1000,
}) => {
  const [displayed, setDisplayed] = useState<string>("");
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            let delayPassed = false;

            const delayInterval = setInterval(() => {
              const scrambled = text
                .split("")
                .map(
                  () =>
                    scrambleChars[
                      Math.floor(Math.random() * scrambleChars.length)
                    ]
                )
                .join("");
              setDisplayed(scrambled);
            }, speed);

            const delayTimer = setTimeout(() => {
              delayPassed = true;
              setStarted(true);
              clearInterval(delayInterval);
            }, delayBeforeFix);

            observer.disconnect();

            return () => {
              clearInterval(delayInterval);
              clearTimeout(delayTimer);
            };
          }
        });
      },
      { threshold: 0.2 }
    );

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [text, scrambleChars, delayBeforeFix, speed]);

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
      {displayed}
    </span>
  );
};

export default ScrambleText;
