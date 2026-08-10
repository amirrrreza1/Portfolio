"use client";

import { Quote } from "./Types";

export default function DailyQuote({
  quotes,
}: {
  readonly quotes: readonly Quote[];
}) {
  const today = new Date();
  const start = new Date(today.getFullYear(), 0, 0);
  const diff = today.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);

  const index = dayOfYear % quotes.length;
  const quote: Quote = quotes[index];

  return (
    <div className="Container my-10 border p-6 backdrop-blur-sm">
      <q className="italic">{quote.text}</q>
      <p className="mt-4 text-right text-sm">— {quote.author}</p>
    </div>
  );
}
