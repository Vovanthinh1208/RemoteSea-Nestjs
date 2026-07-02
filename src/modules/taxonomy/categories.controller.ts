import { Controller, Get } from "@nestjs/common";
import { TaxonomyService } from "./taxonomy.service";
import { ApiListCategories, ApiTaxonomyTag } from "./docs/taxonomy.swagger";

@ApiTaxonomyTag()
@Controller("categories")
export class CategoriesController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  @ApiListCategories()
  @Get()
  list() {
    return this.taxonomyService.listCategories();
  }
}
