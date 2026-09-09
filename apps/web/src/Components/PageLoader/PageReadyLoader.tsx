"use client";

import { useEffect, useState } from "react";

import CodeLoaderVisual from "./CodeLoaderVisual";

const MINIMUM_VISIBLE_MS = 650;
const SAFETY_TIMEOUT_MS = 6_000;
const EXIT_DURATION_MS = 360;

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function waitForWindowLoad(): Promise<void> {
  if (document.readyState === "complete") return Promise.resolve();

  return new Promise((resolve) => {
    window.addEventListener("load", () => resolve(), { once: true });
  });
}

async function waitForFonts(): Promise<void> {
  if (!("fonts" in document)) return;
  await document.fonts.ready;
}

function waitForRubikFrame(signal: AbortSignal): Promise<void> {
  const rubik = document.querySelector<HTMLElement>("[data-rubik-canvas]");
  if (rubik === null || rubik.dataset.ready === "true") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const finish = () => {
      observer.disconnect();
      resolve();
    };
    const observer = new MutationObserver(() => {
      if (rubik.dataset.ready !== "true") return;
      finish();
    });

    observer.observe(rubik, {
      attributes: true,
      attributeFilter: ["data-ready"],
    });
    signal.addEventListener("abort", finish, { once: true });
  });
}

function prefersReducedMotion(): boolean {
  const preference = document.documentElement.dataset.motion;
  return (
    preference === "reduced" ||
    (preference === "system" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  );
}

export default function PageReadyLoader() {
  const [state, setState] = useState<"loading" | "leaving">("loading");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let active = true;
    let finishing = false;
    let exitTimer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = performance.now();
    const readinessController = new AbortController();
    const safetyTimer = setTimeout(() => finish(), SAFETY_TIMEOUT_MS);

    document.documentElement.dataset.pageLoading = "true";
    document.body.setAttribute("aria-busy", "true");

    function releasePage() {
      delete document.documentElement.dataset.pageLoading;
      document.body.removeAttribute("aria-busy");
    }

    function finish() {
      if (!active || finishing) return;
      finishing = true;
      clearTimeout(safetyTimer);
      readinessController.abort();

      const remaining = Math.max(
        0,
        MINIMUM_VISIBLE_MS - (performance.now() - startedAt)
      );

      exitTimer = setTimeout(() => {
        if (!active) return;
        setState("leaving");
        exitTimer = setTimeout(
          () => {
            if (!active) return;
            releasePage();
            setVisible(false);
          },
          prefersReducedMotion() ? 0 : EXIT_DURATION_MS
        );
      }, remaining);
    }

    void Promise.all([
      waitForWindowLoad(),
      waitForFonts(),
      waitForRubikFrame(readinessController.signal),
    ])
      .then(nextPaint)
      .then(finish)
      .catch(finish);

    return () => {
      active = false;
      clearTimeout(safetyTimer);
      readinessController.abort();
      if (exitTimer !== undefined) clearTimeout(exitTimer);
      releasePage();
    };
  }, []);

  if (!visible) return null;
  return <CodeLoaderVisual state={state} />;
}
