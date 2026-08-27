"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import { adminRequest, describeAdminError } from "./admin-client";
import {
  Check,
  EditorStatus,
  Field,
  inputClass,
  LocaleBadge,
  ResourceHeading,
  SaveButton,
} from "./AdminEditorFields";

type Translation = {
  readonly id: string;
  readonly locale: "en" | "fa";
  readonly version: number;
  readonly siteName?: string;
  readonly titleTemplate?: string;
  readonly metaDescription?: string;
  readonly title?: string | null;
  readonly content?: unknown;
};

type Settings = {
  readonly version: number;
  readonly canonicalSiteUrl: string;
  readonly defaultLocale: "en" | "fa";
  readonly enabledLocales: readonly ("en" | "fa")[];
  readonly timezone: string;
  readonly defaultSocialImageId: string | null;
  readonly authorName: string;
  readonly creatorName: string;
  readonly publisherName: string;
  readonly contactRecipientEmail: string;
  readonly contactEnabled: boolean;
  readonly contactRetentionDays: number;
  readonly githubUsername: string | null;
  readonly githubRepoAllowlist: readonly string[];
  readonly githubCacheTtlSeconds: number;
  readonly robotsAllowIndexing: boolean;
  readonly birthDate: string | null;
  readonly translations: readonly Translation[];
};

type Appearance = {
  readonly version: number;
  readonly enabledThemes: readonly string[];
  readonly defaultTheme: string;
  readonly enabledBlogFonts: readonly string[];
  readonly defaultBlogFontByLocale: Record<string, string>;
  readonly allowedBlogSizeSteps: readonly string[];
  readonly defaultBlogSizeStep: string;
  readonly offerMotionToggle: boolean;
};

type Section = {
  readonly id: string;
  readonly key: "hero" | "about" | "skills" | "projects" | "certificates" | "contact";
  readonly content: unknown;
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly version: number;
  readonly translations: readonly Translation[];
};

type NavItem = {
  readonly id: string;
  readonly labelByLocale: Record<string, string>;
  readonly targetKind: "SECTION_ANCHOR" | "INTERNAL_ROUTE";
  readonly target: string;
  readonly iconKey: string | null;
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly archivedAt: string | null;
  readonly version: number;
};

type SocialLink = {
  readonly id: string;
  readonly labelByLocale: Record<string, string>;
  readonly url: string;
  readonly iconKey: string | null;
  readonly rel: string | null;
  readonly kind: "SOCIAL" | "EMAIL" | "DONATE";
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly archivedAt: string | null;
  readonly version: number;
};

type State = {
  readonly settings: Settings;
  readonly appearance: Appearance;
  readonly sections: readonly Section[];
  readonly navigation: readonly NavItem[];
  readonly socials: readonly SocialLink[];
};

export default function AdminPortfolioEditor(): React.JSX.Element {
  const [state, setState] = useState<State | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [settings, appearance, sections, navigation, socials] =
        await Promise.all([
          adminRequest<Settings>("/admin/settings"),
          adminRequest<Appearance>("/admin/appearance"),
          adminRequest<readonly Section[]>("/admin/sections"),
          adminRequest<readonly NavItem[]>("/admin/nav-items"),
          adminRequest<readonly SocialLink[]>("/admin/social-links"),
        ]);
      setState({ settings, appearance, sections, navigation, socials });
      setFailed(false);
    } catch (error) {
      setMessage(describeAdminError(error));
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await load();
      setMessage(success);
      setFailed(false);
    } catch (error) {
      setMessage(describeAdminError(error));
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (state === null) {
    return <EditorStatus message={message ?? "Loading site controls…"} error={failed} />;
  }

  const missingTranslations = state.sections.reduce(
    (total, section) =>
      total +
      (["en", "fa"] as const).filter(
        (locale) => !section.translations.some((item) => item.locale === locale)
      ).length,
    0
  );

  return (
    <div className="flex flex-col gap-10">
      <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 border p-4">
        <div>
          <p className="font-semibold">Translation coverage</p>
          <p className="text-text-muted text-sm">
            {missingTranslations === 0
              ? "Every page section has English and Persian content."
              : `${missingTranslations} section translation${missingTranslations === 1 ? " is" : "s are"} still missing.`}
          </p>
        </div>
        <EditorStatus message={message} error={failed} />
      </div>

      <SettingsEditor settings={state.settings} busy={busy} mutate={mutate} />
      <AppearanceEditor appearance={state.appearance} busy={busy} mutate={mutate} />
      <SectionsEditor sections={state.sections} busy={busy} mutate={mutate} />
      <NavigationEditor items={state.navigation} busy={busy} mutate={mutate} />
      <SocialEditor items={state.socials} busy={busy} mutate={mutate} />
    </div>
  );
}

