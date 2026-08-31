import {
  buildTaxonomyMetadata,
  TaxonomyRoute,
  type TaxonomyRouteParams,
  type TaxonomyRouteSearch,
} from "@/features/blog/TaxonomyRoute";
import type { Metadata } from "next";

export function generateMetadata(
  props: Readonly<{
    params: TaxonomyRouteParams;
    searchParams: TaxonomyRouteSearch;
  }>
): Promise<Metadata> {
  return buildTaxonomyMetadata("category", props.params, props.searchParams);
}

export default function BlogCategoryPage(
  props: Readonly<{
    params: TaxonomyRouteParams;
    searchParams: TaxonomyRouteSearch;
  }>
) {
  return (
    <TaxonomyRoute
      kind="category"
      params={props.params}
      searchParams={props.searchParams}
    />
  );
}
