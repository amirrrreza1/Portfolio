"use client";

import { useCallback, useEffect, useState } from "react";

import { adminRequest, describeAdminError } from "./admin-client";
import { AdminSortableList } from "./AdminSortableList";
import {
  Check,
  EditorStatus,
  Field,
  inputClass,
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
  return (
    <div className="flex flex-col gap-10">
      <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 border p-4">
        <div>
          <p className="font-semibold">Portfolio collections</p>
          <p className="text-text-muted text-sm">
            Manage the projects, skills, certificates, and quotes shown on the
            site.
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
      <div className="space-y-1">
        <ResourceHeading title="Skill categories" />
        <p className="text-text-muted text-sm">
          Categories are the collapsible groups shown on the site. Skills are
          the individual coloured badges inside each group. Drag the handles to
          set their display order.
        </p>
      </div>
      <form
        className="border-border grid gap-3 border p-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const name = text(form, "name");
          void mutate(async () => {
            const category = await adminRequest<Category>(
              "/admin/skill-categories",
              {
                method: "POST",
                mutation: true,
                body: {
                  key: stableKey(name, "category"),
                  enabled: form.has("enabled"),
                  sortOrder: nextSortOrder(categories),
                },
              }
            );
            await adminRequest(
              `/admin/skill-categories/${category.id}/translations/en`,
              {
                method: "PATCH",
                mutation: true,
                ifMatch: 0,
                body: { name },
              }
            );
          }, "Category created.");
        }}
      >
        <div className="md:col-span-2">
          <h4 className="font-semibold">Add a category</h4>
          <p className="text-text-muted text-sm">
            Use a broad group such as “Frontend” or “Design tools”.
          </p>
        </div>
        <Field label="Category name">
          <input className={inputClass} name="name" required maxLength={120} />
        </Field>
        <Check name="enabled" label="Show this category" defaultChecked />
        <div className="md:col-span-2">
          <SaveButton busy={busy}>Create category</SaveButton>
        </div>
      </form>
      <AdminSortableList
        items={categories}
        itemId={(category) => category.id}
        itemLabel={categoryName}
        busy={busy}
        onReorder={(ordered) => {
          void mutate(
            () =>
              Promise.all(
                ordered.map((category, sortOrder) =>
                  adminRequest(`/admin/skill-categories/${category.id}`, {
                    method: "PATCH",
                    mutation: true,
                    ifMatch: category.version,
                    body: categoryPayload(category, sortOrder),
                  })
                )
              ),
            "Category order saved."
          );
        }}
        renderItem={(category, dragHandle) => (
          <details
            className={`border-border border ${category.archivedAt === null ? "" : "opacity-70"}`}
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
              {dragHandle}
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {categoryName(category)}
                </span>
                <span className="text-text-muted block text-xs">
                  Category · {category.skills.length} skill
                  {category.skills.length === 1 ? "" : "s"} · Select to edit
                </span>
              </span>
              <span className="text-text-muted text-sm" aria-hidden="true">
                ▾
              </span>
            </summary>
            <div className="border-border flex flex-col gap-5 border-t p-4">
              <form
                className="grid gap-3 md:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const name = text(form, "name");
                  const translation = category.translations.find(
                    (item) => item.locale === "en"
                  );
                  void mutate(async () => {
                    await adminRequest(
                      `/admin/skill-categories/${category.id}`,
                      {
                        method: "PATCH",
                        mutation: true,
                        ifMatch: category.version,
                        body: {
                          key: stableKey(name, category.key),
                          enabled: form.has("enabled"),
                          sortOrder: category.sortOrder,
                        },
                      }
                    );
                    await adminRequest(
                      `/admin/skill-categories/${category.id}/translations/en`,
                      {
                        method: "PATCH",
                        mutation: true,
                        ifMatch: translation?.version ?? 0,
                        body: { name },
                      }
                    );
                  }, "Category saved.");
                }}
              >
                <Field
                  label="Category name"
                  hint="The internal identifier is created automatically from this name."
                >
                  <input
                    className={inputClass}
                    name="name"
                    required
                    maxLength={120}
                    defaultValue={categoryName(category)}
                    dir="ltr"
                  />
                </Field>
                <Check
                  name="enabled"
                  label="Show this category"
                  defaultChecked={category.enabled}
                />
                <div className="flex gap-2 md:col-span-2">
                  <SaveButton busy={busy} />
                  <ArchiveButton
                    resource="skill-categories"
                    item={category}
                    busy={busy}
                    mutate={mutate}
                  />
                </div>
              </form>
              <div className="border-border border-l-4 pl-4">
                <div className="mb-3">
                  <h5 className="font-semibold">Skills in this category</h5>
                  <p className="text-text-muted text-sm">
                    Add individual technologies, then drag them into the order
                    visitors should see.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <SkillForm
                    categoryId={category.id}
                    categories={categories}
                    siblingSkills={category.skills}
                    busy={busy}
                    mutate={mutate}
                  />
                  <AdminSortableList
                    items={category.skills}
                    itemId={(skill) => skill.id}
                    itemLabel={(skill) => skill.name}
                    busy={busy}
                    onReorder={(ordered) => {
                      void mutate(
                        () =>
                          Promise.all(
                            ordered.map((skill, sortOrder) =>
                              adminRequest(`/admin/skills/${skill.id}`, {
                                method: "PATCH",
                                mutation: true,
                                ifMatch: skill.version,
                                body: skillPayload(skill, sortOrder),
                              })
                            )
                          ),
                        "Skill order saved."
                      );
                    }}
                    renderItem={(skill, skillHandle) => (
                      <SkillForm
                        skill={skill}
                        dragHandle={skillHandle}
                        categoryId={category.id}
                        categories={categories}
                        siblingSkills={category.skills}
                        busy={busy}
                        mutate={mutate}
                      />
                    )}
                  />
                </div>
              </div>
            </div>
          </details>
        )}
      />
    </section>
  );
}

