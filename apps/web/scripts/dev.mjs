import { resolve } from "node:path";

// Next treats apps/web as its project root, while the monorepo keeps the
// shared local-development environment at the repository root. Load it into
// this process before importing the CLI so Next and its worker processes see
// the same values as the API.
process.loadEnvFile(resolve(import.meta.dirname, "../../../.env"));
const rawArguments = process.argv.slice(2).filter((arg) => arg !== "--");
const hasHost = rawArguments.some(
  (arg) =>
    arg === "-H" ||
    arg === "--hostname" ||
    arg.startsWith("-H=") ||
    arg.startsWith("--hostname=")
);
const hostArguments = hasHost
  ? []
  : ["-H", process.env.HOST?.trim() || "localhost"];

process.argv = [
  process.argv0,
  "next",
  "dev",
  "--turbopack",
  ...hostArguments,
  ...rawArguments,
];

await import("next/dist/bin/next");
