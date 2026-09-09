"use client";

import { useState } from "react";

import AdminBlogEditor from "./AdminBlogEditor";
import AdminCollectionsEditor from "./AdminCollectionsEditor";
import AdminHistoryEditor from "./AdminHistoryEditor";
import AdminMediaEditor from "./AdminMediaEditor";
import AdminPortfolioEditor from "./AdminPortfolioEditor";

const VIEWS = [
  { key: "portfolio", label: "Site and structure" },
  { key: "collections", label: "Portfolio collections" },
  { key: "blog", label: "Articles" },
  { key: "media", label: "Media and resume" },
  { key: "history", label: "History and access" },
] as const;

type View = (typeof VIEWS)[number]["key"];

export default function AdminContentWorkspace(): React.JSX.Element {
  const [view, setView] = useState<View>("portfolio");

  return (
    <section
      className="flex flex-col gap-6"
      aria-labelledby="content-workspace-title"
    >
      <div className="flex flex-col gap-2">
        <p className="text-text-muted font-mono text-xs tracking-widest uppercase">
          Portfolio control room
        </p>
        <h2 id="content-workspace-title" className="text-xl font-semibold">
          Content workspace
        </h2>
        <p className="text-text-muted max-w-3xl text-sm">
          Edit what visitors see, manage blog languages, and recover earlier
          versions without touching the database or source files.
        </p>
      </div>

      <nav
        aria-label="Content workspace sections"
        className="border-border bg-bg grid grid-cols-1 gap-1 rounded-lg border p-1 sm:grid-cols-2 lg:grid-cols-5"
      >
        {VIEWS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-current={view === item.key ? "page" : undefined}
            className={`focus-visible:ring-accent min-h-11 rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none ${
              view === item.key
                ? "bg-secondary text-text font-medium shadow-sm"
                : "text-text-muted hover:bg-secondary hover:text-text"
            }`}
            onClick={() => setView(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {view === "portfolio" ? <AdminPortfolioEditor /> : null}
      {view === "collections" ? <AdminCollectionsEditor /> : null}
      {view === "blog" ? <AdminBlogEditor /> : null}
      {view === "media" ? <AdminMediaEditor /> : null}
      {view === "history" ? <AdminHistoryEditor /> : null}
    </section>
  );
}