function SkillForm({
  skill,
  dragHandle,
  categoryId,
  categories,
  siblingSkills,
  busy,
  mutate,
}: {
  readonly skill?: Skill;
  readonly dragHandle?: React.ReactNode;
  readonly categoryId: string;
  readonly categories: readonly Category[];
  readonly siblingSkills: readonly Skill[];
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
          sortOrder: skill?.sortOrder ?? nextSortOrder(siblingSkills),
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
      <div className="flex items-center gap-3 md:col-span-3">
        {dragHandle}
        <div>
          <h6 className="font-semibold">{skill?.name ?? "Add a skill"}</h6>
          <p className="text-text-muted text-xs">
            {skill === undefined
              ? "A skill is one technology or tool inside this category."
              : "Skill"}
          </p>
        </div>
      </div>
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
      <Field
        label="Badge colour"
        hint="Colours must remain readable in both light and dark themes."
      >
        <input
          className={inputClass}
          name="color"
          type="color"
          required
          defaultValue={skill?.color ?? "#0070f3"}
        />
      </Field>
      <Check
        name="enabled"
        label="Show this skill"
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
      <div className="space-y-1">
        <ResourceHeading title="Projects" />
        <p className="text-text-muted text-sm">
          Drag projects into their display order. Progress is represented by one
          status instead of separate start and completion dates.
        </p>
      </div>
      <ProjectForm
        projects={projects}
        skills={skills}
        busy={busy}
        mutate={mutate}
      />
      <AdminSortableList
        items={projects}
        itemId={(project) => project.id}
        itemLabel={projectName}
        busy={busy}
        onReorder={(ordered) => {
          void mutate(
            () =>
              Promise.all(
                ordered.map((project, sortOrder) =>
                  adminRequest(`/admin/projects/${project.id}`, {
                    method: "PATCH",
                    mutation: true,
                    ifMatch: project.version,
                    body: projectPayload(project, sortOrder),
                  })
                )
              ),
            "Project order saved."
          );
        }}
        renderItem={(project, dragHandle) => (
          <ProjectForm
            project={project}
            dragHandle={dragHandle}
            projects={projects}
            skills={skills}
            busy={busy}
            mutate={mutate}
          />
        )}
      />
    </section>
  );
}

function ProjectForm({
  project,
  dragHandle,
  projects,
  skills,
  busy,
  mutate,
}: {
  readonly project?: Project;
  readonly dragHandle?: React.ReactNode;
  readonly projects: readonly Project[];
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
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
        {dragHandle}
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            {project === undefined ? "Add a project" : projectName(project)}
          </span>
          <span className="text-text-muted block text-xs">
            {project === undefined
              ? "Create the project and its public summary."
              : "Project · Select to edit"}
          </span>
        </span>
        {project === undefined ? null : <StatusBadge status={project.status} />}
        <span className="text-text-muted text-sm" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="border-border flex flex-col gap-5 border-t p-4">
        <form
          className="grid gap-3 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const skillIds = form.getAll("skillId").map(String);
            const title = text(form, "title");
            const body = {
              slug:
                project?.slug ??
                stableKey(title, `project-${Date.now().toString(36)}`),
              status: text(form, "status"),
              demoUrl: nullable(form, "demoUrl"),
              repositoryUrl: nullable(form, "repositoryUrl"),
              featured: form.has("featured"),
              enabled: form.has("enabled"),
              sortOrder: project?.sortOrder ?? nextSortOrder(projects),
              startedAt: project?.startedAt ?? null,
              completedAt: project?.completedAt ?? null,
              skills: skillIds.map((skillId, sortOrder) => ({
                skillId,
                sortOrder,
              })),
            };
            void mutate(
              async () => {
                if (project !== undefined) {
                  await adminRequest(`/admin/projects/${project.id}`, {
                    method: "PATCH",
                    mutation: true,
                    ifMatch: project.version,
                    body,
                  });
                  return;
                }
                const created = await adminRequest<Project>("/admin/projects", {
                  method: "POST",
                  mutation: true,
                  body,
                });
                await adminRequest(
                  `/admin/projects/${created.id}/translations/en`,
                  {
                    method: "PATCH",
                    mutation: true,
                    ifMatch: 0,
                    body: {
                      title,
                      summary: text(form, "summary"),
                      longDescription: null,
                    },
                  }
                );
              },
              project === undefined ? "Project created." : "Project saved."
            );
          }}
        >
          {project === undefined ? (
            <>
              <Field label="Project title">
                <input
                  className={inputClass}
                  name="title"
                  required
                  maxLength={200}
                />
              </Field>
              <Field label="Short summary">
                <textarea
                  className={inputClass}
                  name="summary"
                  required
                  rows={3}
                  maxLength={2000}
                />
              </Field>
            </>
          ) : null}
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
        {project === undefined ? null : (
          <ProjectContentForm project={project} busy={busy} mutate={mutate} />
        )}
      </div>
    </details>
  );
}

