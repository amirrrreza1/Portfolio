import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const footerPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/Components/Layout/Footer/Footer.tsx"
);
const buttonPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/Components/UI/Buttons/CustomBTN.tsx"
);

describe("footer actions", () => {
  it("uses the shared project button for Blog and Donate", async () => {
    const [footer, button] = await Promise.all([
      readFile(footerPath, "utf8"),
      readFile(buttonPath, "utf8"),
    ]);

    expect(footer).toContain('href={localePath(locale, "blog")}');
    expect(footer).toContain(
      'import Button from "@/Components/UI/Buttons/CustomBTN"'
    );
    expect(footer.match(/<Button/g)).toHaveLength(2);
    expect(footer.match(/asChild/g)).toHaveLength(2);
    expect(footer.match(/size="sm"/g)).toHaveLength(2);
    expect(footer).not.toContain("min-h-");
    expect(footer).not.toContain("!py-");
    expect(footer).not.toContain("leading-");
    expect(button).toContain('sm: "h-8 px-3 py-0 text-sm leading-none"');
    expect(button).toContain('md: "px-6 py-2 text-sm leading-5"');
  });
});