function SettingsEditor({
  settings,
  busy,
  mutate,
}: {
  readonly settings: Settings;
  readonly busy: boolean;
  readonly mutate: (action: () => Promise<unknown>, success: string) => Promise<void>;
}): React.JSX.Element {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate(
      () =>
        adminRequest("/admin/settings", {
          method: "PATCH",
          mutation: true,
          ifMatch: settings.version,
          body: {
            settings: {
              canonicalSiteUrl: text(form, "canonicalSiteUrl"),
              defaultLocale: text(form, "defaultLocale"),
              enabledLocales: (["en", "fa"] as const).filter((locale) =>
                form.has(`locale-${locale}`)
              ),
              timezone: text(form, "timezone"),
              defaultSocialImageId: nullable(form, "defaultSocialImageId"),
              authorName: text(form, "authorName"),
              creatorName: text(form, "creatorName"),
              publisherName: text(form, "publisherName"),
              contactRecipientEmail: text(form, "contactRecipientEmail"),
              contactEnabled: form.has("contactEnabled"),
              contactRetentionDays: integer(form, "contactRetentionDays"),
              githubUsername: nullable(form, "githubUsername"),
              githubRepoAllowlist: lines(form, "githubRepoAllowlist"),
              githubCacheTtlSeconds: integer(form, "githubCacheTtlSeconds"),
              robotsAllowIndexing: form.has("robotsAllowIndexing"),
              birthDate: nullable(form, "birthDate"),
            },
          },
        }),
      "Site settings saved."
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <ResourceHeading
        title="Site settings"
        description="Canonical identity, contact delivery, GitHub statistics, indexing, and the private birth date used to derive age."
      />
      <form onSubmit={submit} className="border-border grid gap-4 border p-4 md:grid-cols-2">
        <Field label="Canonical site URL">
          <input className={inputClass} name="canonicalSiteUrl" type="url" required defaultValue={settings.canonicalSiteUrl} />
        </Field>
        <Field label="Timezone">
          <input className={inputClass} name="timezone" required defaultValue={settings.timezone} />
        </Field>
        <Field label="Default language">
          <select className={inputClass} name="defaultLocale" defaultValue={settings.defaultLocale}>
            <option value="en">English</option>
            <option value="fa">Persian</option>
          </select>
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Enabled languages</legend>
          <div className="grid grid-cols-2 gap-2">
            <Check name="locale-en" label="English" defaultChecked={settings.enabledLocales.includes("en")} />
            <Check name="locale-fa" label="Persian" defaultChecked={settings.enabledLocales.includes("fa")} />
          </div>
        </fieldset>
        <Field label="Author name"><input className={inputClass} name="authorName" required defaultValue={settings.authorName} /></Field>
        <Field label="Creator name"><input className={inputClass} name="creatorName" required defaultValue={settings.creatorName} /></Field>
        <Field label="Publisher name"><input className={inputClass} name="publisherName" required defaultValue={settings.publisherName} /></Field>
        <Field label="Contact recipient"><input className={inputClass} name="contactRecipientEmail" type="email" required defaultValue={settings.contactRecipientEmail} /></Field>
        <Field label="Contact retention days"><input className={inputClass} name="contactRetentionDays" type="number" min="1" max="3650" required defaultValue={settings.contactRetentionDays} /></Field>
        <Field label="Birth date" hint="Stored privately; only the derived age is public."><input className={inputClass} name="birthDate" type="date" defaultValue={settings.birthDate?.slice(0, 10) ?? ""} /></Field>
        <Field label="GitHub username"><input className={inputClass} name="githubUsername" defaultValue={settings.githubUsername ?? ""} /></Field>
        <Field label="GitHub cache seconds"><input className={inputClass} name="githubCacheTtlSeconds" type="number" min="60" max="86400" required defaultValue={settings.githubCacheTtlSeconds} /></Field>
        <Field label="Repository allowlist" hint="One repository name per line."><textarea className={inputClass} name="githubRepoAllowlist" rows={4} defaultValue={settings.githubRepoAllowlist.join("\n")} /></Field>
        <Field label="Default social-image media ID"><input className={inputClass} name="defaultSocialImageId" defaultValue={settings.defaultSocialImageId ?? ""} /></Field>
        <div className="grid gap-2 md:col-span-2 md:grid-cols-2">
          <Check name="contactEnabled" label="Accept contact messages" defaultChecked={settings.contactEnabled} />
          <Check name="robotsAllowIndexing" label="Allow search indexing" defaultChecked={settings.robotsAllowIndexing} />
        </div>
        <div className="md:col-span-2"><SaveButton busy={busy} /></div>
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        {(["en", "fa"] as const).map((locale) => {
          const translation = settings.translations.find((item) => item.locale === locale);
          return (
            <form
              key={locale}
              className="border-border flex flex-col gap-3 border p-4"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void mutate(
                  () => adminRequest(`/admin/settings/translations/${locale}`, { method: "PATCH", mutation: true, ifMatch: translation?.version ?? 0, body: { siteName: text(form, "siteName"), titleTemplate: text(form, "titleTemplate"), metaDescription: text(form, "metaDescription") } }),
                  `${locale.toUpperCase()} site text saved.`
                );
              }}
            >
              <div className="flex items-center justify-between gap-3"><h4 className="font-semibold">{locale === "en" ? "English" : "Persian"}</h4><LocaleBadge locale={locale} present={translation !== undefined} /></div>
              <Field label="Site name"><input className={inputClass} name="siteName" required defaultValue={translation?.siteName ?? ""} dir={locale === "fa" ? "rtl" : "ltr"} /></Field>
              <Field label="Title template"><input className={inputClass} name="titleTemplate" required defaultValue={translation?.titleTemplate ?? ""} dir={locale === "fa" ? "rtl" : "ltr"} /></Field>
              <Field label="Meta description"><textarea className={inputClass} name="metaDescription" required rows={4} defaultValue={translation?.metaDescription ?? ""} dir={locale === "fa" ? "rtl" : "ltr"} /></Field>
              <SaveButton busy={busy} />
            </form>
          );
        })}
      </div>
    </section>
  );
}

