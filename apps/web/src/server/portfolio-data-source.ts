export type PortfolioDataSource = "database" | "legacy";

export function parsePortfolioDataSource(
  input: string | undefined
): PortfolioDataSource {
  // Database cutover is complete. The legacy adapter now exists only as an
  // explicit, time-bounded rollback path; an omitted deployment variable must
  // never silently put production back on repository JSON.
  const value = input?.trim() || "database";
  if (value === "database" || value === "legacy") return value;
  throw new Error(
    'PORTFOLIO_DATA_SOURCE must be either "database" or "legacy".'
  );
}
