"use client";

import { suggestSlug } from "@portfolio/contracts/common";
import { CURRENT_FRONTMATTER_VERSION } from "@portfolio/contracts/content";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  adminRequest,
  adminUpload,
  describeAdminError,
  AdminRequestError,
} from "./admin-client";
import {
  EditorStatus,
  Field,
  inputClass,
  LocaleBadge,
  ResourceHeading,
  SaveButton,
} from "./AdminEditorFields";
import { formatUtc } from "./format";

type Locale = "en" | "fa";

type PostSummary = {
  readonly id: string;
  readonly featured: boolean;
  readonly archivedAt: string | null;
  readonly updatedAt: string;
  readonly category: string | null;
  readonly tags: readonly string[];
  readonly translations: readonly {
    readonly locale: Locale;
    readonly title: string;
    readonly slug: string;
    readonly status: string;
    readonly publishedAt: string | null;
    readonly scheduledFor: string | null;
    readonly version: number;
    readonly updatedAt: string;
  }[];
};

type Translation = {
  readonly id: string;
  readonly postId: string;
  readonly locale: Locale;
  readonly title: string;
  readonly slug: string;
  readonly excerpt: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly canonicalUrl: string | null;
  readonly socialImageId: string | null;
  readonly status: string;
  readonly publishedAt: string | null;
  readonly scheduledFor: string | null;
  readonly bodyMarkdown: string | null;
  readonly version: number;
  readonly category: string | null;
  readonly tags: readonly string[];
  readonly coverImage: string | null;
  readonly draft: {
    readonly bodyMarkdown: string;
    readonly updatedAt: string;
    readonly aheadOfSave: boolean;
  } | null;
};

type Checklist = {
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
};

type ImportReport = {
  readonly reportToken: string;
  readonly accepted: boolean;
  readonly findings: readonly {
    readonly severity: "error" | "warning" | "info";
    readonly line: number | null;
    readonly code: string;
    readonly message: string;
  }[];
  readonly normalizedFrontmatter: {
    readonly postId: string;
    readonly locale: Locale;
    readonly title: string;
    readonly slug: string;
    readonly excerpt: string;
  } | null;
  readonly normalizedDocument: string | null;
  readonly diff: string;
  readonly quarantinedSourceId: string;
  readonly expiresAt: string;
};

type RevisionSummary = {
  readonly id: string;
  readonly action: string;
  readonly entityVersion: number;
  readonly createdAt: string;
  readonly actorName: string | null;
  readonly title: string | null;
  readonly slug: string | null;
  readonly status: string | null;
  readonly restorable: boolean;
  readonly refusal: string | null;
};

type RevisionHistory = {
  readonly translationId: string;
  readonly currentVersion: number;
  readonly status: string;
  readonly revisions: readonly RevisionSummary[];
};

type RevisionComparison = {
  readonly id: string;
  readonly revisionVersion: number;
  readonly currentVersion: number;
  readonly restorable: boolean;
  readonly document: string;
  readonly diff: string;
};

type Taxonomy = {
  readonly id: string;
  readonly key: string;
  readonly enabled: boolean;
  readonly version: number;
};

/**
 * The directive palette.
 *
 * Every entry here is a directive `@portfolio/markdown` actually validates —
 * name, required attributes, and allowed values all come from
 * `validateDirectives`. A palette that offered anything else would be a way to
 * write a body that fails to render, which is precisely what a palette exists
 * to prevent.
 */
const DIRECTIVES = [
  {
    label: "Callout",
    snippet: ':::callout{type="note" title="Title"}\nBody text.\n:::\n',
  },
  {
    label: "Figure",
    snippet:
      '::figure{src="/media/example.webp" alt="Describe the image" caption="Caption"}\n',
  },
  {
    label: "Video",
    snippet:
      '::video{provider="youtube" id="VIDEO_ID" title="Describe the video"}\n',
  },
  {
    label: "Details",
    snippet: ':::details{summary="Show more"}\nHidden content.\n:::\n',
  },
  { label: "Steps", snippet: ":::steps\n1. First step\n2. Second step\n:::\n" },
] as const;

const AUTOSAVE_DELAY_MS = 2_000;