function AppearanceEditor({ appearance, busy, mutate }: { readonly appearance: Appearance; readonly busy: boolean; readonly mutate: (action: () => Promise<unknown>, success: string) => Promise<void> }): React.JSX.Element {
  return <section className="flex flex-col gap-5"><ResourceHeading title="Appearance options" description="Choose only registry-backed themes, fonts, text sizes, and defaults. These values never become authored CSS." /><form className="border-border grid gap-4 border p-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void mutate(() => adminRequest("/admin/appearance", { method: "PATCH", mutation: true, ifMatch: appearance.version, body: { settings: { enabledThemes: commaList(form, "enabledThemes"), defaultTheme: text(form, "defaultTheme"), enabledBlogFonts: commaList(form, "enabledBlogFonts"), defaultBlogFontByLocale: { en: text(form, "fontEn"), fa: text(form, "fontFa") }, allowedBlogSizeSteps: commaList(form, "allowedBlogSizeSteps"), defaultBlogSizeStep: text(form, "defaultBlogSizeStep"), offerMotionToggle: form.has("offerMotionToggle") } } }), "Appearance options saved."); }}>
    <Field label="Enabled themes" hint="Comma-separated registry keys."><input className={inputClass} name="enabledThemes" required defaultValue={appearance.enabledThemes.join(", ")} /></Field>
    <Field label="Default theme"><input className={inputClass} name="defaultTheme" required defaultValue={appearance.defaultTheme} /></Field>
    <Field label="Enabled blog fonts" hint="Comma-separated registry keys."><input className={inputClass} name="enabledBlogFonts" required defaultValue={appearance.enabledBlogFonts.join(", ")} /></Field>
    <Field label="English blog font"><input className={inputClass} name="fontEn" required defaultValue={appearance.defaultBlogFontByLocale.en} /></Field>
    <Field label="Persian blog font"><input className={inputClass} name="fontFa" required defaultValue={appearance.defaultBlogFontByLocale.fa} /></Field>
    <Field label="Allowed size steps"><input className={inputClass} name="allowedBlogSizeSteps" required defaultValue={appearance.allowedBlogSizeSteps.join(", ")} /></Field>
    <Field label="Default size step"><input className={inputClass} name="defaultBlogSizeStep" required defaultValue={appearance.defaultBlogSizeStep} /></Field>
    <Check name="offerMotionToggle" label="Offer reduced-motion control" defaultChecked={appearance.offerMotionToggle} />
    <div className="md:col-span-2"><SaveButton busy={busy} /></div>
  </form></section>;
}

