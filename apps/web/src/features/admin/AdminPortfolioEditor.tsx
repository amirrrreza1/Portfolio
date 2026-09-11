"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import { adminRequest, describeAdminError } from "./admin-client";
import {
  Check,
  EditorStatus,
  Field,
  inputClass,
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
        <p className="font-semibold">Portfolio content</p>
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
  const siteText = settings.translations.find((item) => item.locale === "en");

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
              githubUsername: settings.githubUsername,
              githubRepoAllowlist: settings.githubRepoAllowlist,
              githubCacheTtlSeconds: settings.githubCacheTtlSeconds,
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
      <ResourceHeading title="Site settings" />
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

      <form
        className="border-border flex flex-col gap-3 border p-4 lg:max-w-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void mutate(
            () =>
              adminRequest("/admin/settings/translations/en", {
                method: "PATCH",
                mutation: true,
                ifMatch: siteText?.version ?? 0,
                body: {
                  siteName: text(form, "siteName"),
                  titleTemplate: text(form, "titleTemplate"),
                  metaDescription: text(form, "metaDescription"),
                  keywords: lines(form, "keywords"),
                  footerLines: lines(form, "footerLines"),
                  footerRights: siteText?.footerRights ?? "All rights reserved",
                  resumeButtonLabel: siteText?.resumeButtonLabel ?? "Download",
                },
              }),
            "Site text saved."
          );
        }}
      >
        <Field label="Site name">
          <input
            className={inputClass}
            name="siteName"
            required
            defaultValue={siteText?.siteName ?? ""}
            dir="ltr"
          />
        </Field>
        <Field label="Title template">
          <input
            className={inputClass}
            name="titleTemplate"
            required
            defaultValue={siteText?.titleTemplate ?? ""}
            dir="ltr"
          />
        </Field>
        <Field label="Meta description">
          <textarea
            className={inputClass}
            name="metaDescription"
            required
            rows={4}
            defaultValue={siteText?.metaDescription ?? ""}
            dir="ltr"
          />
        </Field>
        <Field label="SEO keywords" hint="One reviewed keyword per line.">
          <textarea
            className={inputClass}
            name="keywords"
            rows={6}
            defaultValue={(siteText?.keywords ?? []).join("\n")}
            dir="ltr"
          />
        </Field>
        <Field label="Footer rotating lines" hint="Optional; one line per row.">
          <textarea
            className={inputClass}
            name="footerLines"
            rows={3}
            defaultValue={(siteText?.footerLines ?? []).join("\n")}
            dir="ltr"
          />
        </Field>
        <SaveButton busy={busy} />
      </form>
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
      <ResourceHeading title="About content" />
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
      <h4 className="font-semibold md:col-span-2">Biography</h4>
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
  const links = [
    { label: "GitHub", kind: "SOCIAL" as const },
    { label: "LinkedIn", kind: "SOCIAL" as const },
    { label: "Telegram", kind: "SOCIAL" as const },
    { label: "Donate", kind: "DONATE" as const },
  ].map((slot, sortOrder) => ({
    ...slot,
    sortOrder,
    item: items.find(
      (item) =>
        item.labelByLocale.en.toLocaleLowerCase() ===
        slot.label.toLocaleLowerCase()
    ),
  }));

  return (
    <section className="flex flex-col gap-5">
      <ResourceHeading title="Profile links" />
      <form
        className="border-border grid gap-4 border p-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void mutate(
            () =>
              Promise.all(
                links.map(({ item, kind, label, sortOrder }) => {
                  const body = {
                    labelByLocale: { en: label },
                    kind,
                    url: text(form, label),
                    iconKey: item?.iconKey ?? null,
                    rel: item?.rel ?? "noopener noreferrer",
                    enabled: item?.enabled ?? true,
                    sortOrder: item?.sortOrder ?? sortOrder,
                  };

                  return item === undefined
                    ? adminRequest("/admin/social-links", {
                        method: "POST",
                        mutation: true,
                        body,
                      })
                    : adminRequest(`/admin/social-links/${item.id}`, {
                        method: "PATCH",
                        mutation: true,
                        ifMatch: item.version,
                        body,
                      });
                })
              ),
            "Profile links saved."
          );
        }}
      >
        {links.map(({ item, label }) => (
          <Field key={label} label={`${label} link`}>
            <input
              className={inputClass}
              name={label}
              type="url"
              autoComplete="url"
              required
              defaultValue={item?.url ?? "https://"}
            />
          </Field>
        ))}
        <div className="md:col-span-2">
          <SaveButton busy={busy}>Save links</SaveButton>
        </div>
      </form>
    </section>
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