export default function AdminBlogEditor(): React.JSX.Element {
  const [posts, setPosts] = useState<readonly PostSummary[] | null>(null);
  const [categories, setCategories] = useState<readonly Taxonomy[]>([]);
  const [tags, setTags] = useState<readonly Taxonomy[]>([]);
  const [selected, setSelected] = useState<{
    readonly postId: string;
    readonly locale: Locale;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextPosts, nextCategories, nextTags] = await Promise.all([
        adminRequest<readonly PostSummary[]>("/admin/blog/posts"),
        adminRequest<readonly Taxonomy[]>("/admin/blog/categories"),
        adminRequest<readonly Taxonomy[]>("/admin/blog/tags"),
      ]);
      setPosts(nextPosts);
      setCategories(nextCategories);
      setTags(nextTags);
      setFailed(false);
    } catch (error) {
      setMessage(describeAdminError(error));
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = useCallback(
    async (action: () => Promise<unknown>, success: string) => {
      if (busy) return;
      setBusy(true);
      setMessage(null);
      try {
        await action();
        await load();
        setMessage(success);
        setFailed(false);
      } catch (error) {
        setMessage(describeBlogError(error));
        setFailed(true);
      } finally {
        setBusy(false);
      }
    },
    [busy, load]
  );

  if (posts === null) {
    return (
      <EditorStatus message={message ?? "Loading articles…"} error={failed} />
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 border p-4">
        <div>
          <p className="font-semibold">Article workspace</p>
          <p className="text-text-muted text-sm">
            {posts.length} posts · {categories.length} categories ·{" "}
            {tags.length} tags
          </p>
        </div>
        <div data-testid="blog-workspace-status">
          <EditorStatus message={message} error={failed} />
        </div>
      </div>

      <PostList
        posts={posts}
        selected={selected}
        onSelect={setSelected}
        busy={busy}
      />

      <ImportPanel
        posts={posts}
        busy={busy}
        mutate={mutate}
        onImported={setSelected}
      />

      {selected === null ? (
        <p className="text-text-muted text-sm">
          Choose a translation above to edit it, or start a new article.
        </p>
      ) : (
        <TranslationEditor
          key={`${selected.postId}:${selected.locale}`}
          postId={selected.postId}
          locale={selected.locale}
          categories={categories}
          tags={tags}
          busy={busy}
          mutate={mutate}
        />
      )}

      <TaxonomyEditor
        categories={categories}
        tags={tags}
        busy={busy}
        mutate={mutate}
      />
    </div>
  );
}

function PostList({
  posts,
  selected,
  onSelect,
  busy,
}: {
  readonly posts: readonly PostSummary[];
  readonly selected: {
    readonly postId: string;
    readonly locale: Locale;
  } | null;
  readonly onSelect: (
    value: { readonly postId: string; readonly locale: Locale } | null
  ) => void;
  readonly busy: boolean;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-5">
      <ResourceHeading
        title="Articles"
        description="Each language has its own editorial state. Publishing English does not publish Persian, and neither blocks the other."
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="border-border border px-4 py-2 text-sm disabled:opacity-50"
          onClick={() =>
            // A new article needs an ID before it has anything else, because
            // the ID is what its two translations are joined by. It is minted
            // here rather than by the server so that both locales of a brand
            // new post can be drafted before either is ever saved.
            onSelect({ postId: crypto.randomUUID(), locale: "en" })
          }
        >
          Start a new article
        </button>
      </div>
      {posts.length === 0 ? (
        <p className="text-text-muted text-sm">No articles exist yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((post) => (
            <li className="border-border border p-4" key={post.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {post.translations[0]?.title ?? "Untitled article"}
                  </p>
                  <p className="text-text-muted font-mono text-xs">
                    {post.category ?? "no category"} ·{" "}
                    {post.tags.length === 0 ? "no tags" : post.tags.join(", ")}{" "}
                    · updated {formatUtc(post.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(["en", "fa"] as const).map((locale) => {
                    const translation = post.translations.find(
                      (item) => item.locale === locale
                    );
                    const active =
                      selected?.postId === post.id &&
                      selected.locale === locale;
                    return (
                      <button
                        key={locale}
                        type="button"
                        aria-current={active ? "true" : undefined}
                        className={`border px-3 py-2 text-sm ${
                          active
                            ? "border-accent text-accent font-semibold"
                            : "border-border"
                        }`}
                        onClick={() => onSelect({ postId: post.id, locale })}
                      >
                        {locale.toUpperCase()}
                        <span className="text-text-muted ml-2 font-mono text-xs">
                          {translation?.status.toLowerCase() ?? "new"}
                        </span>
                      </button>
                    );
                  })}
                  <LocaleBadge
                    locale="fa"
                    present={post.translations.some(
                      (item) => item.locale === "fa"
                    )}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ImportPanel({
  posts,
  busy,
  mutate,
  onImported,
}: {
  readonly posts: readonly PostSummary[];
  readonly busy: boolean;
  readonly mutate: (
    action: () => Promise<unknown>,
    success: string
  ) => Promise<void>;
  readonly onImported: (value: {
    readonly postId: string;
    readonly locale: Locale;
  }) => void;
}): React.JSX.Element {
  const [review, setReview] = useState<{
    readonly report: ImportReport;
    readonly requestedPostId: string | null;
    readonly locale: Locale;
  } | null>(null);

  return (
    <section className="flex flex-col gap-5" data-testid="blog-import">
      <ResourceHeading
        title="Import Markdown"
        description="The first step only parses and reports. The exact upload is retained privately in quarantine; nothing reaches an article until you review the normalized Markdown and confirm its report token."
      />
      <form
        className="border-border grid gap-4 border p-4 md:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const file = form.get("file");
          if (!(file instanceof File) || file.size === 0) return;
          const requestedPostId = String(form.get("postId") ?? "").trim();
          const locale = String(form.get("locale") ?? "en") as Locale;
          // Fields precede the file so Fastify can expose them while streaming
          // the single bounded file instead of buffering an unbounded form.
          const upload = new FormData();
          upload.append("postId", requestedPostId);
          upload.append("locale", locale);
          upload.append("file", file, file.name);
          void mutate(async () => {
            const report = await adminUpload<ImportReport>(
              "/admin/blog/import",
              upload
            );
            setReview({
              report,
              requestedPostId:
                requestedPostId.length === 0 ? null : requestedPostId,
              locale,
            });
          }, "Import dry run ready for review. No article was changed.");
        }}
      >
        <Field
          label="Markdown or MDX file"
          hint="Maximum 512 KiB. Executable MDX, raw HTML, and unsafe URLs are rejected with line findings."
        >
          <input
            className={inputClass}
            name="file"
            type="file"
            accept=".md,.markdown,.mdx,text/markdown"
            required
          />
        </Field>
        <Field
          label="Article target"
          hint="Choose an existing post, or let valid frontmatter/new inference supply the ID."
        >
          <select className={inputClass} name="postId" defaultValue="">
            <option value="">New article or frontmatter target</option>
            {posts.map((post) => (
              <option key={post.id} value={post.id}>
                {post.translations[0]?.title ?? post.id}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Translation locale">
          <select className={inputClass} name="locale" defaultValue="en">
            <option value="en">English</option>
            <option value="fa">Persian</option>
          </select>
        </Field>
        <div className="md:col-span-3">
          <SaveButton busy={busy}>Parse and review</SaveButton>
        </div>
      </form>

      {review === null ? null : (
        <div className="border-border flex flex-col gap-4 border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="font-semibold">
                {review.report.accepted
                  ? "Dry run accepted"
                  : "Dry run needs changes"}
              </h4>
              <p className="text-text-muted text-xs">
                Original retained as {review.report.quarantinedSourceId} ·
                report expires {formatUtc(review.report.expiresAt)}
              </p>
            </div>
            {review.report.accepted &&
            review.report.normalizedFrontmatter !== null ? (
              <button
                type="button"
                disabled={busy}
                className="border-success text-success border px-4 py-2 text-sm disabled:opacity-40"
                onClick={() => {
                  if (
                    !window.confirm(
                      "Save exactly this normalized import through the article transaction?"
                    )
                  ) {
                    return;
                  }
                  void mutate(async () => {
                    await adminRequest("/admin/blog/import", {
                      method: "POST",
                      mutation: true,
                      body: {
                        postId: review.requestedPostId,
                        locale: review.locale,
                        confirm: true,
                        reportToken: review.report.reportToken,
                      },
                    });
                    onImported({
                      postId: review.report.normalizedFrontmatter!.postId,
                      locale: review.locale,
                    });
                    setReview(null);
                  }, "Normalized Markdown imported and saved as a new article revision.");
                }}
              >
                Confirm and save
              </button>
            ) : null}
          </div>

          {review.report.findings.length === 0 ? (
            <p className="text-success text-sm">No normalization findings.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {review.report.findings.map((finding, index) => (
                <li
                  key={`${finding.code}:${finding.line ?? "document"}:${index}`}
                  className={
                    finding.severity === "error"
                      ? "text-danger"
                      : finding.severity === "warning"
                        ? "text-accent"
                        : "text-text-muted"
                  }
                >
                  <span className="font-mono text-xs">
                    {finding.severity.toUpperCase()} · {finding.code}
                    {finding.line === null ? "" : ` · line ${finding.line}`}
                  </span>
                  <span className="ml-2">{finding.message}</span>
                </li>
              ))}
            </ul>
          )}

          {review.report.normalizedFrontmatter === null ? null : (
            <dl className="grid gap-2 text-sm md:grid-cols-2">
              {(
                [
                  ["Title", review.report.normalizedFrontmatter.title],
                  ["Slug", review.report.normalizedFrontmatter.slug],
                  ["Excerpt", review.report.normalizedFrontmatter.excerpt],
                  ["Post ID", review.report.normalizedFrontmatter.postId],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-text-muted text-xs">{label}</dt>
                  <dd className={label === "Post ID" ? "font-mono" : ""}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {review.report.normalizedDocument === null ? null : (
            <details>
              <summary className="cursor-pointer text-sm font-semibold">
                Normalized Markdown
              </summary>
              <pre className="border-border bg-surface mt-3 max-h-96 overflow-auto border p-3 text-xs whitespace-pre-wrap">
                {review.report.normalizedDocument}
              </pre>
            </details>
          )}
          {review.report.accepted ? (
            <details open>
              <summary className="cursor-pointer text-sm font-semibold">
                Exact save diff
              </summary>
              <pre className="border-border bg-surface mt-3 max-h-96 overflow-auto border p-3 text-xs whitespace-pre-wrap">
                {review.report.diff || "No content changes."}
              </pre>
            </details>
          ) : null}
        </div>
      )}
    </section>
  );
}

function TranslationEditor({
  postId,
  locale,
  categories,
  tags,
  busy,
  mutate,
}: {
  readonly postId: string;
  readonly locale: Locale;
  readonly categories: readonly Taxonomy[];
  readonly tags: readonly Taxonomy[];
  readonly busy: boolean;
  readonly mutate: (
    action: () => Promise<unknown>,
    success: string
  ) => Promise<void>;
}): React.JSX.Element {
  const [translation, setTranslation] = useState<Translation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [category, setCategory] = useState("");
  const [selectedTags, setSelectedTags] = useState<readonly string[]>([]);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [acknowledged, setAcknowledged] = useState<readonly string[]>([]);
  const [autosaveState, setAutosaveState] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const loadTranslation = useCallback(async () => {
    try {
      const value = await adminRequest<Translation>(
        `/admin/blog/posts/${postId}/translations/${locale}`
      );
      setTranslation(value);
      setTitle(value.title);
      setSlug(value.slug);
      setExcerpt(value.excerpt ?? "");
      setSeoDescription(value.seoDescription ?? "");
      setCategory(value.category ?? "");
      setSelectedTags(value.tags);
      // The committed body, never the draft. An autosave that silently became
      // the document is the one outcome an autosave must not produce, so the
      // draft is offered as an explicit restore below instead.
      setBody(value.bodyMarkdown ?? "");
      const nextChecklist = await adminRequest<Checklist>(
        `/admin/blog/posts/${postId}/translations/${locale}/checklist`
      );
      setChecklist(nextChecklist);
    } catch (error) {
      if (error instanceof AdminRequestError && error.code === "NOT_FOUND") {
        setTranslation(null);
        setChecklist(null);
      } else {
        setLocalError(describeAdminError(error));
      }
    } finally {
      setLoaded(true);
    }
  }, [postId, locale]);

  useEffect(() => {
    void loadTranslation();
  }, [loadTranslation]);

  /**
   * Autosave.
   *
   * Debounced, and deliberately silent about failure beyond a status line: an
   * autosave is a safety net, and a modal error every two seconds while the
   * API is briefly unreachable would be worse than the risk it guards against.
   * It writes `PostDraft` only and can never publish.
   */
  useEffect(() => {
    if (!loaded || body.length === 0) return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          setAutosaveState("Saving draft…");
          await adminRequest(
            `/admin/blog/posts/${postId}/translations/${locale}/draft`,
            {
              method: "PUT",
              mutation: true,
              body: { body, baseVersion: translation?.version ?? null },
            }
          );
          setAutosaveState(`Draft saved ${new Date().toLocaleTimeString()}`);
        } catch {
          setAutosaveState("Draft not saved — your text is still here.");
        }
      })();
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [body, loaded, postId, locale, translation?.version]);

  const frontmatter = useMemo(
    () => ({
      schemaVersion: CURRENT_FRONTMATTER_VERSION,
      postId,
      locale,
      title,
      slug,
      excerpt,
      status: (translation?.status ?? "DRAFT").toLowerCase(),
      publishedAt: translation?.publishedAt ?? null,
      scheduledFor: translation?.scheduledFor ?? null,
      seoTitle: translation?.seoTitle ?? null,
      seoDescription: seoDescription.length === 0 ? null : seoDescription,
      canonicalUrl: translation?.canonicalUrl ?? null,
      category: category.length === 0 ? null : category,
      tags: selectedTags,
      coverImage: translation?.coverImage ?? null,
      socialImage: translation?.socialImageId ?? null,
    }),
    [
      postId,
      locale,
      title,
      slug,
      excerpt,
      seoDescription,
      category,
      selectedTags,
      translation,
    ]
  );

  function insertDirective(snippet: string): void {
    const field = bodyRef.current;
    if (field === null) {
      setBody((current) => `${current}\n${snippet}`);
      return;
    }
    const start = field.selectionStart;
    const end = field.selectionEnd;
    setBody((current) => {
      const before = current.slice(0, start);
      const after = current.slice(end);
      // Every directive in the palette is a block construct, and a block that
      // starts mid-line is not a directive at all — remark reads it as literal
      // text and the author gets `:::callout{...}` printed in their article.
      // So the insertion opens its own line and leaves one after it.
      const lead = before.length === 0 || before.endsWith("\n") ? "" : "\n";
      const trail = after.startsWith("\n") || after.length === 0 ? "" : "\n";
      return `${before}${lead}${snippet}${trail}${after}`;
    });
    // Put the caret after what was inserted rather than at the top, which is
    // where React would otherwise leave it after a controlled re-render.
    requestAnimationFrame(() => {
      field.focus();
      const caret = start + snippet.length + 1;
      field.setSelectionRange(caret, caret);
    });
  }

  const version = translation?.version ?? null;

  async function openPreview(): Promise<void> {
    try {
      const preview = await adminRequest<{ readonly previewUrl: string }>(
        `/admin/blog/posts/${postId}/translations/${locale}/preview`,
        { method: "POST", mutation: true, body: { body, frontmatter } }
      );
      const token = preview.previewUrl.split("/").pop() ?? "";
      window.open(`/admin/blog/preview/${token}`, "_blank", "noopener");
    } catch (error) {
      setLocalError(describeAdminError(error));
    }
  }

  if (!loaded) return <EditorStatus message="Loading translation…" />;

  return (
    <section className="flex flex-col gap-5">
      <ResourceHeading
        title={`${locale.toUpperCase()} translation`}
        description="The body is Markdown with the directive set this site renders. Everything below is validated against the same contract the publish path uses."
      />

      {translation?.draft?.aheadOfSave === true ? (
        <aside
          className="border-accent flex flex-wrap items-center justify-between gap-3 border p-4"
          role="status"
        >
          <p className="text-sm">
            An autosaved draft from {formatUtc(translation.draft.updatedAt)} is
            newer than the saved article.
          </p>
          <button
            type="button"
            className="border-border border px-3 py-2 text-sm"
            onClick={() => setBody(translation.draft?.bodyMarkdown ?? body)}
          >
            Load the draft into the editor
          </button>
        </aside>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Title">
          <input
            className={inputClass}
            value={title}
            dir={locale === "fa" ? "rtl" : "ltr"}
            onChange={(event) => {
              const next = event.target.value;
              setTitle(next);
              // Only while the slug has never been set: an established slug is
              // a public URL, and silently rewriting it as the author edits a
              // typo in the title would break every existing link.
              if (
                translation === null &&
                slug.length === 0 &&
                next.length > 0
              ) {
                setSlug(suggestSlug(next, locale).slug);
              }
            }}
          />
        </Field>
        <Field
          label="Slug"
          hint="Changing a published slug leaves a 308 redirect from the old path."
        >
          <input
            className={inputClass}
            value={slug}
            dir={locale === "fa" ? "rtl" : "ltr"}
            onChange={(event) => setSlug(event.target.value)}
          />
        </Field>
        <Field label="Excerpt">
          <textarea
            className={inputClass}
            rows={3}
            value={excerpt}
            dir={locale === "fa" ? "rtl" : "ltr"}
            onChange={(event) => setExcerpt(event.target.value)}
          />
        </Field>
        <Field label="SEO description">
          <textarea
            className={inputClass}
            rows={3}
            value={seoDescription}
            dir={locale === "fa" ? "rtl" : "ltr"}
            onChange={(event) => setSeoDescription(event.target.value)}
          />
        </Field>
        <Field label="Category">
          <select
            className={inputClass}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">No category</option>
            {categories.map((item) => (
              <option key={item.id} value={item.key}>
                {item.key}
                {item.enabled ? "" : " (disabled)"}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="font-medium">Tags</legend>
          <div className="flex flex-wrap gap-2">
            {tags.length === 0 ? (
              <p className="text-text-muted">
                No tags exist yet. Create one below.
              </p>
            ) : (
              tags.map((item) => (
                <label
                  className="border-border flex items-center gap-2 border px-3 py-2"
                  key={item.id}
                >
                  <input
                    type="checkbox"
                    className="accent-accent h-4 w-4"
                    checked={selectedTags.includes(item.key)}
                    onChange={(event) =>
                      setSelectedTags((current) =>
                        event.target.checked
                          ? [...current, item.key]
                          : current.filter((key) => key !== item.key)
                      )
                    }
                  />
                  {item.key}
                </label>
              ))
            )}
          </div>
        </fieldset>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">Body</span>
          <div className="flex flex-wrap gap-2">
            {DIRECTIVES.map((directive) => (
              <button
                key={directive.label}
                type="button"
                className="border-border border px-3 py-1 text-xs"
                onClick={() => insertDirective(directive.snippet)}
              >
                {directive.label}
              </button>
            ))}
          </div>
        </div>
        <textarea
          ref={bodyRef}
          className={`${inputClass} font-mono`}
          rows={20}
          value={body}
          dir={locale === "fa" ? "rtl" : "ltr"}
          onChange={(event) => setBody(event.target.value)}
          aria-label="Article body in Markdown"
        />
        <p className="text-text-muted text-xs" aria-live="polite">
          {autosaveState ??
            "Autosave writes a private draft, never the article."}
        </p>
      </div>

      <ChecklistPanel
        checklist={checklist}
        acknowledged={acknowledged}
        onToggle={(warning, on) =>
          setAcknowledged((current) =>
            on
              ? [...current, warning]
              : current.filter((item) => item !== warning)
          )
        }
      />

      <EditorStatus message={localError} error={localError !== null} />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="bg-primary text-bg px-4 py-2 text-sm font-semibold disabled:opacity-60"
          onClick={() =>
            void mutate(async () => {
              await adminRequest(
                `/admin/blog/posts/${postId}/translations/${locale}`,
                {
                  method: "PUT",
                  mutation: true,
                  body: { frontmatter, body, baseVersion: version },
                }
              );
              await loadTranslation();
            }, "Article saved.")
          }
        >
          Save article
        </button>
        <button
          type="button"
          disabled={busy || body.length === 0}
          className="border-border border px-4 py-2 text-sm disabled:opacity-50"
          onClick={() => void openPreview()}
        >
          Preview
        </button>
        {translation === null ? null : (
          <TransitionButtons
            postId={postId}
            locale={locale}
            translation={translation}
            checklist={checklist}
            acknowledged={acknowledged}
            busy={busy}
            mutate={mutate}
            reload={loadTranslation}
          />
        )}
      </div>

      {translation === null ? null : (
        <RevisionHistoryPanel
          postId={postId}
          locale={locale}
          currentVersion={translation.version}
          busy={busy}
          mutate={mutate}
          reload={loadTranslation}
        />
      )}
    </section>
  );
}

/**
 * The article's own history, beside the article.
 *
 * The recovery ledger in "History and access" lists every revision the site
 * has, which is what recovering from a bad change across the whole CMS needs.
 * An author fixing one paragraph is doing something narrower, and asking them
 * to find their translation's row among every project and setting change is
 * how a restore turns into a guess. The restore itself is still the one
 * endpoint from API_SPEC §6 — only the reading is scoped here.
 *
 * A revision is compared before it can be restored, and the comparison is the
 * document the server says it would write, not a diff this panel assembles
 * from what it thinks a restore means.
 */
function RevisionHistoryPanel({
  postId,
  locale,
  currentVersion,
  busy,
  mutate,
  reload,
}: {
  readonly postId: string;
  readonly locale: Locale;
  readonly currentVersion: number;
  readonly busy: boolean;
  readonly mutate: (
    action: () => Promise<unknown>,
    success: string
  ) => Promise<void>;
  readonly reload: () => Promise<void>;
}): React.JSX.Element {
  const [history, setHistory] = useState<RevisionHistory | null>(null);
  const [comparison, setComparison] = useState<RevisionComparison | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const value = await adminRequest<RevisionHistory>(
          `/admin/blog/posts/${postId}/translations/${locale}/revisions`
        );
        if (!cancelled) {
          setHistory(value);
          setComparison(null);
        }
      } catch (loadError) {
        if (!cancelled) setError(describeAdminError(loadError));
      }
    })();
    return () => {
      cancelled = true;
    };
    // `currentVersion` is in the dependency list so every save, transition and
    // restore re-reads the history it just added a row to.
  }, [postId, locale, currentVersion]);

  if (history === null) {
    return (
      <EditorStatus
        message={error ?? "Loading history…"}
        error={error !== null}
      />
    );
  }

  return (
    <section className="flex flex-col gap-3" data-testid="revision-history">
      <ResourceHeading
        title="Version history"
        description="Every save and transition of this translation. Restoring replays the recorded Markdown through the normal save — it re-renders, writes a new revision, and never changes publication state."
      />
      <EditorStatus message={error} error={error !== null} />
      {history.revisions.length === 0 ? (
        <p className="text-text-muted text-sm">
          No revisions have been recorded for this translation yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {history.revisions.map((revision) => (
            <li
              key={revision.id}
              className="border-border flex flex-wrap items-center justify-between gap-3 border p-3 text-sm"
            >
              <span>
                <span className="font-semibold">
                  {revision.action.toLowerCase()}
                </span>{" "}
                <span className="font-mono text-xs">
                  v{revision.entityVersion}
                </span>
                {revision.title === null ? null : ` · ${revision.title}`}
                <span className="text-text-muted block text-xs">
                  {revision.actorName ?? "System"} ·{" "}
                  {formatUtc(revision.createdAt)}
                  {revision.restorable ? "" : ` · ${revision.refusal ?? ""}`}
                </span>
              </span>
              <span className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="border-border border px-3 py-1 text-xs"
                  onClick={() =>
                    void (async () => {
                      try {
                        setComparison(
                          await adminRequest<RevisionComparison>(
                            `/admin/blog/posts/${postId}/translations/${locale}/revisions/${revision.id}`
                          )
                        );
                        setError(null);
                      } catch (compareError) {
                        setError(describeAdminError(compareError));
                      }
                    })()
                  }
                >
                  Compare
                </button>
                <button
                  type="button"
                  disabled={busy || !revision.restorable}
                  className="border-border border px-3 py-1 text-xs disabled:opacity-50"
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Restore this translation to version ${revision.entityVersion}? This writes a new revision; nothing in the history is removed.`
                      )
                    ) {
                      return;
                    }
                    void mutate(async () => {
                      await adminRequest(
                        `/admin/revisions/${revision.id}/restore`,
                        {
                          method: "POST",
                          mutation: true,
                          body: { confirm: true },
                        }
                      );
                      await reload();
                    }, "Earlier version restored as a new revision.");
                  }}
                >
                  Restore this version
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      {comparison === null ? null : (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">What restoring would change</h4>
          <pre
            data-testid="revision-diff"
            className="bg-secondary max-h-72 overflow-auto p-3 text-xs whitespace-pre-wrap"
          >
            {comparison.diff.length === 0
              ? "This revision is identical to the current article."
              : comparison.diff}
          </pre>
        </div>
      )}
    </section>
  );
}

/**
 * The checklist, shown before the author commits to publishing.
 *
 * Blockers are stated and cannot be dismissed. Warnings each get their own
 * checkbox, because the API requires them acknowledged by name — a single
 * "I understand" would let an author confirm a list they never read, which is
 * the failure the per-warning contract was written to prevent.
 */
function ChecklistPanel({
  checklist,
  acknowledged,
  onToggle,
}: {
  readonly checklist: Checklist | null;
  readonly acknowledged: readonly string[];
  readonly onToggle: (warning: string, on: boolean) => void;
}): React.JSX.Element {
  if (checklist === null) {
    return (
      <p className="text-text-muted text-sm">
        The publish checklist appears once this translation has been saved.
      </p>
    );
  }
  return (
    <div
      className="border-border flex flex-col gap-3 border p-4"
      data-testid="publish-checklist"
    >
      <h4 className="font-semibold">Publish checklist</h4>
      {checklist.blockers.length === 0 ? (
        <p className="text-success text-sm">Nothing is blocking publication.</p>
      ) : (
        <ul className="text-danger flex flex-col gap-1 text-sm" role="alert">
          {checklist.blockers.map((blocker) => (
            <li key={blocker}>{humanize(blocker)}</li>
          ))}
        </ul>
      )}
      {checklist.warnings.length === 0 ? null : (
        <div className="flex flex-col gap-2">
          <p className="text-text-muted text-sm">
            Acknowledge each of these to publish anyway.
          </p>
          {checklist.warnings.map((warning) => (
            <label className="flex items-center gap-2 text-sm" key={warning}>
              <input
                type="checkbox"
                className="accent-accent h-4 w-4"
                checked={acknowledged.includes(warning)}
                onChange={(event) => onToggle(warning, event.target.checked)}
              />
              {humanize(warning)}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function TransitionButtons({
  postId,
  locale,
  translation,
  checklist,
  acknowledged,
  busy,
  mutate,
  reload,
}: {
  readonly postId: string;
  readonly locale: Locale;
  readonly translation: Translation;
  readonly checklist: Checklist | null;
  readonly acknowledged: readonly string[];
  readonly busy: boolean;
  readonly mutate: (
    action: () => Promise<unknown>,
    success: string
  ) => Promise<void>;
  readonly reload: () => Promise<void>;
}): React.JSX.Element {
  const base = `/admin/blog/posts/${postId}/translations/${locale}`;
  const blocked = (checklist?.blockers.length ?? 0) > 0;
  const published = translation.status === "PUBLISHED";

  function run(path: string, body: unknown, success: string): void {
    void mutate(async () => {
      await adminRequest(`${base}/${path}`, {
        method: "POST",
        mutation: true,
        body,
      });
      await reload();
    }, success);
  }

  return (
    <>
      <button
        type="button"
        disabled={busy || blocked || published}
        className="border-success text-success border px-4 py-2 text-sm disabled:opacity-40"
        onClick={() =>
          run(
            "publish",
            {
              version: translation.version,
              acknowledgedWarnings: acknowledged,
            },
            "Article published and its cache invalidated."
          )
        }
      >
        Publish
      </button>
      <button
        type="button"
        disabled={busy || blocked || published}
        className="border-border border px-4 py-2 text-sm disabled:opacity-40"
        onClick={() => {
          const when = window.prompt(
            "Publish at (ISO 8601 UTC, in the future):",
            new Date(Date.now() + 3_600_000).toISOString()
          );
          if (when === null) return;
          run(
            "schedule",
            {
              version: translation.version,
              scheduledFor: when,
              acknowledgedWarnings: acknowledged,
            },
            "Article scheduled."
          );
        }}
      >
        Schedule
      </button>
      <button
        type="button"
        disabled={busy || (!published && translation.status !== "SCHEDULED")}
        className="border-danger text-danger border px-4 py-2 text-sm disabled:opacity-40"
        onClick={() => {
          const reason = window.prompt("Why is this being withdrawn?");
          if (reason === null || reason.trim().length === 0) return;
          run(
            "unpublish",
            { version: translation.version, reason: reason.trim() },
            "Article withdrawn and its cache purged."
          );
        }}
      >
        Withdraw
      </button>
      <button
        type="button"
        disabled={busy || published}
        className="border-border border px-4 py-2 text-sm disabled:opacity-40"
        onClick={() => {
          const reason = window.prompt("Why is this being archived?");
          if (reason === null || reason.trim().length === 0) return;
          const redirectTo = window.prompt(
            "Redirect the old URL to (leave blank to answer 410 Gone):",
            `/${locale}/blog`
          );
          run(
            "archive",
            {
              version: translation.version,
              reason: reason.trim(),
              redirectTo:
                redirectTo === null || redirectTo.trim().length === 0
                  ? null
                  : redirectTo.trim(),
            },
            "Article archived."
          );
        }}
      >
        Archive
      </button>
    </>
  );
}

function TaxonomyEditor({
  categories,
  tags,
  busy,
  mutate,
}: {
  readonly categories: readonly Taxonomy[];
  readonly tags: readonly Taxonomy[];
  readonly busy: boolean;
  readonly mutate: (
    action: () => Promise<unknown>,
    success: string
  ) => Promise<void>;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-5">
      <ResourceHeading
        title="Categories and tags"
        description="Frontmatter never creates taxonomy: an unknown key is refused rather than turned into a new row, so a typo cannot become a category. These forms are the only way one comes into being."
      />
      <div className="grid gap-6 md:grid-cols-2">
        {(
          [
            ["categories", "Category", categories],
            ["tags", "Tag", tags],
          ] as const
        ).map(([resource, label, rows]) => (
          <div className="flex flex-col gap-3" key={resource}>
            <form
              className="border-border flex flex-wrap items-end gap-3 border p-4"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void mutate(
                  () =>
                    adminRequest(`/admin/blog/${resource}`, {
                      method: "POST",
                      mutation: true,
                      body: {
                        key: String(form.get("key") ?? "").trim(),
                        enabled: true,
                        sortOrder: 0,
                      },
                    }),
                  `${label} created.`
                );
                event.currentTarget.reset();
              }}
            >
              <Field
                label={`New ${label.toLowerCase()} key`}
                hint="Lowercase words joined by hyphens."
              >
                <input className={inputClass} name="key" required />
              </Field>
              <SaveButton busy={busy}>Create {label.toLowerCase()}</SaveButton>
            </form>
            <ul className="flex flex-col gap-2">
              {rows.map((row) => (
                <li
                  className="border-border flex items-center justify-between gap-3 border p-3 text-sm"
                  key={row.id}
                >
                  <span className="font-mono">{row.key}</span>
                  <button
                    type="button"
                    disabled={busy}
                    className="border-border border px-3 py-1 text-xs disabled:opacity-50"
                    onClick={() =>
                      void mutate(
                        () =>
                          adminRequest(`/admin/blog/${resource}/${row.id}`, {
                            method: "PUT",
                            mutation: true,
                            ifMatch: row.version,
                            body: {
                              key: row.key,
                              enabled: !row.enabled,
                              sortOrder: 0,
                            },
                          }),
                        row.enabled
                          ? `${label} disabled. Articles that reference it keep it.`
                          : `${label} enabled.`
                      )
                    }
                  >
                    {row.enabled ? "Disable" : "Enable"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * A refusal the author can act on.
 *
 * The generic handler collapses every `VALIDATION_FAILED` to "check the values
 * you entered", which is useless here: the API answers a refused transition
 * with the exact blockers and warnings that caused it, and dropping them sends
 * the author back to a checklist that says everything is fine. This keeps the
 * shared behaviour for ordinary field errors and unpacks the transition ones.
 */
function describeBlogError(error: unknown): string {
  if (error instanceof AdminRequestError) {
    const detail = error.fields.transition?.[0];
    const blockers = error.fields.blockers ?? [];
    const warnings = error.fields.warnings ?? [];
    if (detail !== undefined) {
      const parts = [detail];
      if (blockers.length > 0) {
        parts.push(`Blocking: ${blockers.map(humanize).join(", ")}.`);
      }
      if (warnings.length > 0) {
        parts.push(`Acknowledge: ${warnings.map(humanize).join(", ")}.`);
      }
      return parts.join(" ");
    }
  }
  return describeAdminError(error);
}

/** `MISSING_SEO_DESCRIPTION` → `Missing seo description`. */
function humanize(code: string): string {
  const words = code.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
