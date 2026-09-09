## Why this article exists

A portfolio is usually small enough to feel simple and important enough to expose every weak decision. It contains identity, writing, projects, contact details, media, analytics, and often an administration area. Add a second language—especially one with a different writing direction—and the apparently small website becomes a compact systems-design exercise.

This article is a permanent test fixture for that exercise. It is deliberately long, uses many Markdown elements, and has a matching Persian translation. That makes it useful for checking typography, responsive layout, theme contrast, reading preferences, language alternates, feeds, metadata, and the full publishing pipeline without writing disposable content after every database reset.

> A good test article should look like real editorial content, not a row of lorem ipsum. Real structure reveals real defects.

The goal is not to build the most complicated portfolio possible. The goal is to make ordinary changes predictable. A new project, a renamed heading, a Persian paragraph, or a changed font should travel through the system without producing a surprise somewhere else.

## Start with explicit boundaries

The most useful architectural question is not “Which framework should I use?” It is “Which part of the system owns this fact?” A maintainable portfolio gives each kind of data a clear home.

- PostgreSQL owns article source, publication state, slugs, and metadata.
- Object storage owns uploaded images, documents, and other binary files.
- The web application owns presentation and route composition.
- The API owns validation, authorization, and state transitions.
- The shared contract package owns the shapes exchanged between those boundaries.

When ownership is explicit, failures become easier to understand. If an article title is wrong, inspect the content record. If an image is missing, inspect the media reference. If a Persian paragraph uses the wrong font, inspect language attributes and CSS rather than rewriting stored text.

The opposite design lets the same value drift through source files, environment variables, database rows, and client state. It can appear convenient at first, but every later edit becomes a reconciliation problem.

## Model bilingual writing as related documents

An English article and its Persian translation describe the same subject, but they are not the same document with a string replacement applied. Each version needs its own title, slug, excerpt, search description, body, publication date, and editorial status. A translation may be drafted later, use a different structure, or choose examples that are clearer for its readers.

The stable connection belongs at the post level:

```text
Post
├── English translation
└── Persian translation
```

This small hierarchy enables a language switcher without forcing both versions to publish together. It also prevents a dangerous fallback: English content should never appear under a Persian URL merely because the Persian translation is missing.

For testing, verify at least these states:

1. Both translations are published and link to each other.
2. Only English is published, so the Persian route is missing.
3. Only Persian is published, so English discovery does not leak it.
4. One translation changes its slug without redirecting the other language.

## Typography is part of correctness

Typography is often discussed as decoration, but script support is a functional requirement. A font that looks excellent in English may not include Persian glyphs at all. The browser then falls back character by character, producing inconsistent metrics, broken emphasis, or tofu boxes.

This site uses JetBrains Mono for Latin interface text and Shabnam for Persian content. The Persian font files are the without-Latin builds, so mixed Latin text such as `TypeScript`, `Next.js`, and URLs naturally falls through to the Latin family. That split avoids shipping two copies of the same Latin glyphs.

The important font weights are mapped intentionally:

| Purpose                  | CSS weight | Shipped face    |
| ------------------------ | ---------: | --------------- |
| Body copy                |        400 | Shabnam Regular |
| Medium emphasis          |        500 | Shabnam Medium  |
| Headings and strong text |        700 | Shabnam Bold    |

Weights that the design never selects should not live in the public assets folder. Modern browsers need `woff2`; keeping `.eot`, `.ttf`, and `.woff` duplicates increases repository and deployment size without improving the supported experience.

## Direction belongs to content

A bilingual page can contain an English header, a Persian article, a left-to-right code block, and an English URL in the same viewport. Direction therefore belongs to the smallest meaningful document boundary, not to a global JavaScript guess.

Set `lang="fa"` and `dir="rtl"` on the Persian reading region. Keep code isolated as left-to-right. Prefer logical CSS properties such as `margin-inline-start`, `padding-inline-end`, and `text-align: start`; they adapt automatically when direction changes.

