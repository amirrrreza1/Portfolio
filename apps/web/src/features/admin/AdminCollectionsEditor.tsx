"use client";

import { useCallback, useEffect, useState } from "react";

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

type LocalizedName = {
  readonly locale: "en" | "fa";
  readonly name: string;
  readonly version: number;
};
type Skill = {
  readonly id: string;
  readonly categoryId: string;
  readonly name: string;
  readonly color: string;
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly archivedAt: string | null;
  readonly version: number;
};
type Category = {
  readonly id: string;
  readonly key: string;
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly archivedAt: string | null;
  readonly version: number;
  readonly translations: readonly LocalizedName[];
  readonly skills: readonly Skill[];
};
type ProjectTranslation = {
  readonly locale: "en" | "fa";
  readonly title: string;
  readonly summary: string;
  readonly longDescription: string | null;
  readonly version: number;
};
type Project = {
  readonly id: string;
  readonly slug: string;
  readonly status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "ARCHIVED";
  readonly demoUrl: string | null;
  readonly repositoryUrl: string | null;
  readonly featured: boolean;
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly archivedAt: string | null;
  readonly version: number;
  readonly skills: readonly {
    readonly skillId: string;
    readonly sortOrder: number;
  }[];
  readonly translations: readonly ProjectTranslation[];
};
type CertificateTranslation = {
  readonly locale: "en" | "fa";
  readonly title: string;
  readonly description: string | null;
  readonly version: number;
};
type Certificate = {
  readonly id: string;
  readonly issuerName: string;
  readonly issuerUrl: string | null;
  readonly instructorName: string | null;
  readonly instructorUrl: string | null;
  readonly scoreText: string | null;
  readonly issuedAt: string;
  readonly credentialUrl: string | null;
  readonly mediaId: string | null;
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly archivedAt: string | null;
  readonly version: number;
  readonly translations: readonly CertificateTranslation[];
};
type Quote = {
  readonly id: string;
  readonly textByLocale: Record<string, string>;
  readonly author: string | null;
  readonly sourceUrl: string | null;
  readonly enabled: boolean;
  readonly pinned: boolean;
  readonly sortOrder: number;
  readonly archivedAt: string | null;
  readonly version: number;
};
type State = {
  readonly categories: readonly Category[];
  readonly projects: readonly Project[];
  readonly certificates: readonly Certificate[];
  readonly quotes: readonly Quote[];
};

export default function AdminCollectionsEditor(): React.JSX.Element {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      const [categories, projects, certificates, quotes] = await Promise.all([
        adminRequest<readonly Category[]>("/admin/skill-categories"),
        adminRequest<readonly Project[]>("/admin/projects"),
        adminRequest<readonly Certificate[]>("/admin/certificates"),
        adminRequest<readonly Quote[]>("/admin/quotes"),
      ]);
      setState({ categories, projects, certificates, quotes });
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
  if (state === null)
    return (
      <EditorStatus
        message={message ?? "Loading portfolio collections…"}
        error={failed}
      />
    );
  const allSkills = state.categories.flatMap((category) => category.skills);
  const missing =
    state.categories.filter(
      (item) => !item.translations.some(({ locale }) => locale === "en")
    ).length +
    state.projects.filter(
      (item) => !item.translations.some(({ locale }) => locale === "en")
    ).length +
    state.certificates.filter(
      (item) => !item.translations.some(({ locale }) => locale === "en")
    ).length +
    state.quotes.filter((item) => item.textByLocale.en === undefined).length;
  return (
    <div className="flex flex-col gap-10">
      <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 border p-4">
        <div>
          <p className="font-semibold">Collection readiness</p>
          <p className="text-text-muted text-sm">
            {missing === 0
              ? "Every portfolio collection has English content."
              : `${missing} record${missing === 1 ? " needs" : "s need"} English content.`}
          </p>
        </div>
        <EditorStatus message={message} error={failed} />
      </div>
      <SkillsEditor categories={state.categories} busy={busy} mutate={mutate} />
      <ProjectsEditor
        projects={state.projects}
        skills={allSkills}
        busy={busy}
        mutate={mutate}
      />
      <CertificatesEditor
        certificates={state.certificates}
        busy={busy}
        mutate={mutate}
      />
      <QuotesEditor quotes={state.quotes} busy={busy} mutate={mutate} />
    </div>
  );
}

