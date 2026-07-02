import { Module } from "@nestjs/common";
import { CategoriesController } from "./categories.controller";
import { SkillsController } from "./skills.controller";
import { TaxonomyService } from "./taxonomy.service";
import { TaxonomyRepository } from "./taxonomy.repository";

@Module({
  controllers: [CategoriesController, SkillsController],
  providers: [TaxonomyService, TaxonomyRepository],
  exports: [TaxonomyService],
})
export class TaxonomyModule {}
