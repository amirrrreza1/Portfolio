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
  readonly keywords?: readonly string[];
  readonly footerLines?: readonly string[];
  readonly footerRights?: string;
  readonly resumeButtonLabel?: string;
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
  readonly auditRetentionDays: number;
  readonly searchConsoleTokens: {
    readonly google: string | null;
    readonly bing: string | null;
  };
  readonly githubUsername: string | null;
  readonly githubRepoAllowlist: readonly string[];
  readonly githubCacheTtlSeconds: number;
  readonly robotsAllowIndexing: boolean;
  readonly birthDate: string | null;
  readonly translations: readonly Translation[];
};

type Section = {
  readonly id: string;
  readonly key:
    "hero" | "about" | "skills" | "projects" | "certificates" | "contact";
  readonly translations: readonly Translation[];
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
  readonly sections: readonly Section[];
  readonly socials: readonly SocialLink[];
};

export default function AdminPortfolioEditor(): React.JSX.Element {
  const [state, setState] = useState<State | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [settings, sections, socials] = await Promise.all([
        adminRequest<Settings>("/admin/settings"),
        adminRequest<readonly Section[]>("/admin/sections"),
        adminRequest<readonly SocialLink[]>("/admin/social-links"),
      ]);
      setState({ settings, sections, socials });
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
    return (
      <EditorStatus
        message={message ?? "Loading site controls…"}
        error={failed}
      />
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 border p-4">
        <div>
          <p className="font-semibold">English portfolio content</p>
          <p className="text-text-muted text-sm">
            Site-wide content is English. Blog posts manage their language in
            the Blog workspace.
          </p>
        </div>
        <EditorStatus message={message} error={failed} />
      </div>

      <SettingsEditor settings={state.settings} busy={busy} mutate={mutate} />
      <AboutEditor sections={state.sections} busy={busy} mutate={mutate} />
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
  readonly mutate: (
    action: () => Promise<unknown>,
    success: string
  ) => Promise<void>;
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
              defaultLocale: "en",
              enabledLocales: ["en"],
              timezone: text(form, "timezone"),
              defaultSocialImageId: nullable(form, "defaultSocialImageId"),
              authorName: text(form, "authorName"),
              creatorName: text(form, "creatorName"),
              publisherName: text(form, "publisherName"),
              contactRecipientEmail: text(form, "contactRecipientEmail"),
              contactEnabled: form.has("contactEnabled"),
              contactRetentionDays: integer(form, "contactRetentionDays"),
              auditRetentionDays: integer(form, "auditRetentionDays"),
              searchConsoleTokens: {
                google: nullable(form, "googleVerificationToken"),
                bing: nullable(form, "bingVerificationToken"),
              },
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
      <form
        data-testid="admin-settings-form"
        onSubmit={submit}
        className="border-border grid gap-4 border p-4 md:grid-cols-2"
      >
        <Field label="Canonical site URL">
          <input
            className={inputClass}
            name="canonicalSiteUrl"
            type="url"
            required
            defaultValue={settings.canonicalSiteUrl}
          />
        </Field>
        <Field label="Timezone">
          <input
            className={inputClass}
            name="timezone"
            required
            defaultValue={settings.timezone}
          />
        </Field>
        <Field label="Author name">
          <input
            className={inputClass}
            name="authorName"
            required
            defaultValue={settings.authorName}
          />
        </Field>
        <Field label="Creator name">
          <input
            className={inputClass}
            name="creatorName"
            required
            defaultValue={settings.creatorName}
          />
        </Field>
        <Field label="Publisher name">
          <input
            className={inputClass}
            name="publisherName"
            required
            defaultValue={settings.publisherName}
          />
        </Field>
        <Field label="Contact recipient">
          <input
            className={inputClass}
            name="contactRecipientEmail"
            type="email"
            required
            defaultValue={settings.contactRecipientEmail}
          />
        </Field>
        <Field label="Contact retention days">
          <input
            className={inputClass}
            name="contactRetentionDays"
            type="number"
            min="1"
            max="3650"
            required
            defaultValue={settings.contactRetentionDays}
          />
        </Field>
        <Field label="Audit retention days">
          <input
            className={inputClass}
            name="auditRetentionDays"
            type="number"
            min="30"
            max="3650"
            required
            defaultValue={settings.auditRetentionDays}
          />
        </Field>
        <Field
          label="Birth date"
          hint="Stored privately; only the derived age is public."
        >
          <input
            className={inputClass}
            name="birthDate"
            type="date"
            defaultValue={settings.birthDate?.slice(0, 10) ?? ""}
          />
        </Field>
        <Field label="GitHub username">
          <input
            className={inputClass}
            name="githubUsername"
            defaultValue={settings.githubUsername ?? ""}
          />
        </Field>
        <Field label="GitHub cache seconds">
          <input
            className={inputClass}
            name="githubCacheTtlSeconds"
            type="number"
            min="60"
            max="86400"
            required
            defaultValue={settings.githubCacheTtlSeconds}
          />
        </Field>
        <Field
          label="Repository allowlist"
          hint="One repository name per line."
        >
          <textarea
            className={inputClass}
            name="githubRepoAllowlist"
            rows={4}
            defaultValue={settings.githubRepoAllowlist.join("\n")}
          />
        </Field>
        <Field label="Default social-image media ID">
          <input
            className={inputClass}
            name="defaultSocialImageId"
            defaultValue={settings.defaultSocialImageId ?? ""}
          />
        </Field>
        <Field label="Google verification token">
          <input
            className={inputClass}
            name="googleVerificationToken"
            defaultValue={settings.searchConsoleTokens.google ?? ""}
          />
        </Field>
        <Field label="Bing verification token">
          <input
            className={inputClass}
            name="bingVerificationToken"
            defaultValue={settings.searchConsoleTokens.bing ?? ""}
          />
        </Field>
        <div className="grid gap-2 md:col-span-2 md:grid-cols-2">
          <Check
            name="contactEnabled"
            label="Accept contact messages"
            defaultChecked={settings.contactEnabled}
          />
          <Check
            name="robotsAllowIndexing"
            label="Allow search indexing"
            defaultChecked={settings.robotsAllowIndexing}
          />
        </div>
        <div className="md:col-span-2">
          <SaveButton busy={busy} />
        </div>
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        {(["en"] as const).map((locale) => {
          const translation = settings.translations.find(
            (item) => item.locale === locale
          );
          return (
            <form
              key={locale}
              className="border-border flex flex-col gap-3 border p-4"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void mutate(
                  () =>
                    adminRequest(`/admin/settings/translations/${locale}`, {
                      method: "PATCH",
                      mutation: true,
                      ifMatch: translation?.version ?? 0,
                      body: {
                        siteName: text(form, "siteName"),
                        titleTemplate: text(form, "titleTemplate"),
                        metaDescription: text(form, "metaDescription"),
                        keywords: lines(form, "keywords"),
                        footerLines: lines(form, "footerLines"),
                        footerRights:
                          translation?.footerRights ?? "All rights reserved",
                        resumeButtonLabel:
                          translation?.resumeButtonLabel ?? "Download",
                      },
                    }),
                  `${locale.toUpperCase()} site text saved.`
                );
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <h4 className="font-semibold">English</h4>
                <LocaleBadge
                  locale={locale}
                  present={translation !== undefined}
                />
              </div>
              <Field label="Site name">
                <input
                  className={inputClass}
                  name="siteName"
                  required
                  defaultValue={translation?.siteName ?? ""}
                  dir="ltr"
                />
              </Field>
              <Field label="Title template">
                <input
                  className={inputClass}
                  name="titleTemplate"
                  required
                  defaultValue={translation?.titleTemplate ?? ""}
                  dir="ltr"
                />
              </Field>
              <Field label="Meta description">
                <textarea
                  className={inputClass}
                  name="metaDescription"
                  required
                  rows={4}
                  defaultValue={translation?.metaDescription ?? ""}
                  dir="ltr"
                />
              </Field>
              <Field label="SEO keywords" hint="One reviewed keyword per line.">
                <textarea
                  className={inputClass}
                  name="keywords"
                  rows={6}
                  defaultValue={(translation?.keywords ?? []).join("\n")}
                  dir="ltr"
                />
              </Field>
              <Field
                label="Footer rotating lines"
                hint="Optional; one line per row."
              >
                <textarea
                  className={inputClass}
                  name="footerLines"
                  rows={3}
                  defaultValue={(translation?.footerLines ?? []).join("\n")}
                  dir="ltr"
                />
              </Field>
              <SaveButton busy={busy} />
            </form>
          );
        })}
      </div>
    </section>
  );
}