function SkillsEditor({
  categories,
  busy,
  mutate,
}: {
  readonly categories: readonly Category[];
  readonly busy: boolean;
  readonly mutate: Mutate;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-5">
      <ResourceHeading title="Skills and categories" />
      <form
        className="border-border grid gap-3 border p-4 md:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void mutate(
            () =>
              adminRequest("/admin/skill-categories", {
                method: "POST",
                mutation: true,
                body: {
                  key: text(form, "key"),
                  enabled: form.has("enabled"),
                  sortOrder: integer(form, "sortOrder"),
                },
              }),
            "Category created. Add both labels before enabling it."
          );
        }}
      >
        <h4 className="font-semibold md:col-span-3">Add category</h4>
        <Field label="Stable key">
          <input
            className={inputClass}
            name="key"
            required
            pattern="[a-z][a-z0-9]*(?:-[a-z0-9]+)*"
          />
        </Field>
        <Field label="Order">
          <input
            className={inputClass}
            name="sortOrder"
            required
            type="number"
            min="0"
            defaultValue="0"
          />
        </Field>
        <Check name="enabled" label="Enabled" />
        <div className="md:col-span-3">
          <SaveButton busy={busy}>Create category</SaveButton>
        </div>
      </form>
      {categories.map((category) => (
        <details
          className={`border-border border ${category.archivedAt === null ? "" : "opacity-70"}`}
          key={category.id}
        >
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4">
            <span className="font-semibold">
              {category.translations.find((item) => item.locale === "en")
                ?.name ?? category.key}
            </span>
            <span className="flex gap-2">
              {(["en"] as const).map((locale) => (
                <LocaleBadge
                  key={locale}
                  locale={locale}
                  present={category.translations.some(
                    (item) => item.locale === locale
                  )}
                />
              ))}
            </span>
          </summary>
          <div className="border-border flex flex-col gap-5 border-t p-4">
            <form
              className="grid gap-3 md:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void mutate(
                  () =>
                    adminRequest(`/admin/skill-categories/${category.id}`, {
                      method: "PATCH",
                      mutation: true,
                      ifMatch: category.version,
                      body: {
                        key: text(form, "key"),
                        enabled: form.has("enabled"),
                        sortOrder: integer(form, "sortOrder"),
                      },
                    }),
                  "Category saved."
                );
              }}
            >
              <Field label="Stable key">
                <input
                  className={inputClass}
                  name="key"
                  required
                  defaultValue={category.key}
                />
              </Field>
              <Field label="Order">
                <input
                  className={inputClass}
                  name="sortOrder"
                  required
                  type="number"
                  min="0"
                  defaultValue={category.sortOrder}
                />
              </Field>
              <Check
                name="enabled"
                label="Enabled"
                defaultChecked={category.enabled}
              />
              <div className="flex gap-2 md:col-span-3">
                <SaveButton busy={busy} />
                <ArchiveButton
                  resource="skill-categories"
                  item={category}
                  busy={busy}
                  mutate={mutate}
                />
              </div>
            </form>
            <div className="grid gap-3 lg:grid-cols-2">
              {(["en"] as const).map((locale) => {
                const value = category.translations.find(
                  (item) => item.locale === locale
                );
                return (
                  <form
                    key={locale}
                    className="border-border flex flex-col gap-3 border p-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      void mutate(
                        () =>
                          adminRequest(
                            `/admin/skill-categories/${category.id}/translations/${locale}`,
                            {
                              method: "PATCH",
                              mutation: true,
                              ifMatch: value?.version ?? 0,
                              body: { name: text(form, "name") },
                            }
                          ),
                        `${locale.toUpperCase()} category label saved.`
                      );
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">English</span>
                      <LocaleBadge
                        locale={locale}
                        present={value !== undefined}
                      />
                    </div>
                    <Field label="Category name">
                      <input
                        className={inputClass}
                        name="name"
                        required
                        defaultValue={value?.name ?? ""}
                        dir="ltr"
                      />
                    </Field>
                    <SaveButton busy={busy} />
                  </form>
                );
              })}
            </div>
            <SkillForm
              categoryId={category.id}
              categories={categories}
              busy={busy}
              mutate={mutate}
            />
            {category.skills.map((skill) => (
              <SkillForm
                key={skill.id}
                skill={skill}
                categoryId={category.id}
                categories={categories}
                busy={busy}
                mutate={mutate}
              />
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}

function SkillForm({
  skill,
  categoryId,
  categories,
  busy,
  mutate,
}: {
  readonly skill?: Skill;
  readonly categoryId: string;
  readonly categories: readonly Category[];
  readonly busy: boolean;
  readonly mutate: Mutate;
}): React.JSX.Element {
  return (
    <form
      className={`border-border grid gap-3 border p-3 md:grid-cols-3 ${skill?.archivedAt === null || skill === undefined ? "" : "opacity-70"}`}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const body = {
          categoryId: text(form, "categoryId"),
          name: text(form, "name"),
          color: text(form, "color"),
          enabled: form.has("enabled"),
          sortOrder: integer(form, "sortOrder"),
        };
        void mutate(
          () =>
            adminRequest(
              skill === undefined
                ? "/admin/skills"
                : `/admin/skills/${skill.id}`,
              {
                method: skill === undefined ? "POST" : "PATCH",
                mutation: true,
                ...(skill === undefined ? {} : { ifMatch: skill.version }),
                body,
              }
            ),
          skill === undefined ? "Skill created." : "Skill saved."
        );
      }}
    >
      <h5 className="font-semibold md:col-span-3">
        {skill?.name ?? "Add skill"}
      </h5>
      <Field label="Category">
        <select
          className={inputClass}
          name="categoryId"
          defaultValue={skill?.categoryId ?? categoryId}
        >
          {categories
            .filter((item) => item.archivedAt === null)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.translations.find((label) => label.locale === "en")
                  ?.name ?? item.key}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Name">
        <input
          className={inputClass}
          name="name"
          required
          defaultValue={skill?.name ?? ""}
        />
      </Field>
      <Field label="Colour">
        <input
          className={inputClass}
          name="color"
          type="color"
          required
          defaultValue={skill?.color ?? "#0070f3"}
        />
      </Field>
      <Field label="Order">
        <input
          className={inputClass}
          name="sortOrder"
          type="number"
          min="0"
          required
          defaultValue={skill?.sortOrder ?? 0}
        />
      </Field>
      <Check
        name="enabled"
        label="Enabled"
        defaultChecked={skill?.enabled ?? true}
      />
      <div className="flex gap-2 md:col-span-3">
        <SaveButton busy={busy}>
          {skill === undefined ? "Create skill" : "Save changes"}
        </SaveButton>
        {skill === undefined ? null : (
          <ArchiveButton
            resource="skills"
            item={skill}
            busy={busy}
            mutate={mutate}
          />
        )}
      </div>
    </form>
  );
}

