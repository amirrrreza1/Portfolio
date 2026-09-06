export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `/` is a negotiation-only route redirected by the proxy. Canonical
  // locale pages own their header/footer and data source; rendering legacy
  // shell data here would make an unreachable redirect target a second source.
  return children;
}
