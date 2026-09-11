-- Project cards and skills are text-only. Removing these foreign keys leaves
-- the media objects themselves intact in the library so existing uploads are
-- not destroyed when their obsolete references disappear.
ALTER TABLE "projects" DROP CONSTRAINT "projects_imageId_fkey";
ALTER TABLE "skills" DROP CONSTRAINT "skills_iconMediaId_fkey";

ALTER TABLE "projects" DROP COLUMN "imageId";
ALTER TABLE "skills" DROP COLUMN "iconMediaId";
