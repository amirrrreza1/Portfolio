"use client";

import { useCallback, useEffect, useState } from "react";

import { adminRequest, adminUpload, describeAdminError } from "./admin-client";
import {
  EditorStatus,
  Field,
  inputClass,
  ResourceHeading,
  SaveButton,
} from "./AdminEditorFields";
import { formatUtc } from "./format";

type Media = {
  readonly id: string;
  readonly displayName: string;
  readonly kind: "IMAGE" | "DOCUMENT";
  readonly mimeType: string;
  readonly byteSize: string;
  readonly checksumSha256: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly altText: string | null;
  readonly processingState: "PENDING" | "VERIFIED" | "QUARANTINED" | "FAILED";
  readonly visibility: "PUBLIC" | "PRIVATE";
  readonly archivedAt: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly references?: Record<string, number>;
};

type Resume = {
  readonly id: string;
  readonly mediaAssetId: string;
  readonly label: string;
  readonly publicFilename: string | null;
  readonly activatedAt: string | null;
  readonly retiredAt: string | null;
  readonly createdAt: string;
  readonly version: number;
  readonly mediaAsset: {
    readonly id: string;
    readonly displayName: string;
    readonly mimeType: string;
    readonly processingState: string;
  };
  readonly uploadedBy: { readonly displayName: string } | null;
};

export default function AdminMediaEditor(): React.JSX.Element {
  const [media, setMedia] = useState<readonly Media[] | null>(null);
  const [resumes, setResumes] = useState<readonly Resume[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      const [nextMedia, nextResumes] = await Promise.all([
        adminRequest<readonly Media[]>("/admin/media"),
        adminRequest<readonly Resume[]>("/admin/resumes"),
      ]);
      setMedia(nextMedia);
      setResumes(nextResumes);
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
  if (media === null || resumes === null)
    return (
      <EditorStatus
        message={message ?? "Loading media library…"}
        error={failed}
      />
    );
  const verifiedPdfs = media.filter(
    (item) =>
      item.archivedAt === null &&
      item.processingState === "VERIFIED" &&
      item.mimeType === "application/pdf"
  );
  return (
    <div className="flex flex-col gap-10">
      <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 border p-4">
        <div>
          <p className="font-semibold">Asset safety</p>
          <p className="text-text-muted text-sm">
            {
              media.filter((item) => item.processingState === "QUARANTINED")
                .length
            }{" "}
            quarantined ·{" "}
            {
              media.filter(
                (item) =>
                  item.processingState === "VERIFIED" &&
                  item.archivedAt === null
              ).length
            }{" "}
            verified and available
          </p>
        </div>
        <EditorStatus message={message} error={failed} />
      </div>
      <UploadForm busy={busy} mutate={mutate} />
      <MediaLibrary media={media} busy={busy} mutate={mutate} />
      <ResumeEditor
        resumes={resumes}
        media={verifiedPdfs}
        busy={busy}
        mutate={mutate}
      />
    </div>
  );
}

function UploadForm({
  busy,
  mutate,
}: {
  readonly busy: boolean;
  readonly mutate: Mutate;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-5">
      <ResourceHeading
        title="Upload media"
        description="Uploads are streamed under a fixed limit. Raster images are decoded, re-encoded, and stripped of metadata; PDFs must pass structural, page-count, and active-content policy."
      />
      <form
        className="border-border grid gap-4 border p-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const source = new FormData(event.currentTarget);
          const file = source.get("file");
          if (!(file instanceof File) || file.size === 0) return;
          const body = new FormData();
          body.append("kind", String(source.get("kind") ?? ""));
          body.append("visibility", String(source.get("visibility") ?? ""));
          body.append("altText", String(source.get("altText") ?? ""));
          body.append("file", file, file.name);
          void mutate(
            () => adminUpload("/admin/media", body),
            "Media verified and added to the library."
          );
        }}
      >
        <Field label="File">
          <input
            className={inputClass}
            name="file"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
            required
          />
        </Field>
        <Field label="Media class">
          <select className={inputClass} name="kind" defaultValue="IMAGE">
            <option value="IMAGE">Raster image</option>
            <option value="DOCUMENT">PDF document</option>
          </select>
        </Field>
        <Field label="Visibility">
          <select
            className={inputClass}
            name="visibility"
            defaultValue="PUBLIC"
          >
            <option value="PUBLIC">Public when referenced</option>
            <option value="PRIVATE">Private</option>
          </select>
        </Field>
        <Field
          label="Alternative text"
          hint="Required for images. Documents may leave this empty."
        >
          <textarea className={inputClass} name="altText" rows={3} />
        </Field>
        <div className="md:col-span-2">
          <SaveButton busy={busy}>Verify and upload</SaveButton>
        </div>
      </form>
    </section>
  );
}

