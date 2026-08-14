import Link from "next/link";
import ScrambleText from "@/Components/UI/ScrumbleText/ScrumbleText";
import Devider from "@/Components/UI/Devider/Devider";
import Button from "@/Components/UI/Buttons/CustomBTN";
import { getMessages } from "@/i18n/messages";
import { localePath } from "@/i18n/routing";
import { isLocale } from "@portfolio/contracts/common";
import { headers } from "next/headers";

export default async function NotFound() {
  const localeHeader = (await headers()).get("x-portfolio-locale");
  const locale = isLocale(localeHeader) ? localeHeader : "en";
  const messages = getMessages(locale).notFound;
  return (
    <main className="flex h-dvh items-center justify-center px-4">
      <section className="Container w-full max-w-2xl border p-8 text-center backdrop-blur-sm">
        <h1 className="sr-only">{messages.title}</h1>
        <div aria-hidden="true">
          <ScrambleText
            text="404"
            className="mb-2 text-6xl font-bold"
            speed={50}
          />
        </div>

        <Devider />

        <div className="my-8">
          <p className="mb-4 text-xl leading-7">{messages.lead}</p>
          <p>{messages.description}</p>
        </div>

        <Devider />

        <Button className="mt-8">
          <Link href={localePath(locale)}>{messages.returnHome}</Link>
        </Button>
      </section>
    </main>
  );
}
