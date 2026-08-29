\echo ===== 1. rows that block post_translations_render_cache_provenance =====
SELECT count(*) AS blocking_rows
FROM "post_translations"
WHERE "renderedHtml" IS NOT NULL
  AND NOT (
    "rendererVersion" IS NOT NULL
    AND "bodyMarkdown" IS NOT NULL
    AND "bodySha256" ~ '^[0-9a-f]{64}$'
  );

\echo ===== 2. shape of every post_translations row =====
SELECT "status",
       ("bodyMarkdown"    IS NOT NULL) AS has_markdown,
       ("renderedHtml"    IS NOT NULL) AS has_render,
       ("rendererVersion" IS NOT NULL) AS has_renderer_version,
       ("bodySha256"      IS NOT NULL) AS has_sha,
       count(*)
FROM "post_translations"
GROUP BY 1,2,3,4,5
ORDER BY 1;

\echo ===== 3. rows that would block post_translations_published_has_source =====
SELECT count(*) AS blocking_published
FROM "post_translations"
WHERE "status" = 'PUBLISHED'
  AND NOT (
    "bodyMarkdown" IS NOT NULL
    AND octet_length("bodyMarkdown") > 0
    AND "bodySha256" ~ '^[0-9a-f]{64}$'
  );

\echo ===== 4. what else is in this database =====
SELECT 'post_translations' AS t, count(*) FROM "post_translations"
UNION ALL SELECT 'posts',           count(*) FROM "posts"
UNION ALL SELECT 'users',           count(*) FROM "users"
UNION ALL SELECT 'webauthn_creds',  count(*) FROM "webauthn_credentials"
UNION ALL SELECT 'recovery_codes',  count(*) FROM "recovery_codes"
UNION ALL SELECT 'projects',        count(*) FROM "projects"
UNION ALL SELECT 'skills',          count(*) FROM "skills"
UNION ALL SELECT 'certificates',    count(*) FROM "certificates"
UNION ALL SELECT 'media_assets',    count(*) FROM "media_assets"
UNION ALL SELECT 'page_sections',   count(*) FROM "page_sections"
ORDER BY 1;