function ProjectsEditor({
  projects,
  skills,
  busy,
  mutate,
}: {
  readonly projects: readonly Project[];
  readonly skills: readonly Skill[];
  readonly busy: boolean;
  readonly mutate: Mutate;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-5">
      <ResourceHeading title="Projects" />
      <ProjectForm skills={skills} busy={busy} mutate={mutate} />
      {projects.map((project) => (
        <ProjectForm
          key={project.id}
          project={project}
          skills={skills}
          busy={busy}
          mutate={mutate}
        />
      ))}
    </section>
  );
}

function ProjectForm({
  project,
  skills,
  busy,
  mutate,
}: {
  readonly project?: Project;
  readonly skills: readonly Skill[];
  readonly busy: boolean;
  readonly mutate: Mutate;
}): React.JSX.Element {
  const selected = new Set(project?.skills.map((item) => item.skillId) ?? []);
  return (
    <details
      open={project === undefined}
      className={`border-border border ${project?.archivedAt === null || project === undefined ? "" : "opacity-70"}`}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4">
        <span className="font-semibold">
          {project?.translations.find((item) => item.locale === "en")?.title ??
            project?.slug ??
            "Add project"}
        </span>
        {project === undefined ? null : (
          <span className="flex gap-2">
            {(["en"] as const).map((locale) => (
              <LocaleBadge
                key={locale}
                locale={locale}
                present={project.translations.some(
                  (item) => item.locale === locale
                )}
              />
            ))}
          </span>
        )}
      </summary>
      <div className="border-border flex flex-col gap-5 border-t p-4">
        <form
          className="grid gap-3 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const skillIds = form.getAll("skillId").map(String);
            const body = {
              slug: text(form, "slug"),
              status: text(form, "status"),
              demoUrl: nullable(form, "demoUrl"),
              repositoryUrl: nullable(form, "repositoryUrl"),
              featured: form.has("featured"),
              enabled: form.has("enabled"),
              sortOrder: integer(form, "sortOrder"),
              startedAt: nullable(form, "startedAt"),
              completedAt: nullable(form, "completedAt"),
              skills: skillIds.map((skillId, sortOrder) => ({
                skillId,
                sortOrder,
              })),
            };
            void mutate(
              () =>
                adminRequest(
                  project === undefined
                    ? "/admin/projects"
                    : `/admin/projects/${project.id}`,
                  {
                    method: project === undefined ? "POST" : "PATCH",
                    mutation: true,
                    ...(project === undefined
                      ? {}
                      : { ifMatch: project.version }),
                    body,
                  }
                ),
              project === undefined
                ? "Project created. Add both translations before enabling it."
                : "Project saved."
            );
          }}
        >
          <Field label="Slug">
            <input
              className={inputClass}
              name="slug"
              required
              defaultValue={project?.slug ?? ""}
            />
          </Field>
          <Field label="Status">
            <select
              className={inputClass}
              name="status"
              defaultValue={project?.status ?? "PLANNED"}
            >
              <option value="PLANNED">Planned</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="ARCHIVED">Archived status</option>
            </select>
          </Field>
          <Field label="Order">
            <input
              className={inputClass}
              name="sortOrder"
              type="number"
              min="0"
              required
              defaultValue={project?.sortOrder ?? 0}
            />
          </Field>
          <Field label="Demo URL">
            <input
              className={inputClass}
              name="demoUrl"
              type="url"
              defaultValue={project?.demoUrl ?? ""}
            />
          </Field>
          <Field label="Repository URL">
            <input
              className={inputClass}
              name="repositoryUrl"
              type="url"
              defaultValue={project?.repositoryUrl ?? ""}
            />
          </Field>
          <Field label="Started">
            <input
              className={inputClass}
              name="startedAt"
              type="date"
              defaultValue={date(project?.startedAt)}
            />
          </Field>
          <Field label="Completed">
            <input
              className={inputClass}
              name="completedAt"
              type="date"
              defaultValue={date(project?.completedAt)}
            />
          </Field>
          <div className="grid gap-2">
            <Check
              name="featured"
              label="Featured"
              defaultChecked={project?.featured}
            />
            <Check
              name="enabled"
              label="Enabled"
              defaultChecked={project?.enabled ?? true}
            />
          </div>
          <fieldset className="md:col-span-3">
            <legend className="mb-2 text-sm font-medium">Skills</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {skills
                .filter((skill) => skill.archivedAt === null)
                .map((skill) => (
                  <Check
                    key={skill.id}
                    name="skillId"
                    value={skill.id}
                    label={skill.name}
                    defaultChecked={selected.has(skill.id)}
                  />
                ))}
            </div>
          </fieldset>
          <div className="flex gap-2 md:col-span-3">
            <SaveButton busy={busy}>
              {project === undefined ? "Create project" : "Save changes"}
            </SaveButton>
            {project === undefined ? null : (
              <ArchiveButton
                resource="projects"
                item={project}
                busy={busy}
                mutate={mutate}
              />
            )}
          </div>
        </form>
        {project === undefined
          ? null
          : (["en"] as const).map((locale) => (
              <ProjectTranslationForm
                key={locale}
                project={project}
                locale={locale}
                busy={busy}
                mutate={mutate}
              />
            ))}
      </div>
    </details>
  );
}

