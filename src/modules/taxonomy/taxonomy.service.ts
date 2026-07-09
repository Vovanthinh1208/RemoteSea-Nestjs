import { Injectable } from "@nestjs/common";
import { TaxonomyRepository } from "./taxonomy.repository";

@Injectable()
export class TaxonomyService {
  constructor(private readonly taxonomyRepository: TaxonomyRepository) {}

  listCategories() {
    return this.taxonomyRepository.findAllCategories();
  }

  listSkills(q?: string) {
    return this.taxonomyRepository.findSkills(
      q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    );
  }
}