```css
.article-body {
  padding-inline: 1.25rem;
  text-align: start;
}

.article-body pre {
  direction: ltr;
  unicode-bidi: isolate;
}
```

This approach also helps assistive technology. Language metadata changes pronunciation rules, while correct direction prevents punctuation and numbers from jumping to unexpected positions.

## Build a deterministic content pipeline

The stored Markdown body is the source of truth. Rendered HTML is a cache derived from that source. Each save should normalize line endings, validate structure, sanitize output, build a heading tree, calculate reading time, and store a digest of the authoritative body.

A simplified pipeline looks like this:

```ts
const source = normalize(markdown);
const digest = sha256(source);
const rendered = await renderMarkdownBody(source);

await save({
  source,
  digest,
  html: rendered.html,
  headings: rendered.headings,
  readingMinutes: rendered.readingTimeMinutes,
  rendererVersion: rendered.rendererVersion,
});
```

The digest protects against accidental disagreement between source and render. The renderer version makes migrations explicit: when rendering behavior changes, stale rows can be found and regenerated instead of silently serving inconsistent HTML.

Deterministic seed data follows the same principle. Fixed identifiers and publication timestamps make repeated runs safe. An upsert keyed by post identity means the fixture appears once, not once per developer session.

## Design for failure, not only success

A production portfolio depends on systems that can fail independently. The database may be unavailable while static assets still work. GitHub statistics may time out while article content remains healthy. A media object may be quarantined while the rest of a post is valid.

Useful behavior is graceful and specific:

- A failed optional statistic shows no statistic, not a failed page.
- A corrupted published render is excluded from discovery rather than trusted.
- A missing translation produces a clear not-found response with available alternatives.
- An unavailable content service shows a stable recovery surface.
- Draft and scheduled content never leaks into public lists or feeds.

These decisions should be tested at the boundary that enforces them. Unit tests are excellent for parsing and validation. Integration tests prove database transactions. Browser tests prove direction, typography, navigation, and the absence of flashes during first paint.

## Performance comes from restraint

Portfolio performance rarely needs exotic optimization. It benefits from sending less work.

Start with a short checklist:

1. Preload only the critical font face for the current route.
2. Keep optional families lazy until a reader selects them.
3. Serve responsive images with explicit dimensions.
4. Avoid hydrating components that can remain server-rendered.
5. Cache public reads by locale and invalidate only affected tags.
6. Keep animation optional and respect reduced-motion preferences.

The same restraint improves maintainability. Every asset, dependency, and client-side effect should justify its lifetime cost.

## A practical verification matrix

Before calling the bilingual experience complete, walk through a matrix rather than a single happy path.

| Area       | English check                         | Persian check                         |
| ---------- | ------------------------------------- | ------------------------------------- |
| Typography | Latin weights load correctly          | Shabnam shapes and joins correctly    |
| Direction  | Layout remains LTR                    | Article body and lists are RTL        |
| Code       | Blocks remain LTR                     | Mixed code remains isolated           |
| Theme      | Contrast passes in light and dark     | Contrast passes with Persian glyphs   |
| Discovery  | English feed contains English version | Persian feed contains Persian version |
| Alternates | Links to published Persian version    | Links to published English version    |

Resize the page, navigate with a keyboard, increase the reading size, toggle themes, and inspect the network panel. Automated assertions catch regressions, while a short visual pass catches rhythm and shaping problems that structural tests cannot describe.

---

## What maintainability feels like

A maintainable system is not one that never changes. It is one that makes the consequences of a change visible. Replacing a Persian font should update a small number of declarations, assets, contracts, and tests. Adding a translation should create one related document rather than duplicate an entire post. Updating the renderer should identify every stale cached result.

That is the standard this test article is meant to exercise. It is long enough to reveal line-height problems, varied enough to exercise the Markdown renderer, and persistent enough to be available every time the database is seeded.

If all of it reads comfortably in both languages, survives a refresh, appears correctly in discovery, and remains valid after a clean seed, the portfolio is no longer merely bilingual in its data. It is bilingual as a complete system.
