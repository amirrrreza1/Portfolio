"use client";

import { useCallback, useEffect, useState } from "react";

import { adminRequest, describeAdminError } from "./admin-client";
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
  readonly mimeType: string;
  readonly processingState: string;
  readonly archivedAt: string | null;
};

type Resume = {
  readonly id: string;
  readonly label: string;
  readonly publicFilename: string | null;
  readonly activatedAt: string | null;
  readonly retiredAt: string | null;
  readonly createdAt: string;
  readonly version: number;
  readonly mediaAsset: {
    readonly displayName: string;
    readonly processingState: string;
  };
  readonly uploadedBy: { readonly displayName: string } | null;
};

export default function AdminResumeEditor(): React.JSX.Element {
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

  if (media === null || resumes === null) {
    return (
      <EditorStatus
        message={message ?? "Loading resume versions…"}
        error={failed}
      />
    );
  }

  const verifiedPdfs = media.filter(
    (item) =>
      item.archivedAt === null &&
      item.processingState === "VERIFIED" &&
      item.mimeType === "application/pdf"
  );

  return (
    <section className="flex flex-col gap-5">
      <ResourceHeading title="Resume versions" />
      <EditorStatus message={message} error={failed} />
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
        <Field label="Uploaded PDF">
          <select
            className={inputClass}
            name="mediaAssetId"
            required
            defaultValue=""
          >
            <option value="" disabled>
              Select a PDF from Media
            </option>
            {verifiedPdfs.map((item) => (
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
            placeholder="CV — September 2026"
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
                    if (!window.confirm("Activate this resume version now?"))
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

function text(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function nullable(form: FormData, name: string): string | null {
  const value = text(form, name);
  return value.length === 0 ? null : value;
}
