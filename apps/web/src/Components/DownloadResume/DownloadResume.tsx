import { Download } from "lucide-react";
import Button from "../UI/Buttons/CustomBTN";
import Link from "next/link";
import type { PublicResume } from "@portfolio/contracts/portfolio";
import type { Locale } from "@portfolio/contracts/common";
import { getMessages } from "@/i18n/messages";

const DownloadResume = ({
  resume,
  locale,
}: {
  readonly resume: PublicResume | null;
  readonly locale: Locale;
}) => {
  if (resume === null) return null;
  return (
    <section className="Container my-10 flex items-center justify-center border p-6 backdrop-blur-sm">
      <Button className="flex items-center gap-2">
        <Link
          href={resume.downloadPath}
          download={resume.filename}
          className="flex items-center gap-2"
        >
          <Download size={18} />
          <p>
            {getMessages(locale).resume.download} {resume.label}
          </p>
        </Link>
      </Button>
    </section>
  );
};

export default DownloadResume;
