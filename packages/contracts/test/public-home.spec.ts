import {
  publicHomeEnvelopeSchema,
  publicHomeSchema,
} from "../src/portfolio/index.js";
import { describe, expect, it } from "vitest";

const certificateId = "c12345678901234567890123";

function fixture() {
  return {
    locale: "en" as const,
    quote: {
      id: "q12345678901234567890123",
      text: "Make it work, make it right, make it fast.",
      author: "Kent Beck",
      sourceUrl: null,
    },
    certificates: [
      {
        id: certificateId,
        title: "Web Design 1",
        description: "HTML and CSS basics.",
        issuerName: "MFT",
        issuerUrl: "https://mftplus.com/",
        instructorName: "Turaj Armin",
        instructorUrl: "https://www.linkedin.com/in/turaj-armin-34ab14b6/",
        scoreText: "98/100",
        issuedAt: "2024-05-26",
        credentialUrl: null,
        downloadPath: `/api/v1/public/certificates/${certificateId}/file`,
      },
    ],
    resume: {
      label: "Resume",
      filename: "resume.pdf",
      downloadPath: "/api/v1/public/resume/file",
    },
  };
}

describe("public homepage contracts", () => {
  it("accepts the strict published homepage projection and envelope", () => {
    const data = publicHomeSchema.parse(fixture());
    expect(
      publicHomeEnvelopeSchema.safeParse({
        data,
        meta: { requestId: "request-home-en" },
      }).success
    ).toBe(true);
  });

  it.each([
    ["record version", { ...fixture(), version: 2 }],
    [
      "media storage key",
      {
        ...fixture(),
        certificates: [
          { ...fixture().certificates[0], storageKey: "media/private.pdf" },
        ],
      },
    ],
    [
      "unsafe download path",
      {
        ...fixture(),
        resume: { ...fixture().resume, downloadPath: "//evil.example/file" },
      },
    ],
    [
      "credential-bearing URL",
      {
        ...fixture(),
        certificates: [
          {
            ...fixture().certificates[0],
            issuerUrl: "https://user:secret@example.com/",
          },
        ],
      },
    ],
    [
      "invalid date",
      {
        ...fixture(),
        certificates: [
          { ...fixture().certificates[0], issuedAt: "2024-02-30" },
        ],
      },
    ],
  ])("rejects %s", (_label, value) => {
    expect(publicHomeSchema.safeParse(value).success).toBe(false);
  });
});
