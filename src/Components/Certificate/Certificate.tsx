import certificates from "@/DataBase/Certificate.json";
import ScrambleText from "../UI/ScrumbleText/ScrumbleText";
import Devider from "../UI/Devider/Devider";
import Button from "../UI/Buttons/CustomBTN";
import AnimatedLink from "../UI/Links/Links";
import Label from "./Label";

type CertificateType = {
  id: number;
  title: string;
  description: string;
  teacher: string;
  teacherLink: string;
  score: string;
  institute: string;
  instituteLink: string;
  filePath: string;
  date: string;
};

const Certificate = () => {
  const Certificates: CertificateType[] = certificates;

  return (
    <section
      className="Container backdrop-blur-sm p-2 border my-10"
      id="certificates"
    >
      <ScrambleText text="Certificates" className="text-3xl ml-3" speed={30} />
      <Devider />
      <div className="space-y-8 px-6 my-6">
        {Certificates.map((cert) => (
          <div key={cert.id} className="p-6 shadow-lg border">
            <h2 className="text-xl font-bold">{cert.title}</h2>
            <p className="text-sm mt-1">{cert.description}</p>

            <div className="mt-3 flex flex-col gap-2">
              <AnimatedLink href={cert.teacherLink}>
                Teacher: {cert.teacher}
              </AnimatedLink>
              <AnimatedLink href={cert.instituteLink}>
                Institute: {cert.institute}
              </AnimatedLink>

              <Label>Score: {cert.score}</Label>
              <Label>Date: {cert.date}</Label>
            </div>

            <a href={cert.filePath} download>
              <Button className="mt-4">Download Certificate</Button>
            </a>
          </div>
        ))}
      </div>
    </section>
  );
};

export default Certificate;
