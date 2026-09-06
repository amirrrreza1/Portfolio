import {
  buildTaxonomyMetadata,
  assertTaxonomyExists,
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

export default async function BlogTagPage(
  props: Readonly<{
    params: TaxonomyRouteParams;
    searchParams: TaxonomyRouteSearch;
  }>
) {
  await assertTaxonomyExists("tag", props.params, props.searchParams);
  return (
    <TaxonomyRoute
      kind="tag"
      params={props.params}
      searchParams={props.searchParams}
    />
  );
}