function MediaLibrary({
  media,
  busy,
  mutate,
}: {
  readonly media: readonly Media[];
  readonly busy: boolean;
  readonly mutate: Mutate;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-5">
      <ResourceHeading
        title="Media library"
        description="Object keys remain private. The reference count must reach zero before an asset can be archived."
      />
      <div className="flex flex-col gap-3">
        {media.length === 0 ? (
          <p className="text-text-muted text-sm">No media has been uploaded.</p>
        ) : (
          media.map((item) => (
            <details
              className={`border-border border ${item.archivedAt === null ? "" : "opacity-70"}`}
              key={item.id}
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4">
                <span>
                  <span className="font-semibold">{item.displayName}</span>
                  <span className="text-text-muted ml-2 text-xs">
                    {item.processingState.toLowerCase()} ·{" "}
                    {formatBytes(item.byteSize)}
                  </span>
                </span>
                <span
                  className={
                    item.processingState === "VERIFIED"
                      ? "text-success text-xs"
                      : "text-danger text-xs"
                  }
                >
                  {referenceCount(item)} reference(s)
                </span>
              </summary>
              <form
                className="border-border grid gap-3 border-t p-4 md:grid-cols-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void mutate(
                    () =>
                      adminRequest(`/admin/media/${item.id}`, {
                        method: "PATCH",
                        mutation: true,
                        ifMatch: item.version,
                        body: {
                          displayName: text(form, "displayName"),
                          altText: nullable(form, "altText"),
                          visibility: text(form, "visibility"),
                        },
                      }),
                    "Media metadata saved."
                  );
                }}
              >
                <Field label="Display name">
                  <input
                    className={inputClass}
                    name="displayName"
                    required
                    defaultValue={item.displayName}
                  />
                </Field>
                <Field label="Visibility">
                  <select
                    className={inputClass}
                    name="visibility"
                    defaultValue={item.visibility}
                  >
                    <option value="PUBLIC">Public when referenced</option>
                    <option value="PRIVATE">Private</option>
                  </select>
                </Field>
                <Field label="Alternative text">
                  <input
                    className={inputClass}
                    name="altText"
                    required={item.kind === "IMAGE"}
                    defaultValue={item.altText ?? ""}
                  />
                </Field>
                <dl className="text-text-muted grid gap-1 text-xs md:col-span-3">
                  <div>
                    <dt className="inline font-semibold">ID: </dt>
                    <dd className="inline font-mono">{item.id}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold">SHA-256: </dt>
                    <dd className="inline font-mono break-all">
                      {item.checksumSha256}
                    </dd>
                  </div>
                  {item.width === null ? null : (
                    <div>
                      <dt className="inline font-semibold">Dimensions: </dt>
                      <dd className="inline">
                        {item.width} × {item.height}
                      </dd>
                    </div>
                  )}
                </dl>
                <div className="flex gap-2 md:col-span-3">
                  <SaveButton busy={busy} />
                  <button
                    type="button"
                    disabled={
                      busy ||
                      (item.archivedAt === null && referenceCount(item) > 0)
                    }
                    className="border-border border px-4 py-2 text-sm disabled:opacity-50"
                    onClick={() => {
                      const archived = item.archivedAt !== null;
                      if (
                        !archived &&
                        !window.confirm(
                          "Archive this unreferenced asset? The stored object is retained for recovery."
                        )
                      )
                        return;
                      void mutate(
                        () =>
                          adminRequest(
                            `/admin/resources/media/${item.id}/${archived ? "restore" : "archive"}`,
                            {
                              method: "POST",
                              mutation: true,
                              body: { confirm: true, version: item.version },
                            }
                          ),
                        archived ? "Media restored." : "Media archived."
                      );
                    }}
                  >
                    {item.archivedAt === null ? "Archive" : "Restore"}
                  </button>
                </div>
              </form>
            </details>
          ))
        )}
      </div>
    </section>
  );
}

