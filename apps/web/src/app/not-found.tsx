"use client";

import Link from "next/link";
import ScrambleText from "@/Components/UI/ScrumbleText/ScrumbleText";
import Devider from "@/Components/UI/Devider/Devider";
import Button from "@/Components/UI/Buttons/CustomBTN";

export default function NotFound() {
  return (
    <main className="flex h-dvh items-center justify-center px-4">
      <section className="Container w-full max-w-2xl border p-8 text-center backdrop-blur-sm">
        <ScrambleText
          text="404"
          className="mb-2 text-6xl font-bold"
          speed={50}
        />

        <Devider />

        <div className="my-8">
          <p className="mb-4 text-xl leading-7">
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
