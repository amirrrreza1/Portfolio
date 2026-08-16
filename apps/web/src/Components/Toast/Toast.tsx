"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { createPortal } from "react-dom";

type ToastProps = { id: number; message: string };

const ToastContext = createContext<(msg: string) => void>(() => {});

let id = 0;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const push = (message: string) => {
    const tid = ++id;
    setToasts((p) => [...p, { id: tid, message }]);

    setTimeout(() => {
      setToasts((p) => p.filter((t) => t.id !== tid));
    }, 3000 + 300);
  };

  return (
    <ToastContext.Provider value={push}>
      {children}

      {mounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="pointer-events-none fixed right-3 bottom-3 z-50 space-y-2">
            {toasts.map((t) => (
              <Toast key={t.id} message={t.message} />
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);

const Toast = ({ message }: { message: string }) => {
  const [exit, setExit] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setExit(true), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`bg-primary text-bg px-4 py-2 text-sm shadow-md ${
        exit ? "toast-out" : "toast-in"
      } pointer-events-auto select-none`}
    >
      {message}
    </div>
  );
};