function AboutEditor({
  sections,
  busy,
  mutate,
}: {
  readonly sections: readonly Section[];
  readonly busy: boolean;
  readonly mutate: (
    action: () => Promise<unknown>,
    success: string
  ) => Promise<void>;
}): React.JSX.Element {
  const about = sections.find((section) => section.key === "about");

  return (
    <section className="flex flex-col gap-5">
      <ResourceHeading
        title="About content"
        description="Edit the portfolio biography. Section headings, order, visibility, navigation, and interface labels are fixed in the site design."
      />
      {about === undefined ? (
        <EditorStatus message="The About content record is missing." error />
      ) : (
        <AboutContentForm section={about} busy={busy} mutate={mutate} />
      )}
    </section>
  );
}

function AboutContentForm({
  section,
  busy,
  mutate,
}: {
  readonly section: Section;
  readonly busy: boolean;
  readonly mutate: (
    action: () => Promise<unknown>,
    success: string
  ) => Promise<void>;
}): React.JSX.Element {
  const translation = section.translations.find((item) => item.locale === "en");
  const content = record(translation?.content);

  return (
    <form
      className="border-border grid gap-3 border p-4 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void mutate(
          () =>
            adminRequest(`/admin/sections/${section.id}/translations/en`, {
              method: "PATCH",
              mutation: true,
              ifMatch: translation?.version ?? 0,
              body: {
                key: "about",
                translation: {
                  title: translation?.title ?? "About Me",
                  content: {
                    location: text(form, "location"),
                    role: text(form, "role"),
                    body: paragraphs(form, "body"),
                  },
                },
              },
            }),
          "About content saved."
        );
      }}
    >
      <div className="flex items-center gap-2 md:col-span-2">
        <h4 className="font-semibold">Biography</h4>
        <LocaleBadge locale="en" present={translation !== undefined} />
      </div>
      <Field label="Location">
        <input
          className={inputClass}
          name="location"
          required
          defaultValue={stringValue(content.location)}
          dir="ltr"
        />
      </Field>
      <Field label="Role">
        <input
          className={inputClass}
          name="role"
          required
          defaultValue={stringValue(content.role)}
          dir="ltr"
        />
      </Field>
      <Field
        label="About paragraphs"
        hint="Separate paragraphs with a blank line."
      >
        <textarea
          className={inputClass}
          name="body"
          required
          rows={8}
          defaultValue={stringArray(content.body).join("\n\n")}
          dir="ltr"
        />
      </Field>
      <div className="md:col-span-2">
        <SaveButton busy={busy} />
      </div>
    </form>
  );
}

