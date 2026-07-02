import { Controller, Get, Query } from "@nestjs/common";
import { TaxonomyService } from "./taxonomy.service";
import { listSkillsSchema, type ListSkillsDto } from "./dto/list-skills.dto";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { ApiListSkills, ApiTaxonomyTag } from "./docs/taxonomy.swagger";

@ApiTaxonomyTag()
@Controller("skills")
export class SkillsController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  @ApiListSkills()
  @Get()
  list(@Query(new ZodValidationPipe(listSkillsSchema)) query: ListSkillsDto) {
    return this.taxonomyService.listSkills(query.q);
  }
}