function SectionsEditor({ sections, busy, mutate }: { readonly sections: readonly Section[]; readonly busy: boolean; readonly mutate: (action: () => Promise<unknown>, success: string) => Promise<void> }): React.JSX.Element {
  return <section className="flex flex-col gap-5"><ResourceHeading title="Page sections" description="Control order, visibility, hero motion, About prose, and both localized headings from one closed section set." /><div className="flex flex-col gap-3">{sections.map((section) => <details className="border-border border" key={section.id}><summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4"><span className="font-semibold capitalize">{section.key}</span><span className="flex gap-2">{(["en", "fa"] as const).map((locale) => <LocaleBadge key={locale} locale={locale} present={section.translations.some((item) => item.locale === locale)} />)}</span></summary><div className="border-border flex flex-col gap-5 border-t p-4"><SectionBaseForm section={section} busy={busy} mutate={mutate} />{(["en", "fa"] as const).map((locale) => <SectionTranslationForm key={locale} section={section} locale={locale} busy={busy} mutate={mutate} />)}</div></details>)}</div></section>;
}

function SectionBaseForm({ section, busy, mutate }: { readonly section: Section; readonly busy: boolean; readonly mutate: (action: () => Promise<unknown>, success: string) => Promise<void> }): React.JSX.Element {
  const content = record(section.content);
  return <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const hero = section.key === "hero" ? { variant: "primary", typingSpeed: integer(form, "typingSpeed"), deletingSpeed: integer(form, "deletingSpeed"), pauseBetween: integer(form, "pauseBetween"), showRubikCube: form.has("showRubikCube") } : {}; void mutate(() => adminRequest(`/admin/sections/${section.id}`, { method: "PATCH", mutation: true, ifMatch: section.version, body: { key: section.key, content: hero, enabled: form.has("enabled"), sortOrder: integer(form, "sortOrder") } }), `${section.key} section settings saved.`); }}>
    <Field label="Order"><input className={inputClass} name="sortOrder" type="number" min="0" required defaultValue={section.sortOrder} /></Field><Check name="enabled" label="Show this section" defaultChecked={section.enabled} />
    {section.key === "hero" ? <><Field label="Typing speed (ms)"><input className={inputClass} name="typingSpeed" type="number" min="10" max="500" defaultValue={numberValue(content.typingSpeed, 100)} /></Field><Field label="Deleting speed (ms)"><input className={inputClass} name="deletingSpeed" type="number" min="10" max="500" defaultValue={numberValue(content.deletingSpeed, 50)} /></Field><Field label="Pause between lines (ms)"><input className={inputClass} name="pauseBetween" type="number" min="0" max="30000" defaultValue={numberValue(content.pauseBetween, 1200)} /></Field><Check name="showRubikCube" label="Show Rubik cube" defaultChecked={content.showRubikCube !== false} /></> : null}
    <div className="md:col-span-2"><SaveButton busy={busy} /></div>
  </form>;
}

function SectionTranslationForm({ section, locale, busy, mutate }: { readonly section: Section; readonly locale: "en" | "fa"; readonly busy: boolean; readonly mutate: (action: () => Promise<unknown>, success: string) => Promise<void> }): React.JSX.Element {
  const translation = section.translations.find((item) => item.locale === locale); const content = record(translation?.content); const direction = locale === "fa" ? "rtl" : "ltr";
  return <form className="border-border grid gap-3 border-t pt-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const translatedContent = section.key === "hero" ? { lines: lines(form, "lines"), ...(nullable(form, "subtitle") === null ? {} : { subtitle: text(form, "subtitle") }) } : section.key === "about" ? { location: text(form, "location"), role: text(form, "role"), body: paragraphs(form, "body") } : {}; void mutate(() => adminRequest(`/admin/sections/${section.id}/translations/${locale}`, { method: "PATCH", mutation: true, ifMatch: translation?.version ?? 0, body: { key: section.key, translation: { title: nullable(form, "title"), content: translatedContent } } }), `${section.key} ${locale.toUpperCase()} content saved.`); }}>
    <div className="flex items-center gap-2 md:col-span-2"><h5 className="font-semibold">{locale === "en" ? "English" : "Persian"}</h5><LocaleBadge locale={locale} present={translation !== undefined} /></div>
    <Field label="Section title"><input className={inputClass} name="title" defaultValue={translation?.title ?? ""} dir={direction} /></Field>
    {section.key === "hero" ? <><Field label="Typed lines" hint="One line per row."><textarea className={inputClass} name="lines" required rows={4} defaultValue={stringArray(content.lines).join("\n")} dir={direction} /></Field><Field label="Subtitle"><textarea className={inputClass} name="subtitle" rows={3} defaultValue={stringValue(content.subtitle)} dir={direction} /></Field></> : null}
    {section.key === "about" ? <><Field label="Location"><input className={inputClass} name="location" required defaultValue={stringValue(content.location)} dir={direction} /></Field><Field label="Role"><input className={inputClass} name="role" required defaultValue={stringValue(content.role)} dir={direction} /></Field><Field label="About paragraphs" hint="Separate paragraphs with a blank line."><textarea className={inputClass} name="body" required rows={8} defaultValue={stringArray(content.body).join("\n\n")} dir={direction} /></Field></> : null}
    <div className="md:col-span-2"><SaveButton busy={busy} /></div>
  </form>;
}