function ProjectContentForm({
  project,
  busy,
  mutate,
}: {
  readonly project: Project;
  readonly busy: boolean;
  readonly mutate: Mutate;
}): React.JSX.Element {
  const value = project.translations.find((item) => item.locale === "en");
  return (
    <form
      className="border-border grid gap-3 border-t pt-4 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void mutate(
          () =>
            adminRequest(`/admin/projects/${project.id}/translations/en`, {
              method: "PATCH",
              mutation: true,
              ifMatch: value?.version ?? 0,
              body: {
                title: text(form, "title"),
                summary: text(form, "summary"),
                longDescription: nullable(form, "longDescription"),
              },
            }),
          "Project content saved."
        );
      }}
    >
      <Field label="Title">
        <input
          className={inputClass}
          name="title"
          required
          defaultValue={value?.title ?? ""}
          dir="ltr"
        />
      </Field>
      <Field label="Summary">
        <textarea
          className={inputClass}
          name="summary"
          required
          rows={3}
          defaultValue={value?.summary ?? ""}
          dir="ltr"
        />
      </Field>
      <div className="md:col-span-2">
        <Field label="Long description (Markdown)">
          <textarea
            className={inputClass}
            name="longDescription"
            rows={8}
            defaultValue={value?.longDescription ?? ""}
            dir="ltr"
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
        {certificate === undefined ? null : (
          <CertificateContentForm
            certificate={certificate}
            busy={busy}
            mutate={mutate}
          />
        )}
      </div>
    </details>
  );
}
function CertificateContentForm({
  certificate,
  busy,
  mutate,
}: {
  readonly certificate: Certificate;
  readonly busy: boolean;
  readonly mutate: Mutate;
}): React.JSX.Element {
  const value = certificate.translations.find((item) => item.locale === "en");
  return (
    <form
      className="border-border grid gap-3 border-t pt-4 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void mutate(
          () =>
            adminRequest(
              `/admin/certificates/${certificate.id}/translations/en`,
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
          "Certificate content saved."
        );
      }}
    >
      <Field label="Title">
        <input
          className={inputClass}
          name="title"
          required
          defaultValue={value?.title ?? ""}
          dir="ltr"
        />
      </Field>
      <Field label="Description">
        <textarea
          className={inputClass}
          name="description"
          rows={3}
          defaultValue={value?.description ?? ""}
          dir="ltr"
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
      <div className="md:col-span-2">
        <h4 className="font-semibold">
          {quote === undefined
            ? "Add quote"
            : quote.textByLocale.en.slice(0, 72)}
        </h4>
      </div>
      <Field label="Quote text">
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

function stableKey(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : fallback;
}

function nextSortOrder(
  items: readonly { readonly sortOrder: number }[]
): number {
  return items.reduce((max, item) => Math.max(max, item.sortOrder + 1), 0);
}

function categoryName(category: Category): string {
  return (
    category.translations.find((item) => item.locale === "en")?.name ??
    category.key
  );
}

function categoryPayload(category: Category, sortOrder: number) {
  return {
    key: category.key,
    enabled: category.enabled,
    sortOrder,
  };
}

function skillPayload(skill: Skill, sortOrder: number) {
  return {
    categoryId: skill.categoryId,
    name: skill.name,
    color: skill.color,
    enabled: skill.enabled,
    sortOrder,
  };
}

function projectName(project: Project): string {
  return (
    project.translations.find((item) => item.locale === "en")?.title ??
    project.slug
  );
}

function projectPayload(project: Project, sortOrder: number) {
  return {
    slug: project.slug,
    status: project.status,
    demoUrl: project.demoUrl,
    repositoryUrl: project.repositoryUrl,
    featured: project.featured,
    enabled: project.enabled,
    sortOrder,
    startedAt: project.startedAt,
    completedAt: project.completedAt,
    skills: project.skills,
  };
}

function StatusBadge({
  status,
}: {
  readonly status: Project["status"];
}): React.JSX.Element {
  return (
    <span className="border-border bg-surface text-text-muted rounded border px-2 py-0.5 text-xs font-medium uppercase">
      {status.toLowerCase().replace(/_/g, " ")}
    </span>
  );
}
