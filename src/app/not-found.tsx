"use client";

import Link from "next/link";
import ScrambleText from "@/Components/UI/ScrumbleText/ScrumbleText";
import Devider from "@/Components/UI/Devider/Devider";
import Button from "@/Components/UI/Buttons/CustomBTN";

export default function NotFound() {
  return (
    <main className="h-dvh flex items-center justify-center px-4">
      <section className="Container backdrop-blur-sm p-8 border max-w-2xl w-full text-center">
        <ScrambleText
          text="404"
          className="text-6xl font-bold mb-2"
          speed={50}
        />

        <Devider />

        <div className="my-8">
          <p className="text-xl leading-7 mb-4">
            Oops! It seems you have wandered into uncharted territory.
          </p>
          <p>
            The page you are looking for does not exist or has been moved to a
            different coordinate.
          </p>
        </div>

        <Devider />

        <Button className="mt-8">
          <Link href="/">Return Home</Link>
        </Button>
      </section>
    </main>
  );
}
