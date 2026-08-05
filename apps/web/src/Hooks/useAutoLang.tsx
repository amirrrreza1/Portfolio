import { useEffect, useRef } from "react";

export function useAutoLang<
  T extends HTMLInputElement | HTMLTextAreaElement
>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handler = () =>
      el.setAttribute("lang", /[\u0600-\u06FF]/.test(el.value) ? "fa" : "en");

    el.addEventListener("input", handler);
    return () => el.removeEventListener("input", handler);
  }, []);

  return ref;
}
