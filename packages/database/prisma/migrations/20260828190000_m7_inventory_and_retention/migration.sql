-- Complete M7's inventory mapping and record the retention policy that gates
-- exposure of audit history. Existing translations receive the current
-- locale-specific source copy so applying this migration changes no public
-- wording.

ALTER TABLE "site_settings"
  ADD COLUMN "auditRetentionDays" INTEGER NOT NULL DEFAULT 400;

ALTER TABLE "site_settings"
  ADD CONSTRAINT "site_settings_audit_retention_bounded"
  CHECK ("auditRetentionDays" BETWEEN 30 AND 3650);

ALTER TABLE "site_settings_translations"
  ADD COLUMN "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "footerLines" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "footerRights" TEXT NOT NULL DEFAULT 'All rights reserved',
  ADD COLUMN "resumeButtonLabel" TEXT NOT NULL DEFAULT 'Download Resume';

UPDATE "site_settings_translations"
SET
  "keywords" = ARRAY[
    'Amirreza Azarioun', 'Portfolio', 'Web Developer', 'Frontend',
    'React', 'Next.js', 'JavaScript', 'TypeScript'
  ],
  "footerLines" = ARRAY[]::TEXT[],
  "footerRights" = 'All rights reserved',
  "resumeButtonLabel" = 'Download Resume'
WHERE "locale" = 'en';

UPDATE "site_settings_translations"
SET
  "keywords" = ARRAY[
    'امیررضا آذریون', 'نمونه کار', 'توسعه‌دهنده وب', 'فرانت‌اند',
    'React', 'Next.js', 'JavaScript', 'TypeScript'
  ],
  "footerLines" = ARRAY[]::TEXT[],
  "footerRights" = 'تمامی حقوق محفوظ است',
  "resumeButtonLabel" = 'دانلود رزومه'
WHERE "locale" = 'fa';

UPDATE "page_section_translations" AS translation
SET "content" = CASE translation."locale"
  WHEN 'fa' THEN '{
    "nameLabel":"نام",
    "namePlaceholder":"نام شما",
    "emailLabel":"ایمیل",
    "emailPlaceholder":"you@example.com",
    "messageLabel":"پیام",
    "messagePlaceholder":"پیام خود را بنویسید…",
    "sendingLabel":"در حال ارسال…",
    "submitLabel":"ارسال پیام",
    "successMessage":"سپاس؛ پیام شما دریافت شد.",
    "failureMessage":"مشکلی پیش آمد. لطفاً کمی بعد دوباره تلاش کنید.",
    "invalidNameMessage":"یک نام معتبر وارد کنید.",
    "invalidEmailMessage":"یک ایمیل معتبر وارد کنید.",
    "invalidMessageMessage":"پیام باید بین ۱۰ تا ۵۰۰۰ نویسه باشد."
  }'::jsonb
  ELSE '{
    "nameLabel":"Name",
    "namePlaceholder":"Your name",
    "emailLabel":"Email",
    "emailPlaceholder":"you@example.com",
    "messageLabel":"Message",
    "messagePlaceholder":"Write your message…",
    "sendingLabel":"Sending…",
    "submitLabel":"Send message",
    "successMessage":"Thanks — your message has been received.",
    "failureMessage":"Something went wrong. Please try again in a moment.",
    "invalidNameMessage":"Enter a valid name.",
    "invalidEmailMessage":"Enter a valid email address.",
    "invalidMessageMessage":"Enter a message between 10 and 5,000 characters."
  }'::jsonb
END
FROM "page_sections" AS section
WHERE translation."sectionId" = section."id"
  AND section."key" = 'contact';
