import { Controller, Get } from "@nestjs/common";
import { TaxonomyService } from "./taxonomy.service";

@Controller("categories")
export class CategoriesController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  @Get()
  list() {
    return this.taxonomyService.listCategories();
  }
}
