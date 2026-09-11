export function AdminPageHeader({
  eyebrow,
  title,
}: {
  readonly eyebrow: string;
  readonly title: string;
}): React.JSX.Element {
  return (
    <header>
      <p className="text-accent mb-2 text-sm font-medium">{eyebrow}</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h1>
    </header>
  );
}

export function AdminPageSurface({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <section className="border-border bg-surface rounded-xl border p-4 sm:p-6 lg:p-8">
      {children}
    </section>
  );
}
