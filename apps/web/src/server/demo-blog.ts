import {
  publicArticleDetailItemSchema,
  publicArticleListSchema,
  type PublicArticleDetailItem,
  type PublicArticleList,
} from "@portfolio/contracts/blog";
import type { Locale } from "@portfolio/contracts/common";

const articles: Readonly<Record<Locale, PublicArticleDetailItem>> = {
  en: publicArticleDetailItemSchema.parse({
    id: "00000000-0000-4000-8000-000000000901",
    slug: "building-a-readable-blog-page",
    title: "Building a Readable Blog Page",
    excerpt:
      "Demo content for checking typography, spacing, navigation, and contrast across the blog experience.",
    publishedAt: "2026-09-09T09:00:00.000Z",
    updatedAt: "2026-09-09T09:00:00.000Z",
    readingMinutes: 3,
    authorName: "Amirreza Azarioun",
    categoryKey: null,
    tagKeys: [],
    featured: true,
    seoTitle: "Building a Readable Blog Page",
    seoDescription:
      "A development-only article for testing the portfolio blog layout and reading experience.",
    canonicalUrl: null,
    socialImage: null,
    renderedHtml: `
      <h2 id="why-this-demo-exists">Why this demo exists</h2>
      <p>This article gives the blog a realistic mix of headings, paragraphs, lists, quotes, and code. It makes visual issues easier to spot before real content is published.</p>
      <h2 id="readability-checklist">Readability checklist</h2>
      <ul>
        <li>The text remains clear over the animated page background.</li>
        <li>Headings create an obvious reading hierarchy.</li>
        <li>Links and controls are easy to find in both themes.</li>
        <li>The layout stays comfortable on narrow screens.</li>
      </ul>
      <blockquote><p>A good reading surface should make the content feel effortless.</p></blockquote>
      <h3 id="small-code-sample">Small code sample</h3>
      <pre class="code-block"><code>const readable = contrast &amp;&amp; spacing &amp;&amp; typography;</code></pre>
      <p>If every item above is easy to scan, the blog shell is ready for real articles.</p>
    `,
    headings: [
      { depth: 2, id: "why-this-demo-exists", text: "Why this demo exists" },
      { depth: 2, id: "readability-checklist", text: "Readability checklist" },
      { depth: 3, id: "small-code-sample", text: "Small code sample" },
    ],
    alternates: [
      { locale: "en", slug: "building-a-readable-blog-page" },
      { locale: "fa", slug: "ساخت-صفحه-خوانا-برای-وبلاگ" },
    ],
  }),
  fa: publicArticleDetailItemSchema.parse({
    id: "00000000-0000-4000-8000-000000000901",
    slug: "ساخت-صفحه-خوانا-برای-وبلاگ",
    title: "ساخت یک صفحه خوانا برای وبلاگ",
    excerpt:
      "محتوای آزمایشی برای بررسی تایپوگرافی، فاصله‌ها، ناوبری و کنتراست در بخش وبلاگ.",
    publishedAt: "2026-09-09T09:00:00.000Z",
    updatedAt: "2026-09-09T09:00:00.000Z",
    readingMinutes: 3,
    authorName: "Amirreza Azarioun",
    categoryKey: null,
    tagKeys: [],
    featured: true,
    seoTitle: "ساخت یک صفحه خوانا برای وبلاگ",
    seoDescription:
      "یک مقاله آزمایشی برای بررسی چیدمان و تجربه مطالعه در وبلاگ نمونه‌کار.",
    canonicalUrl: null,
    socialImage: null,
    renderedHtml: `
      <h2 id="هدف-این-نمونه">هدف این نمونه</h2>
      <p>این مقاله ترکیبی واقعی از عنوان‌ها، پاراگراف‌ها، فهرست، نقل‌قول و کد را نمایش می‌دهد تا مشکلات ظاهری پیش از انتشار محتوای اصلی مشخص شوند.</p>
      <h2 id="فهرست-خوانایی">فهرست بررسی خوانایی</h2>
      <ul>
        <li>متن روی پس‌زمینه متحرک واضح باقی بماند.</li>
        <li>عنوان‌ها ساختار مطالعه را به‌خوبی نشان دهند.</li>
        <li>پیوندها و کنترل‌ها در هر دو پوسته دیده شوند.</li>
        <li>چیدمان در صفحه‌های باریک نیز راحت باشد.</li>
      </ul>
      <blockquote><p>یک صفحه مطالعه خوب باید محتوا را بدون زحمت در اختیار خواننده بگذارد.</p></blockquote>
      <h3 id="نمونه-کد-کوتاه">نمونه کد کوتاه</h3>
      <pre class="code-block"><code>const readable = contrast &amp;&amp; spacing &amp;&amp; typography;</code></pre>
      <p>اگر همه بخش‌های بالا به‌راحتی خوانده شوند، پوسته وبلاگ برای مقاله‌های واقعی آماده است.</p>
    `,
    headings: [
      { depth: 2, id: "هدف-این-نمونه", text: "هدف این نمونه" },
      { depth: 2, id: "فهرست-خوانایی", text: "فهرست بررسی خوانایی" },
      { depth: 3, id: "نمونه-کد-کوتاه", text: "نمونه کد کوتاه" },
    ],
    alternates: [
      { locale: "en", slug: "building-a-readable-blog-page" },
      { locale: "fa", slug: "ساخت-صفحه-خوانا-برای-وبلاگ" },
    ],
  }),
};

export function isDemoBlogEnabled(): boolean {
  return process.env.PORTFOLIO_DEMO_BLOG === "true";
}

export function getDemoArticle(locale: Locale): PublicArticleDetailItem {
  return articles[locale];
}

export function getDemoArticleList(locale: Locale): PublicArticleList {
  const article = getDemoArticle(locale);
  return publicArticleListSchema.parse({
    locale,
    posts: [
      {
        id: article.id,
        slug: article.slug,
        title: article.title,
        excerpt: article.excerpt,
        publishedAt: article.publishedAt,
        updatedAt: article.updatedAt,
        readingMinutes: article.readingMinutes,
        authorName: article.authorName,
        categoryKey: article.categoryKey,
        tagKeys: article.tagKeys,
        featured: article.featured,
      },
    ],
  });
}
