"use client";

import quotes from "@/DataBase/DailyQuote.json";

type Quote = {
  id: number;
  text: string;
  author: string;
};

export default function DailyQuote() {
  const today = new Date();
  const start = new Date(today.getFullYear(), 0, 0);
  const diff = today.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);

  const index = dayOfYear % quotes.length;
  const quote: Quote = quotes[index];

  return (
    <div className="Container backdrop-blur-sm border my-10 p-6">
      <p className="italic">"{quote.text}"</p>
      <p className="mt-4 text-sm text-right">— {quote.author}</p>
    </div>
  );
}