function NavigationEditor({ items, busy, mutate }: { readonly items: readonly NavItem[]; readonly busy: boolean; readonly mutate: (action: () => Promise<unknown>, success: string) => Promise<void> }): React.JSX.Element {
  return <section className="flex flex-col gap-5"><ResourceHeading title="Header navigation" description="Navigation can target an allowlisted section key or a site-relative route—never an external URL." /><NavForm busy={busy} mutate={mutate} />{items.map((item) => <NavForm key={item.id} item={item} busy={busy} mutate={mutate} />)}</section>;
}

function NavForm({ item, busy, mutate }: { readonly item?: NavItem; readonly busy: boolean; readonly mutate: (action: () => Promise<unknown>, success: string) => Promise<void> }): React.JSX.Element {
  return <form className={`border-border grid gap-3 border p-4 md:grid-cols-3 ${item?.archivedAt === null || item === undefined ? "" : "opacity-70"}`} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const body = { labelByLocale: { en: text(form, "labelEn"), fa: text(form, "labelFa") }, targetKind: text(form, "targetKind"), target: text(form, "target"), iconKey: nullable(form, "iconKey"), enabled: form.has("enabled"), sortOrder: integer(form, "sortOrder") }; void mutate(() => adminRequest(item === undefined ? "/admin/nav-items" : `/admin/nav-items/${item.id}`, { method: item === undefined ? "POST" : "PATCH", mutation: true, ...(item === undefined ? {} : { ifMatch: item.version }), body }), item === undefined ? "Navigation item created." : "Navigation item saved."); }}>
    <h4 className="font-semibold md:col-span-3">{item === undefined ? "Add navigation item" : item.labelByLocale.en}</h4><Field label="English label"><input className={inputClass} name="labelEn" required defaultValue={item?.labelByLocale.en ?? ""} /></Field><Field label="Persian label"><input className={inputClass} name="labelFa" required defaultValue={item?.labelByLocale.fa ?? ""} dir="rtl" /></Field><Field label="Target type"><select className={inputClass} name="targetKind" defaultValue={item?.targetKind ?? "SECTION_ANCHOR"}><option value="SECTION_ANCHOR">Page section</option><option value="INTERNAL_ROUTE">Internal route</option></select></Field><Field label="Target"><input className={inputClass} name="target" required defaultValue={item?.target ?? ""} /></Field><Field label="Icon key"><input className={inputClass} name="iconKey" defaultValue={item?.iconKey ?? ""} /></Field><Field label="Order"><input className={inputClass} name="sortOrder" type="number" min="0" required defaultValue={item?.sortOrder ?? 0} /></Field><Check name="enabled" label="Enabled" defaultChecked={item?.enabled ?? true} /><div className="flex flex-wrap gap-2 md:col-span-3"><SaveButton busy={busy}>{item === undefined ? "Create item" : "Save changes"}</SaveButton>{item === undefined ? null : <ArchiveButton resource="nav-items" item={item} busy={busy} mutate={mutate} />}</div>
  </form>;
}

function SocialEditor({ items, busy, mutate }: { readonly items: readonly SocialLink[]; readonly busy: boolean; readonly mutate: (action: () => Promise<unknown>, success: string) => Promise<void> }): React.JSX.Element {
  return <section className="flex flex-col gap-5"><ResourceHeading title="Footer and social links" description="Social and donation links require HTTPS. Email links use a validated mailto address." /><SocialForm busy={busy} mutate={mutate} />{items.map((item) => <SocialForm key={item.id} item={item} busy={busy} mutate={mutate} />)}</section>;
}

