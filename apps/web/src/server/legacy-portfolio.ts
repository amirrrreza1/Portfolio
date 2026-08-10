import "server-only";

import certificates from "@/DataBase/Certificate.json";
import projects from "@/DataBase/Projects.json";
import quotes from "@/DataBase/DailyQuote.json";
import skills from "@/DataBase/Skills.json";
import type { CertificateType } from "@/Components/Certificate/Types";
import type { Quote } from "@/Components/DailyQuote/Types";
import type { Projects } from "@/Components/Projects/Types";
import type { SkillCategory } from "@/Components/Skills/Types";

/**
 * Temporary M4 rollback adapter. The public route imports only this server
 * module; once the API source lands, this is the sole legacy-read switch.
 */
export function getLegacyPortfolioData(): {
  readonly projects: readonly Projects[];
  readonly skills: readonly SkillCategory[];
  readonly certificates: readonly CertificateType[];
  readonly quotes: readonly Quote[];
} {
  return {
    projects: projects as Projects[],
    skills: skills as SkillCategory[],
    certificates: certificates as CertificateType[],
    quotes: quotes as Quote[],
  };
}
