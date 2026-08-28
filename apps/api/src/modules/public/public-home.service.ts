import { Logger } from "@nestjs/common";
import type { Database } from "@portfolio/database";
import type { Locale } from "@portfolio/contracts/common";
import {
  localizedMapSchema,
  trimmedTextSchema,
} from "@portfolio/contracts/common";
import {
  publicHomeSchema,
  type PublicHome,
} from "@portfolio/contracts/portfolio";

import type { PublicMediaReader } from "./public-media.reader.js";

export interface PublicHomeRead {
  readonly data: PublicHome;
  readonly lastModified: Date;
}

export interface PublicFileRead {
  readonly filename: string;
  readonly mimeType: "application/pdf";
  readonly checksumSha256: string;
  readonly lastModified: Date;
  readonly readBytes: () => Promise<Uint8Array>;
}

type Translation = {
  readonly locale: "en" | "fa";
  readonly updatedAt: Date;
};

const quoteTextMapSchema = localizedMapSchema(
  trimmedTextSchema({ max: 10_000 })
).strict();

/** Published homepage collections and authorized document reads. */
export class PublicHomeService {
  private static readonly logger = new Logger(PublicHomeService.name);

  public constructor(
    private readonly database: Database,
    private readonly media: PublicMediaReader,
    private readonly now: () => Date = () => new Date()
  ) {}