function SocialForm({ item, busy, mutate }: { readonly item?: SocialLink; readonly busy: boolean; readonly mutate: (action: () => Promise<unknown>, success: string) => Promise<void> }): React.JSX.Element {
  return <form className={`border-border grid gap-3 border p-4 md:grid-cols-3 ${item?.archivedAt === null || item === undefined ? "" : "opacity-70"}`} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const body = { labelByLocale: { en: text(form, "labelEn"), fa: text(form, "labelFa") }, kind: text(form, "kind"), url: text(form, "url"), iconKey: nullable(form, "iconKey"), rel: nullable(form, "rel"), enabled: form.has("enabled"), sortOrder: integer(form, "sortOrder") }; void mutate(() => adminRequest(item === undefined ? "/admin/social-links" : `/admin/social-links/${item.id}`, { method: item === undefined ? "POST" : "PATCH", mutation: true, ...(item === undefined ? {} : { ifMatch: item.version }), body }), item === undefined ? "Social link created." : "Social link saved."); }}>
    <h4 className="font-semibold md:col-span-3">{item === undefined ? "Add social link" : item.labelByLocale.en}</h4><Field label="English label"><input className={inputClass} name="labelEn" required defaultValue={item?.labelByLocale.en ?? ""} /></Field><Field label="Persian label"><input className={inputClass} name="labelFa" required defaultValue={item?.labelByLocale.fa ?? ""} dir="rtl" /></Field><Field label="Kind"><select className={inputClass} name="kind" defaultValue={item?.kind ?? "SOCIAL"}><option value="SOCIAL">Social</option><option value="DONATE">Donation</option><option value="EMAIL">Email</option></select></Field><Field label="URL"><input className={inputClass} name="url" required defaultValue={item?.url ?? "https://"} /></Field><Field label="Icon key"><input className={inputClass} name="iconKey" defaultValue={item?.iconKey ?? ""} /></Field><Field label="Link relationship"><input className={inputClass} name="rel" defaultValue={item?.rel ?? "noopener noreferrer"} /></Field><Field label="Order"><input className={inputClass} name="sortOrder" type="number" min="0" required defaultValue={item?.sortOrder ?? 0} /></Field><Check name="enabled" label="Enabled" defaultChecked={item?.enabled ?? true} /><div className="flex flex-wrap gap-2 md:col-span-3"><SaveButton busy={busy}>{item === undefined ? "Create link" : "Save changes"}</SaveButton>{item === undefined ? null : <ArchiveButton resource="social-links" item={item} busy={busy} mutate={mutate} />}</div>
  </form>;
}

function ArchiveButton({ resource, item, busy, mutate }: { readonly resource: string; readonly item: { readonly id: string; readonly version: number; readonly archivedAt: string | null }; readonly busy: boolean; readonly mutate: (action: () => Promise<unknown>, success: string) => Promise<void> }): React.JSX.Element {
  const archived = item.archivedAt !== null; return <button type="button" disabled={busy} className="border-border border px-4 py-2 text-sm disabled:opacity-60" onClick={() => { if (!archived && !window.confirm("Archive this item? It will stop appearing publicly.")) return; void mutate(() => adminRequest(`/admin/resources/${resource}/${item.id}/${archived ? "restore" : "archive"}`, { method: "POST", mutation: true, body: { confirm: true, version: item.version } }), archived ? "Item restored." : "Item archived."); }}>{archived ? "Restore" : "Archive"}</button>;
}

function text(form: FormData, name: string): string { return String(form.get(name) ?? "").trim(); }
function nullable(form: FormData, name: string): string | null { const value = text(form, name); return value.length === 0 ? null : value; }
function integer(form: FormData, name: string): number { return Number.parseInt(text(form, name), 10); }
function lines(form: FormData, name: string): string[] { return text(form, name).split(/\r?\n/u).map((value) => value.trim()).filter(Boolean); }
function paragraphs(form: FormData, name: string): string[] { return text(form, name).split(/\r?\n\s*\r?\n/u).map((value) => value.trim()).filter(Boolean); }
function commaList(form: FormData, name: string): string[] { return text(form, name).split(",").map((value) => value.trim()).filter(Boolean); }
function record(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function numberValue(value: unknown, fallback: number): number { return typeof value === "number" ? value : fallback; }
