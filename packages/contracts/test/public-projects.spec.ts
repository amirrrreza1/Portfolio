import { describe, expect, it } from "vitest";

import {
  publicProjectDetailEnvelopeSchema,
  publicProjectDetailSchema,
  publicProjectsEnvelopeSchema,
  publicProjectsSchema,
} from "../src/portfolio/index.js";

const categoryId = "h12345678901234567890123";
const skillId = "s12345678901234567890123";
const projectId = "p12345678901234567890123";

const validProjects = {
  locale: "fa",
  skillCategories: [
    {
      id: categoryId,
      key: "frameworks",
      name: "Frameworks",
      skills: [{ id: skillId, name: "Next.js", color: "#38bdf8" }],
    },
  ],
  projects: [
    {
      id: projectId,
      slug: "portfolio",
      title: "Portfolio",
      summary: "A public project summary.",
      status: "COMPLETED",
      demoUrl: null,
      repositoryUrl: "https://github.com/example/portfolio",
      featured: true,
      skillIds: [skillId],
      image: null,
    },
  ],
} as const;

describe("public project DTOs", () => {
  it("accepts the published allowlist and response envelope", () => {
    expect(publicProjectsSchema.parse(validProjects)).toEqual(validProjects);
    expect(
      publicProjectsEnvelopeSchema.safeParse({
        data: validProjects,
        meta: { requestId: "request-1" },
      }).success
    ).toBe(true);
  });

  it.each([
    ["legacyId", { ...validProjects.projects[0], legacyId: 1 }],
    ["version", { ...validProjects.projects[0], version: 4 }],
    ["storageKey", { ...validProjects.projects[0], storageKey: "media/a.pdf" }],
  ])("rejects leaked project field %s", (_name, project) => {
    expect(
      publicProjectsSchema.safeParse({
        ...validProjects,
        projects: [project],
      }).success
    ).toBe(false);
  });

  it("rejects unknown top-level fields and locales", () => {
    expect(
      publicProjectsSchema.safeParse({
        ...validProjects,
        locale: "ar",
      }).success
    ).toBe(false);
    expect(
      publicProjectsSchema.safeParse({
        ...validProjects,
        contactRecipientEmail: "owner@example.com",
      }).success
    ).toBe(false);
  });

  it("rejects unsafe URLs and archived public status", () => {
    expect(
      publicProjectsSchema.safeParse({
        ...validProjects,
        projects: [
          {
            ...validProjects.projects[0],
            demoUrl: "javascript:alert(1)",
          },
        ],
      }).success
    ).toBe(false);
    expect(
      publicProjectsSchema.safeParse({
        ...validProjects,
        projects: [{ ...validProjects.projects[0], status: "ARCHIVED" }],
      }).success
    ).toBe(false);
  });

  it("accepts a strict project detail with an opaque image path", () => {
    const detail = {
      locale: "en",
      project: {
        ...validProjects.projects[0],
        image: {
          src: "/api/v1/public/projects/portfolio/image",
          altText: "Portfolio dashboard",
          mimeType: "image/webp",
          width: 1600,
          height: 900,
        },
        longDescription: "## What it does\n\nA safe description.",
        startedAt: "2025-01-02",
        completedAt: null,
        skills: validProjects.skillCategories[0].skills,
      },
    } as const;

    expect(publicProjectDetailSchema.parse(detail)).toEqual(detail);
    expect(
      publicProjectDetailEnvelopeSchema.safeParse({
        data: detail,
        meta: { requestId: "request-detail" },
      }).success
    ).toBe(true);
  });

  it("rejects leaking image internals and incomplete dimensions", () => {
    const project = {
      ...validProjects.projects[0],
      image: {
        src: "/api/v1/public/projects/portfolio/image",
        altText: "Portfolio",
        mimeType: "image/png",
        width: 1200,
        height: null,
        storageKey: "media/private.png",
      },
    };
    expect(
      publicProjectsSchema.safeParse({
        ...validProjects,
        projects: [project],
      }).success
    ).toBe(false);
  });
});