function SocialEditor({
  items,
  busy,
  mutate,
}: {
  readonly items: readonly SocialLink[];
  readonly busy: boolean;
  readonly mutate: (
    action: () => Promise<unknown>,
    success: string
  ) => Promise<void>;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-5">
      <ResourceHeading
        title="Footer and social links"
        description="Social and donation links require HTTPS. Email links use a validated mailto address."
      />
      <SocialForm busy={busy} mutate={mutate} />
      {items.map((item) => (
        <SocialForm key={item.id} item={item} busy={busy} mutate={mutate} />
      ))}
    </section>
  );
}

function SocialForm({
  item,
  busy,
  mutate,
}: {
  readonly item?: SocialLink;
  readonly busy: boolean;
  readonly mutate: (
    action: () => Promise<unknown>,
    success: string
  ) => Promise<void>;
}): React.JSX.Element {
  return (
    <form
      className={`border-border grid gap-3 border p-4 md:grid-cols-3 ${item?.archivedAt === null || item === undefined ? "" : "opacity-70"}`}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const body = {
          labelByLocale: {
            en: text(form, "labelEn"),
          },
          kind: text(form, "kind"),
          url: text(form, "url"),
          iconKey: nullable(form, "iconKey"),
          rel: nullable(form, "rel"),
          enabled: form.has("enabled"),
          sortOrder: integer(form, "sortOrder"),
        };
        void mutate(
          () =>
            adminRequest(
              item === undefined
                ? "/admin/social-links"
                : `/admin/social-links/${item.id}`,
              {
                method: item === undefined ? "POST" : "PATCH",
                mutation: true,
                ...(item === undefined ? {} : { ifMatch: item.version }),
                body,
              }
            ),
          item === undefined ? "Social link created." : "Social link saved."
        );
      }}
    >
      <h4 className="font-semibold md:col-span-3">
        {item === undefined ? "Add social link" : item.labelByLocale.en}
      </h4>
      <Field label="English label">
        <input
          className={inputClass}
          name="labelEn"
          required
          defaultValue={item?.labelByLocale.en ?? ""}
        />
      </Field>
      <Field label="Kind">
        <select
          className={inputClass}
          name="kind"
          defaultValue={item?.kind ?? "SOCIAL"}
        >
          <option value="SOCIAL">Social</option>
          <option value="DONATE">Donation</option>
          <option value="EMAIL">Email</option>
        </select>
      </Field>
      <Field label="URL">
        <input
          className={inputClass}
          name="url"
          required
          defaultValue={item?.url ?? "https://"}
        />
      </Field>
      <Field label="Icon key">
        <input
          className={inputClass}
          name="iconKey"
          defaultValue={item?.iconKey ?? ""}
        />
      </Field>
      <Field label="Link relationship">
        <input
          className={inputClass}
          name="rel"
          defaultValue={item?.rel ?? "noopener noreferrer"}
        />
      </Field>
      <Field label="Order">
        <input
          className={inputClass}
          name="sortOrder"
          type="number"
          min="0"
          required
          defaultValue={item?.sortOrder ?? 0}
        />
      </Field>
      <Check
        name="enabled"
        label="Enabled"
        defaultChecked={item?.enabled ?? true}
      />
      <div className="flex flex-wrap gap-2 md:col-span-3">
        <SaveButton busy={busy}>
          {item === undefined ? "Create link" : "Save changes"}
        </SaveButton>
        {item === undefined ? null : (
          <ArchiveButton
            resource="social-links"
            item={item}
            busy={busy}
            mutate={mutate}
          />
        )}
      </div>
    </form>
  );
}