function ProjectTranslationForm({
  project,
  locale,
  busy,
  mutate,
}: {
  readonly project: Project;
  readonly locale: "en" | "fa";
  readonly busy: boolean;
  readonly mutate: Mutate;
}): React.JSX.Element {
  const value = project.translations.find((item) => item.locale === locale);
  return (
    <form
      className="border-border grid gap-3 border-t pt-4 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void mutate(
          () =>
            adminRequest(
              `/admin/projects/${project.id}/translations/${locale}`,
              {
                method: "PATCH",
                mutation: true,
                ifMatch: value?.version ?? 0,
                body: {
                  title: text(form, "title"),
                  summary: text(form, "summary"),
                  longDescription: nullable(form, "longDescription"),
                },
              }
            ),
          `${locale.toUpperCase()} project copy saved.`
        );
      }}
    >
      <div className="flex items-center gap-2 md:col-span-2">
        <h5 className="font-semibold">English</h5>
        <LocaleBadge locale={locale} present={value !== undefined} />
      </div>
      <Field label="Title">
        <input
          className={inputClass}
          name="title"
          required
          defaultValue={value?.title ?? ""}
          dir={locale === "fa" ? "rtl" : "ltr"}
        />
      </Field>
      <Field label="Summary">
        <textarea
          className={inputClass}
          name="summary"
          required
          rows={3}
          defaultValue={value?.summary ?? ""}
          dir={locale === "fa" ? "rtl" : "ltr"}
        />
      </Field>
      <div className="md:col-span-2">
        <Field label="Long description (Markdown)">
          <textarea
            className={inputClass}
            name="longDescription"
            rows={8}
            defaultValue={value?.longDescription ?? ""}
            dir={locale === "fa" ? "rtl" : "ltr"}
          />
        </Field>
      </div>
      <div className="md:col-span-2">
        <SaveButton busy={busy} />
      </div>
    </form>
  );
}