function ResumeEditor({
  resumes,
  media,
  busy,
  mutate,
}: {
  readonly resumes: readonly Resume[];
  readonly media: readonly Media[];
  readonly busy: boolean;
  readonly mutate: Mutate;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-5">
      <ResourceHeading
        title="Resume versions"
        description="Create a version from a verified PDF, then activate it atomically. Activating an earlier version is the rollback path; prior files are never overwritten."
      />
      <form
        className="border-border grid gap-3 border p-4 md:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void mutate(
            () =>
              adminRequest("/admin/resumes", {
                method: "POST",
                mutation: true,
                body: {
                  mediaAssetId: text(form, "mediaAssetId"),
                  label: text(form, "label"),
                  publicFilename: nullable(form, "publicFilename"),
                },
              }),
            "Resume version created. Activate it when ready."
          );
        }}
      >
        <Field label="Verified PDF">
          <select
            className={inputClass}
            name="mediaAssetId"
            required
            defaultValue=""
          >
            <option value="" disabled>
              Select a PDF
            </option>
            {media.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Version label">
          <input
            className={inputClass}
            name="label"
            required
            placeholder="CV — August 2026"
          />
        </Field>
        <Field label="Public filename">
          <input
            className={inputClass}
            name="publicFilename"
            placeholder="resume.pdf"
          />
        </Field>
        <div className="md:col-span-3">
          <SaveButton busy={busy}>Create version</SaveButton>
        </div>
      </form>
      <div className="flex flex-col gap-3">
        {resumes.map((resume) => {
          const active =
            resume.activatedAt !== null && resume.retiredAt === null;
          return (
            <form
              key={resume.id}
              className={`border-border grid gap-3 border p-4 md:grid-cols-3 ${active ? "border-success" : ""}`}
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void mutate(
                  () =>
                    adminRequest(`/admin/resumes/${resume.id}`, {
                      method: "PATCH",
                      mutation: true,
                      ifMatch: resume.version,
                      body: {
                        label: text(form, "label"),
                        publicFilename: nullable(form, "publicFilename"),
                      },
                    }),
                  "Resume metadata saved."
                );
              }}
            >
              <div className="md:col-span-3">
                <span className="font-semibold">
                  {active ? "Active · " : ""}
                  {resume.mediaAsset.displayName}
                </span>
                <p className="text-text-muted text-xs">
                  Created {formatUtc(resume.createdAt)} ·{" "}
                  {resume.uploadedBy?.displayName ?? "Unknown uploader"}
                </p>
              </div>
              <Field label="Label">
                <input
                  className={inputClass}
                  name="label"
                  required
                  defaultValue={resume.label}
                />
              </Field>
              <Field label="Public filename">
                <input
                  className={inputClass}
                  name="publicFilename"
                  defaultValue={resume.publicFilename ?? ""}
                />
              </Field>
              <div className="flex items-end gap-2">
                <SaveButton busy={busy} />
                <button
                  type="button"
                  disabled={
                    busy ||
                    active ||
                    resume.mediaAsset.processingState !== "VERIFIED"
                  }
                  className="border-border border px-4 py-2 text-sm disabled:opacity-50"
                  onClick={() => {
                    if (
                      !window.confirm(
                        active
                          ? "This resume is already active."
                          : "Activate this resume version now?"
                      )
                    )
                      return;
                    void mutate(
                      () =>
                        adminRequest(`/admin/resumes/${resume.id}/activate`, {
                          method: "POST",
                          mutation: true,
                          ifMatch: resume.version,
                        }),
                      "Active resume changed atomically."
                    );
                  }}
                >
                  Activate
                </button>
              </div>
            </form>
          );
        })}
      </div>
    </section>
  );
}

type Mutate = (
  action: () => Promise<unknown>,
  success: string
) => Promise<void>;
function text(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}
function nullable(form: FormData, name: string): string | null {
  const value = text(form, name);
  return value.length === 0 ? null : value;
}
function referenceCount(media: Media): number {
  return Object.values(media.references ?? {}).reduce(
    (total, value) => total + value,
    0
  );
}
function formatBytes(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return value;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