  async read(locale: Locale): Promise<PublicHomeRead> {
    const locales =
      locale === "en" ? (["en"] as const) : (["fa", "en"] as const);

    const [certificateRows, quoteRows, resumeRow] = await Promise.all([
      this.database.certificate.findMany({
        where: {
          enabled: true,
          archivedAt: null,
          media: {
            is: {
              kind: "DOCUMENT",
              processingState: "VERIFIED",
              visibility: "PUBLIC",
              archivedAt: null,
            },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          issuerName: true,
          issuerUrl: true,
          instructorName: true,
          instructorUrl: true,
          scoreText: true,
          issuedAt: true,
          credentialUrl: true,
          updatedAt: true,
          translations: {
            where: { locale: { in: [...locales] } },
            select: {
              locale: true,
              title: true,
              description: true,
              updatedAt: true,
            },
          },
          media: { select: { updatedAt: true } },
        },
      }),
      this.database.quote.findMany({
        where: { enabled: true },
        orderBy: [{ pinned: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          textByLocale: true,
          author: true,
          sourceUrl: true,
          pinned: true,
          updatedAt: true,
        },
      }),
      this.database.resumeVersion.findFirst({
        where: {
          activatedAt: { not: null },
          retiredAt: null,
          mediaAsset: {
            is: {
              kind: "DOCUMENT",
              processingState: "VERIFIED",
              archivedAt: null,
            },
          },
        },
        orderBy: { activatedAt: "desc" },
        select: {
          label: true,
          publicFilename: true,
          updatedAt: true,
          mediaAsset: { select: { displayName: true, updatedAt: true } },
        },
      }),
    ]);

    const certificates = certificateRows.flatMap((certificate) => {
      const translation = findTranslation(certificate.translations, locale);
      const fault =
        certificate.media === null
          ? "missing verified PDF"
          : translation === null
            ? "missing English translation"
            : null;
      if (fault !== null || translation === null) {
        PublicHomeService.logger.error(
          `Excluding certificate ${certificate.id} from the public home read: ${fault ?? "missing English translation"}.`
        );
        return [];
      }
      return [
        {
          id: certificate.id,
          title: translation.title,
          description: translation.description,
          issuerName: certificate.issuerName,
          issuerUrl: certificate.issuerUrl,
          instructorName: certificate.instructorName,
          instructorUrl: certificate.instructorUrl,
          scoreText: certificate.scoreText,
          issuedAt: dateOnly(certificate.issuedAt),
          credentialUrl: certificate.credentialUrl,
          downloadPath: `/api/v1/public/certificates/${certificate.id}/file`,
        },
      ];
    });

    const selectedQuote = selectQuote(quoteRows, this.now());
    const quote =
      selectedQuote === undefined
        ? null
        : {
            id: selectedQuote.id,
            text: resolveQuoteText(selectedQuote.textByLocale, locale),
            author: selectedQuote.author,
            sourceUrl: selectedQuote.sourceUrl,
          };

    const resume =
      resumeRow === null
        ? null
        : {
            label: resumeRow.label,
            filename:
              resumeRow.publicFilename ?? resumeRow.mediaAsset.displayName,
            downloadPath: "/api/v1/public/resume/file",
          };

    return {
      data: publicHomeSchema.parse({ locale, quote, certificates, resume }),
      lastModified: latestDate([
        ...certificateRows.flatMap((certificate) => [
          certificate.updatedAt,
          ...(certificate.media === null ? [] : [certificate.media.updatedAt]),
          ...certificate.translations.map(
            (translation) => translation.updatedAt
          ),
        ]),
        ...quoteRows.map((quoteRow) => quoteRow.updatedAt),
        ...(resumeRow === null
          ? []
          : [resumeRow.updatedAt, resumeRow.mediaAsset.updatedAt]),
      ]),
    };
  }

  async readCertificateFile(id: string): Promise<PublicFileRead | null> {
    const row = await this.database.certificate.findFirst({
      where: {
        id,
        enabled: true,
        archivedAt: null,
        media: {
          is: {
            kind: "DOCUMENT",
            processingState: "VERIFIED",
            visibility: "PUBLIC",
            archivedAt: null,
          },
        },
      },
      select: {
        updatedAt: true,
        media: {
          select: {
            storageKey: true,
            displayName: true,
            mimeType: true,
            byteSize: true,
            checksumSha256: true,
            updatedAt: true,
          },
        },
      },
    });
    if (row === null || row.media === null) return null;
    return this.createVerifiedPdf(
      row.media,
      row.media.displayName,
      latestDate([row.updatedAt, row.media.updatedAt])
    );
  }

  async readResumeFile(): Promise<PublicFileRead | null> {
    const row = await this.database.resumeVersion.findFirst({
      where: {
        activatedAt: { not: null },
        retiredAt: null,
        mediaAsset: {
          is: {
            kind: "DOCUMENT",
            processingState: "VERIFIED",
            archivedAt: null,
          },
        },
      },
      orderBy: { activatedAt: "desc" },
      select: {
        publicFilename: true,
        updatedAt: true,
        mediaAsset: {
          select: {
            storageKey: true,
            displayName: true,
            mimeType: true,
            byteSize: true,
            checksumSha256: true,
            updatedAt: true,
          },
        },
      },
    });
    if (row === null) return null;
    return this.createVerifiedPdf(
      row.mediaAsset,
      row.publicFilename ?? row.mediaAsset.displayName,
      latestDate([row.updatedAt, row.mediaAsset.updatedAt])
    );
  }

  private createVerifiedPdf(
    record: {
      readonly storageKey: string;
      readonly mimeType: string;
      readonly byteSize: bigint;
      readonly checksumSha256: string;
    },
    filename: string,
    lastModified: Date
  ): PublicFileRead {
    if (record.mimeType !== "application/pdf") {
      throw new Error("A public document record is not a verified PDF.");
    }
    const expectedSize = Number(record.byteSize);
    if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) {
      throw new Error("A public document record has an invalid byte size.");
    }
    return {
      filename,
      mimeType: "application/pdf",
      checksumSha256: record.checksumSha256,
      lastModified,
      readBytes: async () => {
        const bytes = await this.media.read(record.storageKey);
        if (bytes.byteLength !== expectedSize) {
          throw new Error(
            "A public document object does not match its metadata."
          );
        }
        return bytes;
      },
    };
  }
}

/**
 * An unfinished certificate must not decide whether the home page renders, so
 * the caller excludes a record without an English translation instead of
 * failing the whole read.
 */
function findTranslation<T extends Translation>(
  translations: readonly T[],
  locale: Locale
): T | null {
  return (
    translations.find((translation) => translation.locale === locale) ??
    translations.find((translation) => translation.locale === "en") ??
    null
  );
}

function resolveQuoteText(value: unknown, locale: Locale): string {
  const map = quoteTextMapSchema.parse(value);
  const resolved = map[locale] ?? map.en;
  if (resolved === undefined) {
    throw new Error("Public quote data is missing its English text.");
  }
  return resolved;
}

function selectQuote<T extends { readonly pinned: boolean }>(
  quotes: readonly T[],
  now: Date
): T | undefined {
  if (quotes.length === 0) return undefined;
  const pinned = quotes.find((quote) => quote.pinned);
  if (pinned !== undefined) return pinned;
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  const current = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const dayIndex = Math.floor((current - start) / 86_400_000);
  return quotes[dayIndex % quotes.length];
}

function dateOnly(value: Date): string {
  return value.toISOString().substring(0, 10);
}

function latestDate(values: readonly Date[]): Date {
  if (values.length === 0) return new Date(0);
  return new Date(Math.max(...values.map((value) => value.getTime())));
}
