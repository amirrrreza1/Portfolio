import type { PublicQuote } from "@portfolio/contracts/portfolio";

export default function DailyQuote({
  quote,
}: {
  readonly quote: PublicQuote | null;
}) {
  if (quote === null) return null;

  return (
    <div className="Container my-10 border p-6 backdrop-blur-sm">
      <q className="italic">{quote.text}</q>
      {quote.author === null ? null : (
        <p className="mt-4 text-right text-sm">— {quote.author}</p>
      )}
    </div>
  );
}
