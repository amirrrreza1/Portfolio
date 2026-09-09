import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src"
);

describe("fixed hero boundary", () => {
  it("keeps the canonical hero copy in the component instead of CMS content", async () => {
    const hero = await readFile(
      path.join(sourceRoot, "Components/Hero/Hero.tsx"),
      "utf8"
    );
    const homePage = await readFile(
      path.join(sourceRoot, "features/home/HomePage.tsx"),
      "utf8"
    );

    expect(hero).toContain('["Hello There!", "I am Amirreza Azarioun"]');
    expect(hero).toContain('"A Developer / Student / Learner"');
    expect(hero).toContain("Read the Blog");
    expect(hero).toContain('localePath(locale, "blog")');
    expect(hero).toContain('import Button from "../UI/Buttons/CustomBTN"');
    expect(hero).toContain("<Button");
    expect(hero).toContain("asChild");
    expect(hero).toContain('size="sm"');
    expect(hero.indexOf("<RubikCube />")).toBeLessThan(hero.indexOf("<Link"));
    expect(hero).toContain("whitespace-nowrap");
    expect(hero).toContain("min-h-7");
    expect(hero).not.toContain("section.content");
    const fixedOrder = [
      "<Hero locale={locale} />",
      "<DailyQuote",
      "<AboutMe",
      "<Skills",
      "<ProjectsSection",
      "<Certificate",
      "<DownloadResume",
      "<GetInTouchForm",
    ].map((value) => homePage.indexOf(value));
    expect(fixedOrder.every((position) => position >= 0)).toBe(true);
    expect(fixedOrder).toEqual([...fixedOrder].sort((a, b) => a - b));
    expect(homePage).not.toContain("site.sections.map");
  });

  it("keeps fixed interface controls out of the portfolio editor", async () => {
    const editor = await readFile(
      path.join(sourceRoot, "features/admin/AdminPortfolioEditor.tsx"),
      "utf8"
    );

    expect(editor).toContain('title="About content"');
    expect(editor).not.toContain('label="Typed lines"');
    expect(editor).not.toContain('label="Typing speed (ms)"');
    expect(editor).not.toContain('title="Appearance options"');
    expect(editor).not.toContain('title="Header navigation"');
    expect(editor).not.toContain('title="Page sections"');
    expect(editor).not.toContain('label="Resume button label"');
    expect(editor).not.toContain('label="Footer rights text"');
    expect(editor).not.toContain('label="Section title"');
    expect(editor).not.toContain('label="Show this section"');
    expect(editor).not.toContain(
      "adminRequest(`/admin/sections/${section.id}`, {"
    );
    expect(editor).not.toContain("adminRequest<Appearance>");
    expect(editor).not.toContain("adminRequest<readonly NavItem[]>");
  });

  it("hard-codes headings, navigation, contact copy, and resume copy", async () => {
    const [
      about,
      skills,
      projects,
      certificates,
      contact,
      resume,
      header,
      footer,
    ] = await Promise.all([
      readFile(path.join(sourceRoot, "Components/AboutMe/AboutMe.tsx"), "utf8"),
      readFile(path.join(sourceRoot, "Components/Skills/Skills.tsx"), "utf8"),
      readFile(
        path.join(sourceRoot, "Components/Projects/Projects.tsx"),
        "utf8"
      ),
      readFile(
        path.join(sourceRoot, "Components/Certificate/Certificate.tsx"),
        "utf8"
      ),
      readFile(
        path.join(sourceRoot, "Components/GetInTouch/GetInTouch.tsx"),
        "utf8"
      ),
      readFile(
        path.join(sourceRoot, "Components/DownloadResume/DownloadResume.tsx"),
        "utf8"
      ),
      readFile(
        path.join(sourceRoot, "Components/Layout/Header/Header.tsx"),
        "utf8"
      ),
      readFile(
        path.join(sourceRoot, "Components/Layout/Footer/Footer.tsx"),
        "utf8"
      ),
    ]);

    expect(about).toContain('text="About Me"');
    expect(skills).toContain('text="Skills"');
    expect(projects).toContain('text="Projects"');
    expect(certificates).toContain('text="Certificates"');
    expect(contact).toContain('getMessages("en")');
    expect(resume).toContain("getMessages(locale).resume.download");
    expect(header).toContain("const PORTFOLIO_NAVIGATION");
    expect(header).not.toContain("PublicNavItem");
    expect(footer).toContain("messages.footer.rights");
    expect(footer).not.toContain("settings.footerRights");
  });

  it("offers a labelled blog destination in the portfolio header", async () => {
    const header = await readFile(
      path.join(sourceRoot, "Components/Layout/Header/Header.tsx"),
      "utf8"
    );

    expect(header).toContain('href={localePath(locale, "blog")}');
    expect(header).toContain("{messages.blog.title}");
    expect(header).toContain("<BookOpen");
    expect(header).toContain(
      'import Button from "@/Components/UI/Buttons/CustomBTN"'
    );
    expect(header).toContain("<Button");
    expect(header).toContain("asChild");
    expect(header).toContain('size="sm"');
    expect(header).not.toContain("min-h-");
  });
});
