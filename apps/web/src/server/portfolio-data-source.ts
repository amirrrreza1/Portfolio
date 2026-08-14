export type PortfolioDataSource = "database" | "legacy";

export function parsePortfolioDataSource(
  input: string | undefined
): PortfolioDataSource {
  const value = input?.trim() || "legacy";
  if (value === "database" || value === "legacy") return value;
  throw new Error(
    'PORTFOLIO_DATA_SOURCE must be either "database" or "legacy".'
  );
}
