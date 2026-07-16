import { Controller, Get, Header } from "@nestjs/common";
import { TaxonomyService } from "./taxonomy.service";
import { ApiListCategories, ApiTaxonomyTag } from "./docs/taxonomy.swagger";

@ApiTaxonomyTag()
@Controller("categories")
export class CategoriesController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  // Admin-managed reference data (5-min server cache) — same TTL for CDN edges.
  @ApiListCategories()
  @Get()
  @Header(
    "Cache-Control",
    "public, max-age=0, s-maxage=300, stale-while-revalidate=60",
  )
  list() {
    return this.taxonomyService.listCategories();
  }
}
