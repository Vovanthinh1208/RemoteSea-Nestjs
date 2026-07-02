import { Controller, Get, Query } from "@nestjs/common";
import { TaxonomyService } from "./taxonomy.service";
import { listSkillsSchema, type ListSkillsDto } from "./dto/list-skills.dto";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";

@Controller("skills")
export class SkillsController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listSkillsSchema)) query: ListSkillsDto) {
    return this.taxonomyService.listSkills(query.q);
  }
}
