"use client";

import { motion } from "framer-motion";
import certificates from "@/DataBase/Certificate.json";
import ScrambleText from "../UI/ScrumbleText/ScrumbleText";
import Devider from "../UI/Devider/Devider";
import Button from "../UI/Buttons/CustomBTN";
import AnimatedLink from "../UI/Links/Links";
import Label from "./Label";
import { CertificateType } from "./Types";

const Certificates = certificates as CertificateType[];

const CertificatesSection = () => {
  return (
    <section
      className="Container backdrop-blur-sm p-2 border my-10"
      id="certificates"
    >
      <ScrambleText text="Certificates" className="text-3xl ml-3" speed={30} />
      <Devider />

      <div className="grid gap-6 px-6 my-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {Certificates.map((cert) => (
          <motion.div
            key={cert.id}
            className="p-6 shadow-lg border"
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            viewport={{ once: true, amount: 0.2 }}
          >
            <h2 className="text-xl font-bold mb-2">{cert.title}</h2>
            <p className="text-sm text-secondary/70 mb-4">{cert.description}</p>

            <div className="flex flex-col gap-2 mb-4">
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