function CertificatesEditor({
  certificates,
  busy,
  mutate,
}: {
  readonly certificates: readonly Certificate[];
  readonly busy: boolean;
  readonly mutate: Mutate;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-5">
      <ResourceHeading title="Certificates" />
      <CertificateForm busy={busy} mutate={mutate} />
      {certificates.map((item) => (
        <CertificateForm
          key={item.id}
          certificate={item}
          busy={busy}
          mutate={mutate}
        />
      ))}
    </section>
  );
}
function CertificateForm({
  certificate,
  busy,
  mutate,
}: {
  readonly certificate?: Certificate;
  readonly busy: boolean;
  readonly mutate: Mutate;
}): React.JSX.Element {
  return (
    <details
      open={certificate === undefined}
      className={`border-border border ${certificate?.archivedAt === null || certificate === undefined ? "" : "opacity-70"}`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
        <span className="font-semibold">
          {certificate?.translations.find((item) => item.locale === "en")
            ?.title ?? "Add certificate"}
        </span>
        {certificate === undefined ? null : (
          <span className="flex gap-2">
            {(["en"] as const).map((locale) => (
              <LocaleBadge
                key={locale}
                locale={locale}
                present={certificate.translations.some(
                  (item) => item.locale === locale
                )}
              />
            ))}
          </span>
        )}
      </summary>
      <div className="border-border flex flex-col gap-4 border-t p-4">
        <form
          className="grid gap-3 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const body = {
              issuerName: text(form, "issuerName"),
              issuerUrl: nullable(form, "issuerUrl"),
              instructorName: nullable(form, "instructorName"),
              instructorUrl: nullable(form, "instructorUrl"),
              scoreText: nullable(form, "scoreText"),
              issuedAt: text(form, "issuedAt"),
              credentialUrl: nullable(form, "credentialUrl"),
              mediaId: nullable(form, "mediaId"),
              enabled: form.has("enabled"),
              sortOrder: integer(form, "sortOrder"),
            };
            void mutate(
              () =>
                adminRequest(
                  certificate === undefined
                    ? "/admin/certificates"
                    : `/admin/certificates/${certificate.id}`,
                  {
                    method: certificate === undefined ? "POST" : "PATCH",
                    mutation: true,
                    ...(certificate === undefined
                      ? {}
                      : { ifMatch: certificate.version }),
                    body,
                  }
                ),
              certificate === undefined
                ? "Certificate created."
                : "Certificate saved."
            );
          }}
        >
          <Field label="Issuer">
            <input
              className={inputClass}
              name="issuerName"
              required
              defaultValue={certificate?.issuerName ?? ""}
            />
          </Field>
          <Field label="Issuer URL">
            <input
              className={inputClass}
              name="issuerUrl"
              type="url"
              defaultValue={certificate?.issuerUrl ?? ""}
            />
          </Field>
          <Field label="Issued date">
            <input
              className={inputClass}
              name="issuedAt"
              type="date"
              required
              defaultValue={
                date(certificate?.issuedAt) ||
                new Date().toISOString().slice(0, 10)
              }
            />
          </Field>
          <Field label="Instructor">
            <input
              className={inputClass}
              name="instructorName"
              defaultValue={certificate?.instructorName ?? ""}
            />
          </Field>
          <Field label="Instructor URL">
            <input
              className={inputClass}
              name="instructorUrl"
              type="url"
              defaultValue={certificate?.instructorUrl ?? ""}
            />
          </Field>
          <Field label="Score text">
            <input
              className={inputClass}
              name="scoreText"
              defaultValue={certificate?.scoreText ?? ""}
            />
          </Field>
          <Field label="Credential URL">
            <input
              className={inputClass}
              name="credentialUrl"
              type="url"
              defaultValue={certificate?.credentialUrl ?? ""}
            />
          </Field>
          <Field label="Verified PDF media ID">
            <input
              className={inputClass}
              name="mediaId"
              defaultValue={certificate?.mediaId ?? ""}
            />
          </Field>
          <Field label="Order">
            <input
              className={inputClass}
              name="sortOrder"
              type="number"
              min="0"
              required
              defaultValue={certificate?.sortOrder ?? 0}
            />
          </Field>
          <Check
            name="enabled"
            label="Enabled"
            defaultChecked={certificate?.enabled ?? true}
          />
          <div className="flex gap-2 md:col-span-3">
            <SaveButton busy={busy}>
              {certificate === undefined
                ? "Create certificate"
                : "Save changes"}
            </SaveButton>
            {certificate === undefined ? null : (
              <ArchiveButton
                resource="certificates"
                item={certificate}
                busy={busy}
                mutate={mutate}
              />
            )}
          </div>
        </form>
        {certificate === undefined
          ? null
          : (["en"] as const).map((locale) => (
              <CertificateTranslationForm
                key={locale}
                certificate={certificate}
                locale={locale}
                busy={busy}
                mutate={mutate}
              />
            ))}
      </div>
    </details>
  );
}
function CertificateTranslationForm({
  certificate,
  locale,
  busy,
  mutate,
}: {
  readonly certificate: Certificate;
  readonly locale: "en" | "fa";
  readonly busy: boolean;
  readonly mutate: Mutate;
}): React.JSX.Element {
  const value = certificate.translations.find((item) => item.locale === locale);
  return (
    <form
      className="border-border grid gap-3 border-t pt-4 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void mutate(
          () =>
            adminRequest(
              `/admin/certificates/${certificate.id}/translations/${locale}`,
              {
                method: "PATCH",
                mutation: true,
                ifMatch: value?.version ?? 0,
                body: {
                  title: text(form, "title"),
                  description: nullable(form, "description"),
                },
              }
            ),
          `${locale.toUpperCase()} certificate copy saved.`
        );
      }}
    >
      <div className="flex items-center gap-2 md:col-span-2">
        <h5 className="font-semibold">English</h5>
        <LocaleBadge locale={locale} present={value !== undefined} />
      </div>
      <Field label="Title">
        <input
          className={inputClass}
          name="title"
          required
          defaultValue={value?.title ?? ""}
          dir={locale === "fa" ? "rtl" : "ltr"}
        />
      </Field>
      <Field label="Description">
        <textarea
          className={inputClass}
          name="description"
          rows={3}
          defaultValue={value?.description ?? ""}
          dir={locale === "fa" ? "rtl" : "ltr"}
        />
      </Field>
      <div className="md:col-span-2">
        <SaveButton busy={busy} />
      </div>
    </form>
  );
}