function ArchiveButton({
  resource,
  item,
  busy,
  mutate,
}: {
  readonly resource: string;
  readonly item: {
    readonly id: string;
    readonly version: number;
    readonly archivedAt: string | null;
  };
  readonly busy: boolean;
  readonly mutate: (
    action: () => Promise<unknown>,
    success: string
  ) => Promise<void>;
}): React.JSX.Element {
  const archived = item.archivedAt !== null;
  return (
    <button
      type="button"
      disabled={busy}
      className="border-border border px-4 py-2 text-sm disabled:opacity-60"
      onClick={() => {
        if (
          !archived &&
          !window.confirm("Archive this item? It will stop appearing publicly.")
        )
          return;
        void mutate(
          () =>
            adminRequest(
              `/admin/resources/${resource}/${item.id}/${archived ? "restore" : "archive"}`,
              {
                method: "POST",
                mutation: true,
                body: { confirm: true, version: item.version },
              }
            ),
          archived ? "Item restored." : "Item archived."
        );
      }}
    >
      {archived ? "Restore" : "Archive"}
    </button>
  );
}

function text(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}
function nullable(form: FormData, name: string): string | null {
  const value = text(form, name);
  return value.length === 0 ? null : value;
}
function integer(form: FormData, name: string): number {
  return Number.parseInt(text(form, name), 10);
}
function lines(form: FormData, name: string): string[] {
  return text(form, name)
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean);
}
function paragraphs(form: FormData, name: string): string[] {
  return text(form, name)
    .split(/\r?\n\s*\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean);
}
function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
