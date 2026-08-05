import { Download } from "lucide-react";
import Button from "../UI/Buttons/CustomBTN";
import Link from "next/link";

const DownloadResume = () => {
  return (
    <section className="Container backdrop-blur-sm p-6 border my-10 flex justify-center items-center">
      <Button className="flex items-center gap-2">
        <Link href="/resume.pdf" download className="flex items-center gap-2">
          <Download size={18} />
          <p>Download Resume</p>
        </Link>
      </Button>
    </section>
  );
};

export default DownloadResume;
