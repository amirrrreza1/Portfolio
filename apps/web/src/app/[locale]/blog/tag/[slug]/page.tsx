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
  return buildTaxonomyMetadata("tag", props.params, props.searchParams);
}

export default function BlogTagPage(
  props: Readonly<{
    params: TaxonomyRouteParams;
    searchParams: TaxonomyRouteSearch;
  }>
) {
  return (
    <TaxonomyRoute
      kind="tag"
      params={props.params}
      searchParams={props.searchParams}
    />
  );
}