function QuotesEditor({
  quotes,
  busy,
  mutate,
}: {
  readonly quotes: readonly Quote[];
  readonly busy: boolean;
  readonly mutate: Mutate;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-5">
      <ResourceHeading title="Daily quotes" />
      <QuoteForm busy={busy} mutate={mutate} />
      {quotes.map((quote) => (
        <QuoteForm key={quote.id} quote={quote} busy={busy} mutate={mutate} />
      ))}
    </section>
  );
}
function QuoteForm({
  quote,
  busy,
  mutate,
}: {
  readonly quote?: Quote;
  readonly busy: boolean;
  readonly mutate: Mutate;
}): React.JSX.Element {
  return (
    <form
      className={`border-border grid gap-3 border p-4 md:grid-cols-2 ${quote?.archivedAt === null || quote === undefined ? "" : "opacity-70"}`}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const body = {
          textByLocale: {
            en: text(form, "textEn"),
          },
          author: nullable(form, "author"),
          sourceUrl: nullable(form, "sourceUrl"),
          enabled: form.has("enabled"),
          pinned: form.has("pinned"),
          sortOrder: integer(form, "sortOrder"),
        };
        void mutate(
          () =>
            adminRequest(
              quote === undefined
                ? "/admin/quotes"
                : `/admin/quotes/${quote.id}`,
              {
                method: quote === undefined ? "POST" : "PATCH",
                mutation: true,
                ...(quote === undefined ? {} : { ifMatch: quote.version }),
                body,
              }
            ),
          quote === undefined ? "Quote created." : "Quote saved."
        );
      }}
    >
      <div className="flex items-center justify-between gap-3 md:col-span-2">
        <h4 className="font-semibold">
          {quote === undefined
            ? "Add quote"
            : quote.textByLocale.en.slice(0, 72)}
        </h4>
        <span className="flex gap-2">
          <LocaleBadge
            locale="en"
            present={quote?.textByLocale.en !== undefined}
          />
        </span>
      </div>
      <Field label="English text">
        <textarea
          className={inputClass}
          name="textEn"
          required
          rows={3}
          defaultValue={quote?.textByLocale.en ?? ""}
        />
      </Field>
      <Field label="Author">
        <input
          className={inputClass}
          name="author"
          defaultValue={quote?.author ?? ""}
        />
      </Field>
      <Field label="Source URL">
        <input
          className={inputClass}
          name="sourceUrl"
          type="url"
          defaultValue={quote?.sourceUrl ?? ""}
        />
      </Field>
      <Field label="Order">
        <input
          className={inputClass}
          name="sortOrder"
          type="number"
          min="0"
          required
          defaultValue={quote?.sortOrder ?? 0}
        />
      </Field>
      <div className="grid gap-2">
        <Check
          name="enabled"
          label="Enabled"
          defaultChecked={quote?.enabled ?? true}
        />
        <Check
          name="pinned"
          label="Pin this quote"
          defaultChecked={quote?.pinned}
        />
      </div>
      <div className="flex gap-2 md:col-span-2">
        <SaveButton busy={busy}>
          {quote === undefined ? "Create quote" : "Save changes"}
        </SaveButton>
        {quote === undefined ? null : (
          <ArchiveButton
            resource="quotes"
            item={quote}
            busy={busy}
            mutate={mutate}
          />
        )}
      </div>
    </form>
  );
}

type Mutate = (
  action: () => Promise<unknown>,
  success: string
) => Promise<void>;
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
  readonly mutate: Mutate;
}): React.JSX.Element {
  const archived = item.archivedAt !== null;
  return (
    <button
      className="border-border border px-4 py-2 text-sm disabled:opacity-60"
      type="button"
      disabled={busy}
      onClick={() => {
        if (
          !archived &&
          !window.confirm(
            "Archive this item? Referenced items must be detached first."
          )
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
function date(value: string | null | undefined): string {
  return value?.slice(0, 10) ?? "";
}
