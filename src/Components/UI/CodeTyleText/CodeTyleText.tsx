"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { CodeStyleTextProps } from "./Types";

const CodeStyleText: React.FC<CodeStyleTextProps> = ({
  strings,
  typingSpeed = 70,
  deletingSpeed = 40,
  pauseBetween = 1200,
  loop = true,
  className = "",
  cursorClassName = "",
}) => {
  const [text, setText] = useState("");
  const [strIndex, setStrIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const timerRef = useRef<number | null>(null);

  const safeStrings = useMemo(() => {
    return strings?.length ? strings : [""];
  }, [strings]);

  useEffect(() => {
    const full = safeStrings[strIndex % safeStrings.length];

    const stepDelay = isDeleting ? deletingSpeed : typingSpeed;

    const doStep = () => {
      if (!isDeleting) {
        const next = full.slice(0, text.length + 1);
        setText(next);

        if (next === full) {
          if (loop || strIndex < safeStrings.length - 1) {
            timerRef.current = window.setTimeout(() => {
              setIsDeleting(true);
            }, pauseBetween);
            return;
          }
          return;
        }
      } else {
        const next = full.slice(0, Math.max(0, text.length - 1));
        setText(next);

        if (next === "") {
          setIsDeleting(false);
          const nextIndex = loop
            ? (strIndex + 1) % safeStrings.length
            : Math.min(strIndex + 1, safeStrings.length - 1);
          setStrIndex(nextIndex);

          if (!loop && nextIndex === safeStrings.length - 1) {
          }
        }
      }
    };

    timerRef.current = window.setTimeout(doStep, stepDelay);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [
    text,
    isDeleting,
    strIndex,
    safeStrings,
    typingSpeed,
    deletingSpeed,
    pauseBetween,
    loop,
  ]);

  const full = safeStrings[strIndex % safeStrings.length];
  const finishedNoLoop =
    !loop && text === full && strIndex === safeStrings.length - 1;

  return (
    <span className={className} role="text">
      <span>{text}</span>
      <span
        className={`typewriter-cursor ${cursorClassName}`}
        aria-hidden="true"
        style={{ visibility: finishedNoLoop ? "hidden" : "visible" }}
      >
        |
      </span>
    </span>
  );
};

export default CodeStyleText;
