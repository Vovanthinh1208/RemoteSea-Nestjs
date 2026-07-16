import { Controller, Get, Header, Query } from "@nestjs/common";
import { TaxonomyService } from "./taxonomy.service";
import { listSkillsSchema, type ListSkillsDto } from "./dto/list-skills.dto";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { ApiListSkills, ApiTaxonomyTag } from "./docs/taxonomy.swagger";

@ApiTaxonomyTag()
@Controller("skills")
export class SkillsController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  // CDN caches per-URL, so ?q= variants each get their own 5-min entry —
  // bounded by the CDN's own eviction, unlike the in-memory cache this
  // endpoint deliberately does NOT use for q (see taxonomy.service.ts).
  @ApiListSkills()
  @Get()
  @Header(
    "Cache-Control",
    "public, max-age=0, s-maxage=300, stale-while-revalidate=60",
  )
  list(@Query(new ZodValidationPipe(listSkillsSchema)) query: ListSkillsDto) {
    return this.taxonomyService.listSkills(query.q);
  }
}
