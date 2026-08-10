"use client";

import { motion } from "framer-motion";
import ScrambleText from "../UI/ScrumbleText/ScrumbleText";
import Devider from "../UI/Devider/Devider";
import Button from "../UI/Buttons/CustomBTN";
import AnimatedLink from "../UI/Links/Links";
import Label from "./Label";
import { CertificateType } from "./Types";

const CertificatesSection = ({
  certificates,
}: {
  readonly certificates: readonly CertificateType[];
}) => {
  return (
    <section
      className="Container my-10 border p-2 backdrop-blur-sm"
      id="certificates"
    >
      <ScrambleText text="Certificates" className="ml-3 text-3xl" speed={30} />
      <Devider />

      <div className="my-6 grid grid-cols-1 gap-2 px-1 sm:grid-cols-2 md:gap-4 md:px-4 lg:grid-cols-3 lg:gap-6 lg:px-6">
        {certificates.map((cert) => (
          <motion.div
            key={cert.id}
            className="border p-6 shadow-lg"
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            viewport={{ once: true, amount: 0.2 }}
          >
            <h2 className="mb-2 text-xl font-bold">{cert.title}</h2>
            <p className="text-secondary/70 mb-4 text-sm">{cert.description}</p>

            <div className="mb-4 flex flex-col gap-2">
              <AnimatedLink href={cert.teacherLink}>
                Teacher: {cert.teacher}
              </AnimatedLink>
              <AnimatedLink href={cert.instituteLink}>
                Institute: {cert.institute}
              </AnimatedLink>

              <Label>Score: {cert.score}</Label>
              <Label>Date: {cert.date}</Label>
            </div>

            <div className="flex gap-4">
              <a href={cert.filePath} download>
                <Button>Download Certificate</Button>
              </a>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
export default CertificatesSection;
