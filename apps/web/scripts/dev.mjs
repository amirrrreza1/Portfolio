import { resolve } from "node:path";

// Next treats apps/web as its project root, while the monorepo keeps the
// shared local-development environment at the repository root. Load it into
// this process before importing the CLI so Next and its worker processes see
// the same values as the API.
process.loadEnvFile(resolve(import.meta.dirname, "../../../.env"));
const forwardedArguments = process.argv.slice(2);
process.argv = [
  process.argv0,
  "next",
  "dev",
  "--turbopack",
  ...forwardedArguments,
];

await import("next/dist/bin/next");
