import { Download } from "lucide-react";
import Button from "../UI/Buttons/CustomBTN";
import Link from "next/link";
import type { PublicResume } from "@portfolio/contracts/portfolio";

const DownloadResume = ({
  resume,
  buttonLabel,
}: {
  readonly resume: PublicResume | null;
  readonly buttonLabel: string;
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
            {buttonLabel} {resume.label}
          </p>
        </Link>
      </Button>
    </section>
  );
};

export default DownloadResume;
