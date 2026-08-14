"use client";

import { motion } from "framer-motion";
import ScrambleText from "../UI/ScrumbleText/ScrumbleText";
import Devider from "../UI/Devider/Devider";
import Button from "../UI/Buttons/CustomBTN";
import AnimatedLink from "../UI/Links/Links";
import Label from "./Label";
import type { PublicCertificate } from "@portfolio/contracts/portfolio";
import type { Locale } from "@portfolio/contracts/common";
import { getMessages } from "@/i18n/messages";
import { formatPublicDate } from "@/i18n/format";

const CertificatesSection = ({
  title,
  certificates,
  locale,
}: {
  readonly title: string;
  readonly certificates: readonly PublicCertificate[];
  readonly locale: Locale;
}) => {
  const messages = getMessages(locale);
  return (
    <section
      className="Container my-10 border p-2 backdrop-blur-sm"
      id="certificates"
    >
      <ScrambleText text={title} className="ml-3 text-3xl" speed={30} />
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
            {cert.description === null ? null : (
              <p className="text-secondary/70 mb-4 text-sm">
                {cert.description}
              </p>
            )}

            <div className="mb-4 flex flex-col gap-2">
              {cert.instructorName === null ? null : cert.instructorUrl ===
                null ? (
                <Label>
                  {messages.certificates.instructor}: {cert.instructorName}
                </Label>
              ) : (
                <AnimatedLink href={cert.instructorUrl}>
                  {messages.certificates.instructor}: {cert.instructorName}
                </AnimatedLink>
              )}
              {cert.issuerUrl === null ? (
                <Label>
                  {messages.certificates.issuer}: {cert.issuerName}
                </Label>
              ) : (
                <AnimatedLink href={cert.issuerUrl}>
                  {messages.certificates.issuer}: {cert.issuerName}
                </AnimatedLink>
              )}

              {cert.scoreText === null ? null : (
                <Label>
                  {messages.certificates.score}: {cert.scoreText}
                </Label>
              )}
              <Label>
                {messages.certificates.date}:{" "}
                <time dateTime={cert.issuedAt}>
                  {formatPublicDate(cert.issuedAt, locale)}
                </time>
              </Label>
            </div>

            <div className="flex gap-4">
              <a href={cert.downloadPath} download>
                <Button>{messages.certificates.download}</Button>
              </a>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
export default CertificatesSection;
